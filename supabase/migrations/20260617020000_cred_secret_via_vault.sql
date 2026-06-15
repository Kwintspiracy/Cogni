-- ============================================================================
-- A2 (fix): move the BYO-key passphrase from a DB GUC to Supabase Vault.
--
-- Why: Supabase's `postgres` role is not a superuser, so
--   `ALTER DATABASE postgres SET app.cred_secret = ...` fails with 42501.
-- Supabase Vault (encrypted-at-rest secret store) is the supported way to keep
-- a secret out of source AND out of a plain pg_dump.
--
-- This supersedes the current_setting('app.cred_secret') approach from
-- 20260613030000. The encrypt/decrypt/reencrypt logic is otherwise identical:
--   • encrypt: use the vault secret if present, else the legacy passphrase.
--   • decrypt: try the vault secret first, fall back to legacy (backward compat).
--   • reencrypt_all_llm_credentials(): rotate all rows to the vault secret.
--
-- Deployment (run in the Supabase SQL Editor AFTER this migration):
--   1. SELECT vault.create_secret('<long-random-secret>', 'cred_secret');
--   2. SELECT reencrypt_all_llm_credentials();
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Best-effort: ensure Vault is available. If the role can't create it, the
-- migration still succeeds; enable it via Dashboard → Database → Extensions.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS supabase_vault;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not auto-enable supabase_vault (enable it in Dashboard → Database → Extensions): %', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- Helper: resolve the cred secret from Vault. Returns NULL if Vault is
-- unavailable or the secret is not set (callers then fall back to legacy).
-- SECURITY DEFINER so it reads vault.decrypted_secrets as the function owner.
-- Never granted to anon/authenticated — it returns the raw secret.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _resolve_cred_secret()
RETURNS TEXT AS $$
DECLARE
  v_secret TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'cred_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL; -- vault not available / not accessible
  END;
  RETURN v_secret;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION _resolve_cred_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _resolve_cred_secret() TO service_role;

-- ----------------------------------------------------------------------------
-- upsert_llm_credential: encrypt with the vault secret if set, else legacy
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

  v_secret := _resolve_cred_secret();
  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    v_passphrase := v_secret;
  ELSE
    v_passphrase := current_database() || '-cogni-llm-credentials-v2';
  END IF;

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
-- decrypt_api_key: try the vault secret first, fall back to legacy passphrase
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decrypt_api_key(p_credential_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_encrypted TEXT;
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
  v_secret := _resolve_cred_secret();

  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    BEGIN
      v_result := pgp_sym_decrypt(decode(v_encrypted, 'base64')::bytea, v_secret);
      RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- fall through to legacy
    END;
  END IF;

  BEGIN
    v_result := pgp_sym_decrypt(decode(v_encrypted, 'base64')::bytea, v_legacy_passphrase);
    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to decrypt API key: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- reencrypt_all_llm_credentials: rotate all rows to the vault secret
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
  v_new_secret := _resolve_cred_secret();
  IF v_new_secret IS NULL OR v_new_secret = '' THEN
    RAISE EXCEPTION 'cred_secret is not set in Vault. Run: SELECT vault.create_secret(''<secret>'', ''cred_secret'');';
  END IF;

  v_legacy_passphrase := current_database() || '-cogni-llm-credentials-v2';

  FOR v_row IN SELECT id, encrypted_api_key FROM llm_credentials LOOP
    BEGIN
      v_plain := pgp_sym_decrypt(decode(v_row.encrypted_api_key, 'base64')::bytea, v_new_secret);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        v_plain := pgp_sym_decrypt(decode(v_row.encrypted_api_key, 'base64')::bytea, v_legacy_passphrase);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not decrypt credential %, skipping: %', v_row.id, SQLERRM;
        CONTINUE;
      END;
    END;

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
  'Rotate all LLM credential rows to the Vault-stored cred_secret. '
  'Run AFTER: SELECT vault.create_secret(''<secret>'', ''cred_secret''); '
  'The secret must be stored securely (password manager) and NEVER committed.';

REVOKE EXECUTE ON FUNCTION reencrypt_all_llm_credentials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reencrypt_all_llm_credentials() TO service_role;
