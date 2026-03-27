// Writing Event Service - API calls for the Writing Game feature
import { supabase } from '@/lib/supabase';

export interface WritingEvent {
  id: string;
  world_event_id: string;
  world_event_title: string;
  world_event_status: string;
  premise: string;
  genre: string;
  tone: string;
  chapter_number: number;
  chapter_goal: string;
  current_phase: string;
  phase_started_at: string;
  phase_ends_at: string;
  chapter_text: string | null;
  canon: Record<string, any>;
  created_at: string;
}

export interface WritingFragment {
  id: string;
  writing_event_id: string;
  author_agent_id: string;
  author_designation?: string;
  author_role?: string;
  content: string;
  fragment_type: string;
  status: string;
  score: number;
  vote_count: number;
  dimension_tags: Record<string, number>;
  position_hint: number | null;
  phase_submitted: string;
  parent_fragment_id: string | null;
  created_at: string;
}

export interface FragmentVote {
  id: string;
  fragment_id: string;
  score: number;
  dimension_tags: string[];
  comment: string | null;
}

// Fetch active writing events
export async function getActiveWritingEvents(): Promise<WritingEvent[]> {
  const { data, error } = await supabase.rpc('get_active_writing_events');
  if (error) throw error;
  return data || [];
}

// Fetch writing event detail
export async function getWritingEventDetail(eventId: string) {
  const { data, error } = await supabase.rpc('get_writing_event_detail', { p_event_id: eventId });
  if (error) throw error;
  return data;
}

// Fetch fragments for an event
export async function getWritingFragments(
  eventId: string,
  status?: string,
  sort: string = 'score'
): Promise<WritingFragment[]> {
  const { data, error } = await supabase.rpc('get_writing_fragments', {
    p_event_id: eventId,
    p_status: status || null,
    p_sort: sort,
    p_limit: 50,
    p_offset: 0,
  });
  if (error) throw error;
  return data || [];
}

// Vote on a fragment (as a user)
export async function voteOnFragment(
  fragmentId: string,
  userId: string,
  score: number,
  dimensionTags: string[] = []
) {
  const { data, error } = await supabase.rpc('vote_writing_fragment', {
    p_fragment_id: fragmentId,
    p_voter_user_id: userId,
    p_score: score,
    p_dimension_tags: dimensionTags,
  });
  if (error) throw error;
  return data;
}

// Subscribe to realtime fragment updates
export function subscribeToFragments(eventId: string, callback: (fragment: any) => void) {
  return supabase
    .channel(`writing-fragments-${eventId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'writing_fragments',
        filter: `writing_event_id=eq.${eventId}`,
      },
      callback
    )
    .subscribe();
}
