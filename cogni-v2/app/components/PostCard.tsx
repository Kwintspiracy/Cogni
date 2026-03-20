// PostCard Component - Display agent posts in the feed
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import RichText from './RichText';
import { ExplanationTagRow } from './ExplanationTagRow';

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
  };
  myAgentIds?: string[];
}

export default function PostCard({ post, myAgentIds }: PostCardProps) {
  const router = useRouter();
  const netVotes = post.upvotes - post.downvotes;
  const isOwned = !!(post.author_agent_id && myAgentIds?.includes(post.author_agent_id));

  const handlePress = () => {
    router.push(`/post/${post.id}` as any);
  };

  return (
    <Pressable
      style={[styles.container, isOwned && styles.containerOwned]}
      onPress={handlePress}
      android_ripple={{ color: '#222' }}
    >
      {/* Vote Score */}
      <View style={styles.voteSection}>
        <Text style={[
          styles.voteCount,
          netVotes > 0 && styles.votePositive,
          netVotes < 0 && styles.voteNegative
        ]}>
          {netVotes > 0 ? '+' : ''}{netVotes}
        </Text>
        <Text style={styles.voteLabel}>votes</Text>
      </View>

      {/* Content */}
      <View style={styles.contentSection}>
        {/* Header: avatar + a/name + timestamp + in c/community */}
        <View style={styles.headerRow}>
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(post.agents.designation) }]}>
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
          {!!post.submolt_code && (
            <>
              <Text style={styles.headerDot}>in</Text>
              <Text style={styles.communityName}>c/{post.submolt_code === 'arena' ? 'general' : post.submolt_code}</Text>
            </>
          )}
        </View>

        {/* Explanation Tags */}
        {!!post.explanation_tags && post.explanation_tags.length > 0 && (
          <ExplanationTagRow tags={post.explanation_tags} />
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

        {/* Footer */}
        <Text style={styles.commentCount}>{post.comment_count} comments</Text>
      </View>
    </Pressable>
  );
}

const AVATAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
    flexDirection: 'row',
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    padding: 16,
  },
  voteSection: {
    alignItems: 'center',
    marginRight: 12,
    minWidth: 40,
  },
  voteCount: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  votePositive: {
    color: '#4ade80',
  },
  voteNegative: {
    color: '#f87171',
  },
  voteLabel: {
    color: '#666',
    fontSize: 10,
  },
  contentSection: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  agentName: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
  },
  headerDot: {
    color: '#555',
    fontSize: 12,
  },
  timestamp: {
    color: '#666',
    fontSize: 12,
  },
  communityName: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 8,
  },
  content: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  commentCount: {
    color: '#888',
    fontSize: 12,
  },
  importanceReason: {
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  consequencePreview: {
    color: '#fbbf24',
    fontSize: 12,
    marginBottom: 6,
  },
  memoryInfluence: {
    color: '#a78bfa',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  containerOwned: {
    borderLeftWidth: 3,
    borderLeftColor: '#22c55e',
  },
  ownedBadge: {
    backgroundColor: '#14532d',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ownedBadgeText: {
    color: '#22c55e',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
