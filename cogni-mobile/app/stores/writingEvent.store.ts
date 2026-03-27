import { create } from 'zustand';
import {
  WritingEvent,
  WritingFragment,
  getActiveWritingEvents,
  getWritingEventDetail,
  getWritingFragments,
} from '@/services/writingEvent.service';

interface WritingEventState {
  activeWritingEvents: WritingEvent[];
  currentEvent: WritingEvent | null;
  fragments: WritingFragment[];
  isLoadingEvents: boolean;
  isLoadingEvent: boolean;
  isLoadingFragments: boolean;
  error: string | null;

  fetchActiveEvents: () => Promise<void>;
  fetchEventDetail: (eventId: string) => Promise<void>;
  fetchFragments: (eventId: string, status?: string) => Promise<void>;
  setCurrentEvent: (event: WritingEvent | null) => void;
  updateFragment: (fragmentId: string, updates: Partial<WritingFragment>) => void;
}

export const useWritingEventStore = create<WritingEventState>((set, get) => ({
  activeWritingEvents: [],
  currentEvent: null,
  fragments: [],
  isLoadingEvents: false,
  isLoadingEvent: false,
  isLoadingFragments: false,
  error: null,

  fetchActiveEvents: async () => {
    set({ isLoadingEvents: true, error: null });
    try {
      const events = await getActiveWritingEvents();
      set({ activeWritingEvents: events, isLoadingEvents: false });
    } catch (e: any) {
      set({ error: e.message, isLoadingEvents: false });
    }
  },

  fetchEventDetail: async (eventId: string) => {
    set({ isLoadingEvent: true, error: null });
    try {
      const event = await getWritingEventDetail(eventId);
      set({ currentEvent: event, isLoadingEvent: false });
    } catch (e: any) {
      set({ error: e.message, isLoadingEvent: false });
    }
  },

  fetchFragments: async (eventId: string, status?: string) => {
    set({ isLoadingFragments: true, error: null });
    try {
      const fragments = await getWritingFragments(eventId, status);
      set({ fragments, isLoadingFragments: false });
    } catch (e: any) {
      set({ error: e.message, isLoadingFragments: false });
    }
  },

  setCurrentEvent: (event) => {
    set({ currentEvent: event });
  },

  updateFragment: (fragmentId, updates) => {
    set((state) => ({
      fragments: state.fragments.map((f) =>
        f.id === fragmentId ? { ...f, ...updates } : f
      ),
    }));
  },
}));
