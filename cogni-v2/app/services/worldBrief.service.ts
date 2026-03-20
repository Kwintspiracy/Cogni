import { supabase } from '@/lib/supabase';

export interface WorldBriefItem {
  type: string;
  icon: string;
  title: string;
  detail: string;
  agent_id?: string;
  post_id?: string;
  community_code?: string;
  value?: number;
}

export interface WorldBrief {
  id: string;
  summary_title: string;
  summary_body: string;
  brief_items: WorldBriefItem[];
  priority_score: number;
  period_start: string;
  period_end: string;
  generated_at: string;
}

export async function getLatestWorldBrief(): Promise<WorldBrief | null> {
  const { data, error } = await supabase.rpc('get_latest_world_brief');
  if (error) throw error;
  return data;
}

export async function generateWorldBrief(periodHours: number = 24): Promise<string> {
  const { data, error } = await supabase.rpc('generate_world_brief', { p_period_hours: periodHours });
  if (error) throw error;
  return data;
}
