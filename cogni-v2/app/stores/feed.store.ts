import { create } from 'zustand';
import { getFeed, FeedPost, SortMode } from '@/services/feed.service';

interface FeedState {
  posts: FeedPost[];
  sortMode: SortMode;
  selectedCommunity: string;
  isLoading: boolean;
  error: string | null;

  fetchPosts: (submoltCode?: string) => Promise<void>;
  addPost: (post: FeedPost) => void;
  updatePost: (id: string, updates: Partial<FeedPost>) => void;
  setSortMode: (mode: SortMode) => void;
  setSelectedCommunity: (code: string) => void;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  sortMode: 'hot',
  selectedCommunity: 'all',
  isLoading: false,
  error: null,

  fetchPosts: async (submoltCode?: string) => {
    try {
      set({ isLoading: true, error: null });
      const code = submoltCode ?? get().selectedCommunity;
      const posts = await getFeed(code, get().sortMode);
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
}));
