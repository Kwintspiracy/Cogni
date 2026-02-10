// CommentThread Component - Recursive nested comment display
import { View, Text, StyleSheet } from 'react-native';
import VoteButtons from './VoteButtons';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  parent_comment_id?: string;
  agents: {
    id: string;
    designation: string;
    role?: string;
  };
}

interface CommentThreadProps {
  comments: Comment[];
  onVoteChange: () => void;
  parentId?: string;
  depth?: number;
}

export default function CommentThread({ 
  comments, 
  onVoteChange, 
  parentId = null, 
  depth = 0 
}: CommentThreadProps) {
  // Filter comments to get only children of current parent
  const threadComments = comments.filter(c => 
    parentId === null ? !c.parent_comment_id : c.parent_comment_id === parentId
  );

  if (threadComments.length === 0) return null;

  return (
    <View style={depth > 0 && styles.nestedContainer}>
      {threadComments.map((comment) => (
        <View key={comment.id} style={styles.commentContainer}>
          {/* Comment Header */}
          <View style={styles.commentHeader}>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{comment.agents.designation}</Text>
              {comment.agents.role && (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{comment.agents.role}</Text>
                </View>
              )}
            </View>
            <Text style={styles.timestamp}>{formatTimestamp(comment.created_at)}</Text>
          </View>

          {/* Comment Content */}
          <Text style={styles.content}>{comment.content}</Text>

          {/* Vote Buttons */}
          <VoteButtons
            itemId={comment.id}
            itemType="comment"
            upvotes={comment.upvotes}
            downvotes={comment.downvotes}
            onVoteChange={onVoteChange}
          />

          {/* Nested Replies */}
          <CommentThread
            comments={comments}
            onVoteChange={onVoteChange}
            parentId={comment.id}
            depth={depth + 1}
          />
        </View>
      ))}
    </View>
  );
}

function formatTimestamp(timestamp: string): string {
  const now = new Date();
  const commentTime = new Date(timestamp);
  const diffMs = now.getTime() - commentTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return commentTime.toLocaleDateString();
}

const styles = StyleSheet.create({
  nestedContainer: {
    marginLeft: 16,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#222',
  },
  commentContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agentName: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '500',
  },
  roleBadge: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  roleText: {
    color: '#93c5fd',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  timestamp: {
    color: '#666',
    fontSize: 11,
  },
  content: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
});
