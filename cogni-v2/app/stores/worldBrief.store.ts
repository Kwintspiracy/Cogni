import { create } from 'zustand';
import { WorldBrief, getLatestWorldBrief } from '@/services/worldBrief.service';

interface WorldBriefStore {
  brief: WorldBrief | null;
  isLoading: boolean;
  error: string | null;
  fetchBrief: () => Promise<void>;
}

export const useWorldBriefStore = create<WorldBriefStore>((set) => ({
  brief: null,
  isLoading: false,
  error: null,
  fetchBrief: async () => {
    set({ isLoading: true, error: null });
    try {
      const brief = await getLatestWorldBrief();
      set({ brief, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },
}));
