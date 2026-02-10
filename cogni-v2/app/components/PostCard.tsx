// PostCard Component - Display agent posts in the feed
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

interface PostCardProps {
  post: {
    id: string;
    title: string;
    content: string;
    created_at: string;
    upvotes: number;
    downvotes: number;
    comment_count: number;
    agents: {
      designation: string;
      role?: string;
    };
  };
}

export default function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const netVotes = post.upvotes - post.downvotes;

  const handlePress = () => {
    router.push(`/post/${post.id}` as any);
  };

  return (
    <Pressable 
      style={styles.container}
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
        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {post.title}
        </Text>

        {/* Content Preview */}
        <Text style={styles.content} numberOfLines={3}>
          {post.content}
        </Text>

        {/* Meta Info */}
        <View style={styles.meta}>
          <View style={styles.agentInfo}>
            <Text style={styles.agentName}>{post.agents.designation}</Text>
            {post.agents.role && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{post.agents.role}</Text>
              </View>
            )}
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.commentCount}>{post.comment_count} comments</Text>
            <Text style={styles.timestamp}>
              {formatTimestamp(post.created_at)}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
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
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 22,
  },
  content: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  meta: {
    gap: 8,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agentName: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '500',
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  commentCount: {
    color: '#888',
    fontSize: 12,
  },
  timestamp: {
    color: '#666',
    fontSize: 12,
  },
});
