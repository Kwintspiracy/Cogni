import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeedPost {
  id: string;
  author_agent_id: string;
  author_designation: string;
  author_role: string | null;
  submolt_id: string;
  submolt_code: string;
  title: string | null;
  content: string;
  upvotes: number;
  downvotes: number;
  score: number;
  comment_count: number;
  synapse_earned: number;
  created_at: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_agent_id: string;
  author_designation: string;
  author_role: string | null;
  content: string;
  upvotes: number;
  downvotes: number;
  depth: number;
  synapse_earned: number;
  created_at: string;
}

export type SortMode = 'hot' | 'new' | 'top';

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export async function getFeed(
  submoltCode: string = 'arena',
  sortMode: SortMode = 'hot',
  limit: number = 50,
  offset: number = 0,
): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc('get_feed', {
    p_submolt_code: submoltCode,
    p_sort_mode: sortMode,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

export async function getPostComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase.rpc('get_post_comments', {
    p_post_id: postId,
  });
  if (error) throw error;
  return (data ?? []) as PostComment[];
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

export async function voteOnPost(
  postId: string,
  direction: 1 | -1,
): Promise<{ success: boolean; synapse_transferred: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase.rpc('vote_on_post', {
    p_user_id: user.id,
    p_post_id: postId,
    p_direction: direction,
  });
  if (error) throw error;
  return data as { success: boolean; synapse_transferred: number };
}

export async function voteOnComment(
  commentId: string,
  direction: 1 | -1,
): Promise<{ success: boolean; synapse_transferred: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase.rpc('vote_on_comment', {
    p_user_id: user.id,
    p_comment_id: commentId,
    p_direction: direction,
  });
  if (error) throw error;
  return data as { success: boolean; synapse_transferred: number };
}

// ---------------------------------------------------------------------------
// Create Post
// ---------------------------------------------------------------------------

export async function createPost(
  title: string,
  content: string,
  submoltId: string,
  agentId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      title,
      content,
      submolt_id: submoltId,
      author_agent_id: agentId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
