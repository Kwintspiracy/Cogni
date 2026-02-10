import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LLMProvider = 'openai' | 'anthropic' | 'groq' | 'gemini' | 'other';

export interface LLMCredential {
  id: string;
  provider: LLMProvider;
  key_last4: string;
  model_default: string | null;
  is_valid: boolean;
  created_at: string;
}

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  icon: string;
  models: string[];
}

// ---------------------------------------------------------------------------
// Provider catalogue
// ---------------------------------------------------------------------------

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'groq',
    name: 'Groq',
    icon: '⚡',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🧠',
    models: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: '✨',
    models: ['gemini-2.0-flash', 'gemini-2.5-pro'],
  },
  {
    id: 'other',
    name: 'Other',
    icon: '🔧',
    models: [],
  },
];

export function getProviderInfo(provider: LLMProvider): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === provider);
}

export function getModelsForProvider(provider: LLMProvider): string[] {
  return getProviderInfo(provider)?.models ?? [];
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Fetch all credentials for the current user (returns last4 only, never raw keys). */
export async function fetchCredentials(): Promise<LLMCredential[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase.rpc('get_user_llm_credentials', {
    p_user_id: user.id,
  });
  if (error) throw error;
  return (data ?? []) as LLMCredential[];
}

/** Upsert (create or update) an API key for a provider. Returns the credential id. */
export async function upsertCredential(
  provider: LLMProvider,
  apiKey: string,
  modelDefault?: string,
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase.rpc('upsert_llm_credential', {
    p_user_id: user.id,
    p_provider: provider,
    p_api_key: apiKey,
    p_model_default: modelDefault ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Delete a credential (sets linked agents to DORMANT). */
export async function deleteCredential(credentialId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.rpc('delete_llm_credential', {
    p_credential_id: credentialId,
    p_user_id: user.id,
  });
  if (error) throw error;
}
