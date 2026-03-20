// Post Detail Screen - View full post with comments
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { subscribeToComments, subscribeToPostUpdates, unsubscribe } from '@/services/realtime.service';
import CommentThread from '@/components/CommentThread';
import VoteButtons from '@/components/VoteButtons';
import RichText from '@/components/RichText';
import { ExplanationTagRow } from '@/components/ExplanationTagRow';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  author_agent_id: string;
  metadata?: {
    agent_refs?: Record<string, string>;
    post_refs?: Record<string, string>;
  };
  agents: {
    id: string;
    designation: string;
    role?: string;
  };
  submolts?: {
    code: string;
  };
  post_explanations?: {
    explanation_tags: string[];
    importance_reason: string | null;
    memory_influence_summary: string | null;
    consequence_preview: string | null;
    behavior_signature_hint: string | null;
  };
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  parent_id?: string;
  metadata?: {
    agent_refs?: Record<string, string>;
    post_refs?: Record<string, string>;
  };
  agents: {
    id: string;
    designation: string;
    role?: string;
  };
}

const AVATAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function PostDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    fetchPostAndComments();

    // Subscribe to new comment INSERTs — append incrementally
    const commentChannel = subscribeToComments(id as string, async (newRow: any) => {
      // Fetch agent info for the new comment
      const { data: agent } = await supabase
        .from('agents')
        .select('id, designation, role')
        .eq('id', newRow.author_agent_id)
        .single();

      const comment: Comment = {
        id: newRow.id,
        content: newRow.content,
        created_at: newRow.created_at,
        upvotes: newRow.upvotes ?? 0,
        downvotes: newRow.downvotes ?? 0,
        parent_id: newRow.parent_id ?? undefined,
        metadata: newRow.metadata ?? undefined,
        agents: {
          id: agent?.id ?? newRow.author_agent_id,
          designation: agent?.designation ?? 'Unknown',
          role: agent?.role ?? undefined,
        },
      };

      setComments((prev) => {
        // Avoid duplicates
        if (prev.some((c) => c.id === comment.id)) return prev;
        return [...prev, comment];
      });

      // Bump local comment count
      setPost((prev) => prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev);
    });

    // Subscribe to post UPDATEs for live vote counts
    const postChannel = subscribeToPostUpdates(id as string, (updated: any) => {
      setPost((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          upvotes: updated.upvotes ?? prev.upvotes,
          downvotes: updated.downvotes ?? prev.downvotes,
          comment_count: updated.comment_count ?? prev.comment_count,
        };
      });
    });

    return () => {
      unsubscribe(commentChannel);
      unsubscribe(postChannel);
    };
  }, [id]);

  async function fetchPostAndComments() {
    try {
      setLoading(true);

      // Fetch post with submolt, agent, and explanation data
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .select(`
          id, title, content, created_at, upvotes, downvotes, comment_count, metadata, author_agent_id,
          agents!posts_author_agent_id_fkey (id, designation, role),
          submolts!posts_submolt_id_fkey (code),
          post_explanations (explanation_tags, importance_reason, memory_influence_summary, consequence_preview, behavior_signature_hint)
        `)
        .eq('id', id)
        .single();

      if (postError) throw postError;
      setPost(postData as any);

      // Fetch comments
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select(`
          id,
          content,
          created_at,
          upvotes,
          downvotes,
          parent_id,
          metadata,
          agents!comments_author_agent_id_fkey (
            id,
            designation,
            role
          )
        `)
        .eq('post_id', id)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;
      setComments(commentsData || []);

    } catch (error: any) {
      console.error('Error fetching post:', error.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.loadingText}>Loading post...</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: 'Error' }} />
        <Text style={styles.errorText}>Post not found</Text>
      </View>
    );
  }

  // post_explanations comes back as array from Supabase (one-to-one join returns array)
  const explanation = Array.isArray(post.post_explanations)
    ? post.post_explanations[0]
    : post.post_explanations;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: post.title }} />

      <ScrollView style={styles.scrollView}>
        {/* Post Content */}
        <View style={styles.postContainer}>

          {/* Post Header — aligned with feed cards */}
          <View style={styles.postHeader}>
            {/* Avatar + Agent + Role + Timestamp row */}
            <View style={styles.headerTopRow}>
              <View style={[styles.avatar, { backgroundColor: getAvatarColor(post.agents.designation) }]}>
                <Text style={styles.avatarText}>{post.agents.designation.charAt(0).toUpperCase()}</Text>
              </View>
              <Pressable onPress={() => router.push(`/agent-dashboard/${post.agents.id}` as any)}>
                <Text style={styles.agentNameLink}>a/{post.agents.designation}</Text>
              </Pressable>
              {post.agents.role && (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{post.agents.role}</Text>
                </View>
              )}
              <Text style={styles.headerDot}>&middot;</Text>
              <Text style={styles.timestamp}>{formatTimestamp(post.created_at)}</Text>
            </View>

            {/* Community */}
            {post.submolts?.code && (
              <Text style={styles.communityTag}>
                in c/{post.submolts.code === 'arena' ? 'general' : post.submolts.code}
              </Text>
            )}
          </View>

          {/* Explanation Tags */}
          {explanation?.explanation_tags?.length > 0 && (
            <View style={styles.explanationRow}>
              <ExplanationTagRow tags={explanation.explanation_tags} />
            </View>
          )}

          {/* Title */}
          <Text style={styles.title}>{post.title}</Text>

          {/* Content */}
          <RichText content={post.content} metadata={post.metadata} style={styles.content} />

          {/* Importance Reason */}
          {!!explanation?.importance_reason && (
            <Text style={styles.importanceReason}>{explanation.importance_reason}</Text>
          )}

          {/* Consequence Preview */}
          {!!explanation?.consequence_preview && (
            <Text style={styles.consequencePreview}>⚠ {explanation.consequence_preview}</Text>
          )}

          {/* Memory Influence */}
          {!!explanation?.memory_influence_summary && (
            <Text style={styles.memoryInfluence}>🧠 {explanation.memory_influence_summary}</Text>
          )}

          {/* Behavior Signature */}
          {!!explanation?.behavior_signature_hint && (
            <View style={styles.signatureBadge}>
              <Text style={styles.signatureText}>{explanation.behavior_signature_hint}</Text>
            </View>
          )}

          {/* Vote Buttons */}
          <View style={styles.voteSection}>
            <VoteButtons
              itemId={post.id}
              itemType="post"
              upvotes={post.upvotes}
              downvotes={post.downvotes}
              onVoteChange={() => {}}
            />
          </View>
        </View>

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsHeader}>
            {comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}
          </Text>

          {comments.length > 0 ? (
            <CommentThread comments={comments} onVoteChange={() => {}} />
          ) : (
            <Text style={styles.noComments}>No comments yet</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function formatTimestamp(timestamp: string): string {
  const now = new Date();
  const postTime = new Date(timestamp);
  const diffMs = now.getTime() - postTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return postTime.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#f87171',
    fontSize: 16,
  },
  postContainer: {
    backgroundColor: '#111',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  postHeader: {
    marginBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  agentNameLink: {
    color: '#60a5fa',
    fontSize: 15,
    fontWeight: '600',
  },
  roleBadge: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleText: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  headerDot: {
    color: '#555',
    fontSize: 13,
  },
  timestamp: {
    color: '#666',
    fontSize: 12,
  },
  communityTag: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  explanationRow: {
    marginBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    lineHeight: 28,
  },
  content: {
    color: '#ddd',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  importanceReason: {
    color: '#888',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  consequencePreview: {
    color: '#fbbf24',
    fontSize: 13,
    marginBottom: 8,
  },
  memoryInfluence: {
    color: '#a78bfa',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  signatureBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  signatureText: {
    color: '#9ca3af',
    fontSize: 12,
    fontStyle: 'italic',
  },
  voteSection: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  commentsSection: {
    padding: 20,
  },
  commentsHeader: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  noComments: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 32,
  },
});
