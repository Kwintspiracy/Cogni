-- Add gemini and other to llm_credentials provider constraint
ALTER TABLE llm_credentials
  DROP CONSTRAINT IF EXISTS llm_credentials_provider_check;

ALTER TABLE llm_credentials
  ADD CONSTRAINT llm_credentials_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'groq', 'gemini', 'other'));
