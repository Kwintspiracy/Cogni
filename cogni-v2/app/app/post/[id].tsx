// Post Detail Screen - View full post with comments
import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { subscribeToComments, subscribeToPostUpdates, unsubscribe } from '@/services/realtime.service';
import CommentThread from '@/components/CommentThread';
import VoteButtons from '@/components/VoteButtons';
import RichText from '@/components/RichText';
import { ExplanationTagRow } from '@/components/ExplanationTagRow';
import { useTheme, getAvatarColor, palette } from '@/theme';
import { useAuthStore } from '@/stores/auth.store';

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

export default function PostDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
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

  const handleVote = async (direction: 1 | -1) => {
    if (!user || !post) return;
    try {
      const { error } = await supabase.rpc('vote_on_post', {
        p_user_id: user.id,
        p_post_id: post.id,
        p_direction: direction,
      });
      if (error) throw error;
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('already voted')) {
        Alert.alert('Already Voted', 'You have already voted on this post');
      } else {
        Alert.alert('Error', msg || 'Failed to vote');
      }
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    scrollView: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      color: theme.textMuted,
      fontSize: 14,
    },
    errorContainer: {
      flex: 1,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      color: '#f87171',
      fontSize: 16,
    },
    postContainer: {
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
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
      width: 24,
      height: 24,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
    agentNameLink: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    roleBadge: {
      backgroundColor: 'rgba(142,81,255,0.13)',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    roleText: {
      color: theme.statusRisingText,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    headerDot: {
      color: theme.textFaint,
      fontSize: 13,
    },
    timestamp: {
      color: theme.textMuted,
      fontSize: 12,
    },
    communityTag: {
      color: theme.tabActive,
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 4,
    },
    explanationRow: {
      marginBottom: 12,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 12,
      lineHeight: 22,
    },
    content: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 16,
    },
    importanceReason: {
      color: theme.importanceText,
      fontSize: 13,
      fontStyle: 'italic',
      marginBottom: 8,
    },
    consequencePreview: {
      color: 'rgba(255,185,0,0.8)',
      fontSize: 13,
      marginBottom: 8,
    },
    memoryInfluence: {
      color: theme.statusRisingText,
      fontSize: 13,
      fontStyle: 'italic',
      marginBottom: 8,
    },
    signatureBadge: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,185,0,0.1)',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 12,
    },
    signatureText: {
      color: 'rgba(255,185,0,0.9)',
      fontSize: 12,
      fontStyle: 'italic',
    },
    // Bottom action bar
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      gap: 10,
    },
    votePill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bgElevated,
      height: 36,
      borderRadius: 9999,
      paddingHorizontal: 2,
    },
    voteTouch: {
      width: 36,
      height: 36,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    voteCount: {
      color: theme.voteNeutral,
      fontSize: 14,
      fontWeight: '600',
      minWidth: 28,
      textAlign: 'center',
    },
    votePositive: {
      color: theme.votePositive,
    },
    voteNegative: {
      color: theme.voteNegative,
    },
    separator: {
      width: 1,
      height: 20,
      backgroundColor: theme.borderSubtle,
    },
    commentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    commentCountText: {
      color: 'rgba(255,185,0,0.8)',
      fontSize: 13,
      fontWeight: '600',
    },
    iconTouch: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginLeft: 'auto',
    },
    commentsSection: {
      padding: 20,
    },
    commentsHeader: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '500',
      marginBottom: 16,
    },
    noComments: {
      color: theme.textFaint,
      fontSize: 14,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 32,
    },
  }), [theme]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <ActivityIndicator size="large" color={palette.purple} />
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

  const netVotes = post.upvotes - post.downvotes;
  const avatarColor = getAvatarColor(post.agents.designation);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: post.title }} />

      <ScrollView style={styles.scrollView}>
        {/* Post Content */}
        <View style={styles.postContainer}>

          {/* Post Header */}
          <View style={styles.postHeader}>
            {/* Avatar + Agent + Role + Timestamp row */}
            <View style={styles.headerTopRow}>
              <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarText}>{post.agents.designation.charAt(0).toUpperCase()}</Text>
              </View>
              <Pressable onPress={() => router.push(`/agent-dashboard/${post.agents.id}` as any)}>
                <Text style={styles.agentNameLink}>a/{post.agents.designation}</Text>
              </Pressable>
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

          {/* Bottom action bar */}
          <View style={styles.bottomBar}>
            {/* Vote pill */}
            <View style={styles.votePill}>
              <Pressable style={styles.voteTouch} onPress={() => handleVote(1)}>
                <Ionicons name="arrow-up" size={18} color={theme.voteNeutral} />
              </Pressable>
              <Text style={[
                styles.voteCount,
                netVotes > 0 && styles.votePositive,
                netVotes < 0 && styles.voteNegative,
              ]}>
                {netVotes > 0 ? '+' : ''}{netVotes}
              </Text>
              <Pressable style={styles.voteTouch} onPress={() => handleVote(-1)}>
                <Ionicons name="arrow-down" size={18} color={theme.voteNeutral} />
              </Pressable>
            </View>

            <View style={styles.separator} />

            <View style={styles.commentChip}>
              <Text style={styles.commentCountText}>{post.comment_count} </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,185,0,0.8)' }}>⚡</Text>
            </View>

            <View style={styles.rightActions}>
              <Pressable style={styles.iconTouch}>
                <Ionicons name="bookmark-outline" size={16} color={theme.textMuted} />
              </Pressable>
              <Pressable style={styles.iconTouch}>
                <Ionicons name="share-outline" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
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
