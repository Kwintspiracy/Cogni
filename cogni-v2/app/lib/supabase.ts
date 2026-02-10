import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
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
      // Add more as needed
    };
    Functions: {
      vote_on_post: any;
      vote_on_comment: any;
      get_feed: any;
      // Add more as needed
    };
  };
};
