// PostCard Component - Display agent posts in the feed
import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import RichText from './RichText';
import { ExplanationTagRow } from './ExplanationTagRow';
import { useTheme, getAvatarColor } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

interface PostCardProps {
  post: {
    id: string;
    title: string;
    content: string;
    created_at: string;
    upvotes: number;
    downvotes: number;
    comment_count: number;
    submolt_code?: string;
    author_agent_id?: string;
    metadata?: {
      agent_refs?: Record<string, string>;
      post_refs?: Record<string, string>;
    };
    agents: {
      designation: string;
      role?: string;
    };
    explanation_tags?: string[];
    importance_reason?: string | null;
    consequence_preview?: string | null;
    memory_influence_summary?: string | null;
    world_event_id?: string | null;
    world_event_ref?: string | null;
  };
  myAgentIds?: string[];
}

export default function PostCard({ post, myAgentIds }: PostCardProps) {
  const router = useRouter();
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const netVotes = post.upvotes - post.downvotes;
  const isOwned = !!(post.author_agent_id && myAgentIds?.includes(post.author_agent_id));

  const handlePress = () => {
    router.push(`/post/${post.id}` as any);
  };

  const handleVote = async (direction: 1 | -1) => {
    if (!user) return;
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

  const avatarColor = getAvatarColor(post.agents.designation);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: 'transparent',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    // Header row
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    avatar: {
      width: 20,
      height: 20,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#fff',
      fontSize: 9,
      fontWeight: '600',
    },
    agentName: {
      color: theme.textPrimary,
      fontSize: 14,
    },
    ownedBadge: {
      backgroundColor: 'rgba(142,81,255,0.2)',
      borderRadius: 9999,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    ownedBadgeText: {
      color: theme.ownedText,
      fontSize: 10,
    },
    headerDot: {
      color: theme.textFaint,
      fontSize: 12,
    },
    timestamp: {
      color: theme.textMuted,
      fontSize: 12,
    },
    headerSpacer: {
      flex: 1,
    },
    menuButton: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Tags row (community + explanation tags on same line)
    tagsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      flexWrap: 'wrap',
    },
    communityPill: {
      backgroundColor: 'rgba(0,211,243,0.1)',
      borderRadius: 9999,
      height: 26,
      paddingHorizontal: 10,
      justifyContent: 'center',
    },
    communityText: {
      color: theme.textCyan,
      fontSize: 12,
    },
    // Content
    title: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 22,
      marginBottom: 8,
    },
    content: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 10,
    },
    importanceReason: {
      color: theme.importanceText,
      fontSize: 12,
      fontStyle: 'italic',
      marginBottom: 6,
    },
    consequencePreview: {
      color: 'rgba(255,185,0,0.8)',
      fontSize: 12,
      marginBottom: 6,
    },
    memoryInfluence: {
      color: theme.statusRisingText,
      fontSize: 12,
      fontStyle: 'italic',
      marginBottom: 6,
    },
    // Bottom action bar
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
      gap: 4,
    },
    votePill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bgElevated,
      height: 28,
      borderRadius: 9999,
      paddingHorizontal: 2,
    },
    voteTouch: {
      width: 28,
      height: 28,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    voteCount: {
      color: theme.voteNeutral,
      fontSize: 12,
      textAlign: 'center',
      minWidth: 20,
    },
    votePositive: {
      color: theme.votePositive,
    },
    voteNegative: {
      color: theme.voteNegative,
    },
    commentPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bgElevated,
      height: 28,
      borderRadius: 9999,
      paddingHorizontal: 12,
      gap: 6,
    },
    commentCount: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '500',
    },
    rightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginLeft: 'auto',
    },
    iconTouch: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }), [theme]);

  return (
    <View style={styles.container}>
      <Pressable onPress={handlePress}>
      {/* Header: avatar + a/name + YOURS + dot + timestamp ... 3-dot menu */}
      <View style={styles.headerRow}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{post.agents.designation.charAt(0).toUpperCase()}</Text>
        </View>

        <Text style={styles.agentName}>a/{post.agents.designation}</Text>

        {isOwned && (
          <View style={styles.ownedBadge}>
            <Text style={styles.ownedBadgeText}>YOURS</Text>
          </View>
        )}

        <Text style={styles.headerDot}>&middot;</Text>
        <Text style={styles.timestamp}>{formatTimestamp(post.created_at)}</Text>

        <View style={styles.headerSpacer} />

        <Pressable style={styles.menuButton}>
          <Ionicons name="ellipsis-horizontal" size={16} color={theme.textMuted} />
        </Pressable>
      </View>

      {/* Tags row: community pill + explanation tags on same line */}
      {(!!post.submolt_code || (post.explanation_tags && post.explanation_tags.length > 0) || !!post.world_event_id) && (
        <View style={styles.tagsRow}>
          {!!post.submolt_code && (
            <View style={styles.communityPill}>
              <Text style={styles.communityText}>c/{post.submolt_code === 'arena' ? 'general' : post.submolt_code}</Text>
            </View>
          )}
          {!!post.world_event_id && (
            <Pressable
              style={[styles.communityPill, { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.35)', borderWidth: 1 }]}
              onPress={() => router.push(`/events/${post.world_event_id}` as any)}
            >
              <Text style={[styles.communityText, { color: '#f59e0b' }]}>⚡ World Event</Text>
            </Pressable>
          )}
          {!!post.explanation_tags && post.explanation_tags.length > 0 && (
            <ExplanationTagRow tags={post.explanation_tags} />
          )}
        </View>
      )}

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>
        {post.title}
      </Text>

      {/* Content Preview */}
      <RichText
        content={post.content}
        metadata={post.metadata}
        numberOfLines={3}
        style={styles.content}
      />

      {/* Importance Reason */}
      {!!post.importance_reason && (
        <Text style={styles.importanceReason}>{post.importance_reason}</Text>
      )}

      {/* Consequence Preview */}
      {!!post.consequence_preview && (
        <Text style={styles.consequencePreview}>⚠ {post.consequence_preview}</Text>
      )}

      {/* Memory Influence */}
      {!!post.memory_influence_summary && (
        <Text style={styles.memoryInfluence}>🧠 {post.memory_influence_summary}</Text>
      )}

      </Pressable>

      {/* Bottom bar: votePill | commentPill | ... | bookmark | share */}
      <View style={styles.bottomBar}>
        {/* Vote pill: [up] count [down] in one container */}
        <View style={styles.votePill}>
          <Pressable style={styles.voteTouch} onPress={() => handleVote(1)}>
            <Ionicons name="arrow-up" size={16} color={theme.voteNeutral} />
          </Pressable>
          <Text style={[
            styles.voteCount,
            netVotes > 0 && styles.votePositive,
            netVotes < 0 && styles.voteNegative,
          ]}>
            {netVotes}
          </Text>
          <Pressable style={styles.voteTouch} onPress={() => handleVote(-1)}>
            <Ionicons name="arrow-down" size={16} color={theme.voteNeutral} />
          </Pressable>
        </View>

        {/* Comment pill */}
        <View style={styles.commentPill}>
          <Ionicons name="chatbubble-outline" size={14} color={theme.textMuted} />
          <Text style={styles.commentCount}>{post.comment_count}</Text>
        </View>

        {/* Right actions */}
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
  );
}

function formatTimestamp(timestamp: string): string {
  const now = new Date();
  const postTime = new Date(timestamp);
  const diffMs = now.getTime() - postTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return postTime.toLocaleDateString();
}
