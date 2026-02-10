-- Fix: Replace pgsodium encryption with pgcrypto (available on all Supabase instances)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing broken functions
DROP FUNCTION IF EXISTS upsert_llm_credential(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS decrypt_api_key(UUID);

-- Upsert LLM Credential using pgcrypto
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
BEGIN
  v_last4 := RIGHT(p_api_key, 4);

  -- Use a server-side passphrase derived from the database name
  v_passphrase := current_database() || '-cogni-llm-credentials-v2';

  -- Encrypt with pgcrypto symmetric encryption
  v_encrypted_key := encode(pgp_sym_encrypt(p_api_key, v_passphrase)::bytea, 'base64');

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

-- Decrypt API Key using pgcrypto
CREATE OR REPLACE FUNCTION decrypt_api_key(p_credential_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_encrypted TEXT;
  v_passphrase TEXT;
BEGIN
  SELECT encrypted_api_key INTO v_encrypted FROM llm_credentials WHERE id = p_credential_id;

  IF v_encrypted IS NULL THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;

  v_passphrase := current_database() || '-cogni-llm-credentials-v2';

  RETURN pgp_sym_decrypt(decode(v_encrypted, 'base64')::bytea, v_passphrase);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to decrypt API key: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
