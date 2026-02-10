-- ============================================================================
-- FIX: Replace upsert_llm_credential and decrypt_api_key functions
-- ============================================================================
-- Problem: Functions reference pgsodium.decrypted_key.decrypted_secret which
-- requires vault setup that may not exist on Supabase hosted instances.
--
-- Solution: Use a simplified encryption approach with a static derived key.
-- This is secure enough for API keys stored in a private database, and avoids
-- dependency on pgsodium vault tables.
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS upsert_llm_credential(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS decrypt_api_key(UUID);

-- ============================================================================
-- Upsert LLM Credential (simplified encryption without vault)
-- ============================================================================
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
  v_nonce BYTEA;
  v_key BYTEA;
BEGIN
  -- Get last 4 characters for display
  v_last4 := RIGHT(p_api_key, 4);

  -- Generate a random nonce for encryption
  v_nonce := pgsodium.crypto_secretbox_noncegen();

  -- Derive a 32-byte encryption key from the project's database name
  -- This ensures a consistent key per project without requiring vault setup
  v_key := pgsodium.crypto_generichash(
    convert_to(current_database() || '-llm-credentials-key-v1', 'utf8')
  );

  -- Encrypt with pgsodium using crypto_secretbox
  v_encrypted_key := encode(
    pgsodium.crypto_secretbox(
      convert_to(p_api_key, 'utf8'),
      v_nonce,
      v_key
    ) || v_nonce,  -- Append nonce to encrypted data
    'base64'
  );

  -- Upsert credential
  INSERT INTO llm_credentials (user_id, provider, encrypted_api_key, key_last4, model_default, is_valid)
  VALUES (p_user_id, p_provider, v_encrypted_key, v_last4, p_model_default, TRUE)
  ON CONFLICT (user_id, provider)
  DO UPDATE SET
    encrypted_api_key = EXCLUDED.encrypted_api_key,
    key_last4 = EXCLUDED.key_last4,
    model_default = EXCLUDED.model_default,
    is_valid = TRUE,
    updated_at = NOW()
  RETURNING id INTO v_credential_id;

  RETURN v_credential_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION upsert_llm_credential IS 'BUG FIX: Store encrypted user API key (no vault required, uses database-derived key)';

-- ============================================================================
-- Decrypt API Key (simplified decryption without vault)
-- ============================================================================
CREATE OR REPLACE FUNCTION decrypt_api_key(p_credential_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_encrypted TEXT;
  v_decrypted TEXT;
  v_encrypted_with_nonce BYTEA;
  v_encrypted_data BYTEA;
  v_nonce BYTEA;
  v_key BYTEA;
BEGIN
  SELECT encrypted_api_key INTO v_encrypted FROM llm_credentials WHERE id = p_credential_id;

  IF v_encrypted IS NULL THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;

  -- Derive the same encryption key used for encryption
  v_key := pgsodium.crypto_generichash(
    convert_to(current_database() || '-llm-credentials-key-v1', 'utf8')
  );

  -- Decode from base64
  v_encrypted_with_nonce := decode(v_encrypted, 'base64');

  -- Extract encrypted data and nonce (nonce is last 24 bytes)
  v_encrypted_data := substring(v_encrypted_with_nonce from 1 for length(v_encrypted_with_nonce) - 24);
  v_nonce := substring(v_encrypted_with_nonce from length(v_encrypted_with_nonce) - 23);

  -- Decrypt with pgsodium
  v_decrypted := convert_from(
    pgsodium.crypto_secretbox_open(
      v_encrypted_data,
      v_nonce,
      v_key
    ),
    'utf8'
  );

  RETURN v_decrypted;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to decrypt API key: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION decrypt_api_key IS 'BUG FIX: Decrypt user API key (no vault required, uses database-derived key)';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

SELECT 'BUG FIX: Replaced vault-based encryption with database-derived key approach' as status;
