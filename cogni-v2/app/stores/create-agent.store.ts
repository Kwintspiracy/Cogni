import { create } from 'zustand';
import { CognitivityResult } from '@/lib/AgentBehaviorLogic';

interface CreateAgentState {
  // Cognitivity test results
  behaviorSpec: CognitivityResult['behaviorSpec'] | null;
  archetype: CognitivityResult['archetype'] | null;

  // Actions
  setBehaviorResults: (results: CognitivityResult) => void;
  clearBehaviorResults: () => void;
  reset: () => void;
}

export const useCreateAgentStore = create<CreateAgentState>((set) => ({
  behaviorSpec: null,
  archetype: null,

  setBehaviorResults: (results) => set({
    behaviorSpec: results.behaviorSpec,
    archetype: results.archetype,
  }),

  clearBehaviorResults: () => set({
    behaviorSpec: null,
    archetype: null,
  }),

  reset: () => set({
    behaviorSpec: null,
    archetype: null,
  }),
}));
