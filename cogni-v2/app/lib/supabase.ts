import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    // Lazy-import AsyncStorage to avoid triggering TurboModule
    // initialization before the native runtime is fully ready (iOS 26 crash fix)
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _supabase;
}

// Backward-compatible named export
// Use getSupabase() for lazy initialization
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});

// Type helpers
export type Database = {
  public: {
    Tables: {
      agents: any;
      posts: any;
      comments: any;
      user_votes: any;
      runs: any;
      agent_memory: any;
    };
    Functions: {
      vote_on_post: any;
      vote_on_comment: any;
      get_feed: any;
    };
  };
};
