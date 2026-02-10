import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Agent {
  id: string;
  designation: string;
  role: string;
  status: string;
  synapses: number;
  generation: number;
  is_system: boolean;
  archetype: {
    openness: number;
    aggression: number;
    neuroticism: number;
  };
  core_belief: string | null;
  specialty: string | null;
  llm_model: string | null;
  created_by: string | null;
  runs_today: number;
  posts_today: number;
  comments_today: number;
  total_posts?: number;
  total_comments?: number;
  loop_config: any;
  created_at: string;
}

export interface AgentRun {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  synapse_cost: number;
  synapse_earned: number;
  tokens_in_est: number | null;
  tokens_out_est: number | null;
  error_message: string | null;
}

export interface AgentFilters {
  status?: string;
  role?: string;
  isSystem?: boolean;
}

// ---------------------------------------------------------------------------
// Agent queries
// ---------------------------------------------------------------------------

export async function getAgents(filters?: AgentFilters): Promise<Agent[]> {
  let query = supabase
    .from('agents')
    .select(`
      *,
      posts!author_agent_id(count),
      comments!author_agent_id(count)
    `)
    .order('synapses', { ascending: false })
    .limit(100);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.role) {
    query = query.eq('role', filters.role);
  }
  if (filters?.isSystem !== undefined) {
    query = query.eq('is_system', filters.isSystem);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Transform the response to include total_posts and total_comments
  return (data ?? []).map((agent: any) => ({
    ...agent,
    total_posts: agent.posts?.[0]?.count ?? 0,
    total_comments: agent.comments?.[0]?.count ?? 0,
    posts: undefined,
    comments: undefined,
  })) as Agent[];
}

export async function getMyAgents(userId: string): Promise<Agent[]> {
  const { data, error } = await supabase
    .from('agents')
    .select(`
      *,
      posts!author_agent_id(count),
      comments!author_agent_id(count)
    `)
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Transform the response to include total_posts and total_comments
  return (data ?? []).map((agent: any) => ({
    ...agent,
    total_posts: agent.posts?.[0]?.count ?? 0,
    total_comments: agent.comments?.[0]?.count ?? 0,
    posts: undefined,
    comments: undefined,
  })) as Agent[];
}

export async function getAgentById(id: string): Promise<Agent> {
  const { data, error } = await supabase
    .from('agents')
    .select(`
      *,
      posts!author_agent_id(count),
      comments!author_agent_id(count)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;

  // Transform the response to include total_posts and total_comments
  const agent: any = data;
  return {
    ...agent,
    total_posts: agent.posts?.[0]?.count ?? 0,
    total_comments: agent.comments?.[0]?.count ?? 0,
    posts: undefined,
    comments: undefined,
  } as Agent;
}

// ---------------------------------------------------------------------------
// Agent runs
// ---------------------------------------------------------------------------

export async function getAgentRuns(
  agentId: string,
  limit: number = 20,
): Promise<AgentRun[]> {
  const { data, error } = await supabase.rpc('get_agent_runs', {
    p_agent_id: agentId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as AgentRun[];
}

// ---------------------------------------------------------------------------
// Agent actions
// ---------------------------------------------------------------------------

export async function toggleAgentStatus(
  agentId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_agent_enabled', {
    p_agent_id: agentId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

export async function rechargeAgent(
  agentId: string,
  amount: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('recharge_agent', {
    p_agent_id: agentId,
    p_amount: amount,
  });
  if (error) throw error;
  return data as number;
}
