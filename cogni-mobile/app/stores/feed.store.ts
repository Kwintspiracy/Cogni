import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getFeed, FeedPost, SortMode } from '@/services/feed.service';

interface FeedState {
  posts: FeedPost[];
  sortMode: SortMode;
  selectedCommunity: string;
  isLoading: boolean;
  error: string | null;
  myAgentsFilter: boolean;
  myAgentIds: string[];
  _explanationChannel: RealtimeChannel | null;

  fetchPosts: (submoltCode?: string) => Promise<void>;
  addPost: (post: FeedPost) => void;
  updatePost: (id: string, updates: Partial<FeedPost>) => void;
  setSortMode: (mode: SortMode) => void;
  setSelectedCommunity: (code: string) => void;
  setMyAgentIds: (ids: string[]) => void;
  toggleMyAgentsFilter: () => void;
  subscribeToExplanations: () => void;
  unsubscribeFromExplanations: () => void;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  sortMode: 'hot',
  selectedCommunity: 'all',
  isLoading: false,
  error: null,
  myAgentsFilter: false,
  myAgentIds: [],
  _explanationChannel: null,

  fetchPosts: async (submoltCode?: string) => {
    try {
      set({ isLoading: true, error: null });
      const code = submoltCode ?? get().selectedCommunity;
      let posts = await getFeed(code, get().sortMode);
      if (get().myAgentsFilter && get().myAgentIds.length > 0) {
        const ids = get().myAgentIds;
        posts = posts.filter((p) => ids.includes(p.author_agent_id));
      }
      set({ posts, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  addPost: (post) => {
    set((state) => ({ posts: [post, ...state.posts] }));
  },

  updatePost: (id, updates) => {
    set((state) => ({
      posts: state.posts.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  },

  setSortMode: (mode) => {
    set({ sortMode: mode });
  },

  setSelectedCommunity: (code) => {
    set({ selectedCommunity: code });
    get().fetchPosts(code);
  },

  setMyAgentIds: (ids) => {
    set({ myAgentIds: ids });
  },

  toggleMyAgentsFilter: () => {
    set((state) => ({ myAgentsFilter: !state.myAgentsFilter }));
    get().fetchPosts();
  },

  subscribeToExplanations: () => {
    // Avoid duplicate subscriptions
    if (get()._explanationChannel) return;

    const channel = supabase
      .channel('post-explanations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_explanations',
        },
        (payload: any) => {
          const row = payload.new as {
            post_id: string;
            explanation_tags?: string[];
            importance_reason?: string | null;
            memory_influence_summary?: string | null;
            consequence_preview?: string | null;
            behavior_signature_hint?: string | null;
          };
          if (!row?.post_id) return;
          get().updatePost(row.post_id, {
            explanation_tags: row.explanation_tags,
            importance_reason: row.importance_reason,
            memory_influence_summary: row.memory_influence_summary,
            consequence_preview: row.consequence_preview,
            behavior_signature_hint: row.behavior_signature_hint,
          });
        },
      )
      .subscribe();

    set({ _explanationChannel: channel });
  },

  unsubscribeFromExplanations: () => {
    const channel = get()._explanationChannel;
    if (channel) {
      supabase.removeChannel(channel);
      set({ _explanationChannel: null });
    }
  },
}));
