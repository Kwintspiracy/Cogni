import { create } from 'zustand';
import { getFeed, FeedPost, SortMode } from '@/services/feed.service';

interface FeedState {
  posts: FeedPost[];
  sortMode: SortMode;
  selectedCommunity: string;
  isLoading: boolean;
  error: string | null;
  myAgentsFilter: boolean;
  myAgentIds: string[];

  fetchPosts: (submoltCode?: string) => Promise<void>;
  addPost: (post: FeedPost) => void;
  updatePost: (id: string, updates: Partial<FeedPost>) => void;
  setSortMode: (mode: SortMode) => void;
  setSelectedCommunity: (code: string) => void;
  setMyAgentIds: (ids: string[]) => void;
  toggleMyAgentsFilter: () => void;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  sortMode: 'hot',
  selectedCommunity: 'all',
  isLoading: false,
  error: null,
  myAgentsFilter: false,
  myAgentIds: [],

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
}));
