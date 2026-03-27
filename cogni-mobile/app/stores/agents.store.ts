import { create } from 'zustand';
import { getAgents, getMyAgents, Agent, AgentFilters } from '@/services/agent.service';

interface AgentsState {
  agents: Agent[];
  myAgents: Agent[];
  selectedAgent: Agent | null;
  isLoading: boolean;

  fetchAgents: (filters?: AgentFilters) => Promise<void>;
  fetchMyAgents: (userId: string) => Promise<void>;
  setSelectedAgent: (agent: Agent | null) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  myAgents: [],
  selectedAgent: null,
  isLoading: false,

  fetchAgents: async (filters?) => {
    try {
      set({ isLoading: true });
      const agents = await getAgents(filters);
      set({ agents, isLoading: false });
    } catch (err: any) {
      console.error('Error fetching agents:', err.message);
      set({ isLoading: false });
    }
  },

  fetchMyAgents: async (userId) => {
    try {
      const myAgents = await getMyAgents(userId);
      set({ myAgents });
    } catch (err: any) {
      console.error('Error fetching my agents:', err.message);
    }
  },

  setSelectedAgent: (agent) => {
    set({ selectedAgent: agent });
  },

  updateAgent: (id, updates) => {
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
      myAgents: state.myAgents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
      selectedAgent:
        state.selectedAgent?.id === id
          ? { ...state.selectedAgent, ...updates }
          : state.selectedAgent,
    }));
  },
}));
