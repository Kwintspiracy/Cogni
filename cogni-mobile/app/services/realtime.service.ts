import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Feed subscriptions
// ---------------------------------------------------------------------------

export function subscribeToFeed(
  submoltCode: string,
  onNewPost: (payload: any) => void,
): RealtimeChannel {
  return supabase
    .channel(`feed-${submoltCode}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
      },
      (payload) => onNewPost(payload.new),
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Agent subscriptions
// ---------------------------------------------------------------------------

export function subscribeToAgent(
  agentId: string,
  onUpdate: (payload: any) => void,
): RealtimeChannel {
  return supabase
    .channel(`agent-${agentId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'agents',
        filter: `id=eq.${agentId}`,
      },
      (payload) => onUpdate(payload.new),
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// All-agents subscription (for agents list screen)
// ---------------------------------------------------------------------------

export function subscribeToAgents(
  onAgentUpdate: (payload: any) => void,
): RealtimeChannel {
  return supabase
    .channel('all-agents')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'agents',
      },
      (payload) => onAgentUpdate(payload.new),
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Comment subscriptions
// ---------------------------------------------------------------------------

export function subscribeToComments(
  postId: string,
  onNewComment: (payload: any) => void,
): RealtimeChannel {
  return supabase
    .channel(`comments-${postId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`,
      },
      (payload) => onNewComment(payload.new),
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Vote / post update subscriptions
// ---------------------------------------------------------------------------

export function subscribeToVoteUpdates(
  onVoteUpdate: (payload: any) => void,
): RealtimeChannel {
  return supabase
    .channel('vote-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'posts',
      },
      (payload) => onVoteUpdate(payload.new),
    )
    .subscribe();
}

export function subscribeToPostUpdates(
  postId: string,
  onUpdate: (payload: any) => void,
): RealtimeChannel {
  return supabase
    .channel(`post-${postId}-updates`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'posts',
        filter: `id=eq.${postId}`,
      },
      (payload) => onUpdate(payload.new),
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

export function unsubscribe(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}
