-- ============================================================================
-- A2: BYO LLM key encryption — move passphrase to a database-level secret
-- (HIGH priority)
--
-- Strategy:
--   • Read passphrase from current_setting('app.cred_secret', true) when set.
--   • Fall back to legacy passphrase (current_database() || '-cogni-llm-credentials-v2')
--     when the setting is empty/missing, so existing live agents keep working.
--   • ENCRYPT: prefers new secret if configured, falls back gracefully.
--   • DECRYPT: tries new secret first; on any failure falls back to legacy
--     passphrase. This makes the transition backward-compatible — old rows
--     (encrypted with legacy passphrase) will continue to decrypt even after
--     the setting is configured, until reencrypt_all_llm_credentials() is run.
--   • reencrypt_all_llm_credentials(): admin helper to rotate all rows to the
--     new secret in one transaction. Run AFTER setting app.cred_secret.
--
-- Deployment steps (see DEPLOYMENT CHECKLIST):
--   1. ALTER DATABASE postgres SET app.cred_secret = '<long-random-secret>';
--   2. SELECT reencrypt_all_llm_credentials();
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper: resolve the active passphrase (new secret OR legacy fallback)
-- NOT exposed as a public function — used only within this migration's functions.

-- ----------------------------------------------------------------------------
-- upsert_llm_credential: encrypt with new secret if configured, else legacy
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_llm_credential(
  p_user_id UUID,
  p_provider TEXT,
  p_api_key TEXT,
  p_model_default TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_credential_id UUID;
  v_encrypted_key TEXT;
  v_last4 TEXT;
  v_passphrase TEXT;
  v_secret TEXT;
BEGIN
  v_last4 := RIGHT(p_api_key, 4);

  -- Prefer the externally-configured secret; fall back to legacy passphrase
  v_secret := current_setting('app.cred_secret', true);
  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    v_passphrase := v_secret;
  ELSE
    v_passphrase := current_database() || '-cogni-llm-credentials-v2';
  END IF;

  -- Encrypt with pgcrypto symmetric encryption
  v_encrypted_key := encode(pgp_sym_encrypt(p_api_key, v_passphrase)::bytea, 'base64');

  INSERT INTO llm_credentials (user_id, provider, encrypted_api_key, key_last4, model_default, is_valid)
  VALUES (p_user_id, p_provider, v_encrypted_key, v_last4, p_model_default, TRUE)
  ON CONFLICT (user_id, provider)
  DO UPDATE SET
    encrypted_api_key = EXCLUDED.encrypted_api_key,
    key_last4         = EXCLUDED.key_last4,
    model_default     = EXCLUDED.model_default,
    is_valid          = TRUE,
    updated_at        = NOW()
  RETURNING id INTO v_credential_id;

  RETURN v_credential_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- decrypt_api_key: try new secret first, fall back to legacy passphrase
-- Backward-compatible: rows encrypted with the old passphrase continue to work.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decrypt_api_key(p_credential_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_encrypted TEXT;
  v_passphrase TEXT;
  v_legacy_passphrase TEXT;
  v_secret TEXT;
  v_result TEXT;
BEGIN
  SELECT encrypted_api_key INTO v_encrypted
  FROM llm_credentials
  WHERE id = p_credential_id;

  IF v_encrypted IS NULL THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;

  v_legacy_passphrase := current_database() || '-cogni-llm-credentials-v2';
  v_secret := current_setting('app.cred_secret', true);

  -- Try new secret first (if configured)
  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    BEGIN
      v_result := pgp_sym_decrypt(decode(v_encrypted, 'base64')::bytea, v_secret);
      RETURN v_result;
    EXCEPTION
      WHEN OTHERS THEN
        -- New secret failed — row was likely encrypted with the legacy passphrase.
        -- Fall through to legacy attempt below.
        NULL;
    END;
  END IF;

  -- Try legacy passphrase (handles pre-rotation rows and the case where the
  -- setting is not yet configured)
  BEGIN
    v_result := pgp_sym_decrypt(decode(v_encrypted, 'base64')::bytea, v_legacy_passphrase);
    RETURN v_result;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to decrypt API key: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- reencrypt_all_llm_credentials: rotate all rows to the new secret
-- Must be run AFTER ALTER DATABASE postgres SET app.cred_secret = '...';
-- Only callable by service_role.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reencrypt_all_llm_credentials()
RETURNS INT AS $$
DECLARE
  v_row RECORD;
  v_plain TEXT;
  v_new_ciphertext TEXT;
  v_new_secret TEXT;
  v_legacy_passphrase TEXT;
  v_count INT := 0;
BEGIN
  v_new_secret := current_setting('app.cred_secret', true);
  IF v_new_secret IS NULL OR v_new_secret = '' THEN
    RAISE EXCEPTION 'app.cred_secret is not set. Run: ALTER DATABASE postgres SET app.cred_secret = ''<secret>'';';
  END IF;

  v_legacy_passphrase := current_database() || '-cogni-llm-credentials-v2';

  FOR v_row IN SELECT id, encrypted_api_key FROM llm_credentials LOOP
    -- Decrypt using backward-compatible logic (try new secret first, then legacy)
    BEGIN
      v_plain := pgp_sym_decrypt(decode(v_row.encrypted_api_key, 'base64')::bytea, v_new_secret);
    EXCEPTION
      WHEN OTHERS THEN
        BEGIN
          v_plain := pgp_sym_decrypt(decode(v_row.encrypted_api_key, 'base64')::bytea, v_legacy_passphrase);
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Could not decrypt credential %, skipping: %', v_row.id, SQLERRM;
            CONTINUE;
        END;
    END;

    -- Re-encrypt with the new secret
    v_new_ciphertext := encode(pgp_sym_encrypt(v_plain, v_new_secret)::bytea, 'base64');

    UPDATE llm_credentials
    SET encrypted_api_key = v_new_ciphertext,
        updated_at = NOW()
    WHERE id = v_row.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reencrypt_all_llm_credentials IS
  'Rotate all LLM credential rows to the new app.cred_secret passphrase. '
  'Run AFTER: ALTER DATABASE postgres SET app.cred_secret = ''<secret>''; '
  'WARNING: The secret must be stored securely (e.g. a password manager) and '
  'NEVER committed to source control.';

-- reencrypt is an admin/rotation utility — service_role only, never browser-callable
REVOKE EXECUTE ON FUNCTION reencrypt_all_llm_credentials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reencrypt_all_llm_credentials() TO service_role;
