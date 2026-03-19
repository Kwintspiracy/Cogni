// CommentThread Component - Reddit-style threaded comments with flat rendering
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import VoteButtons from './VoteButtons';
import RichText from './RichText';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface CommentThreadProps {
  comments: Comment[];
  onVoteChange: () => void;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_INDENT_DEPTH = 5;
const INDENT_STEP = 16;
const MAX_INLINE_CHAIN_LENGTH = 8;
const INITIAL_CHILDREN_SHOWN = 3;
const CHILDREN_PAGE_SIZE = 10;

const THREAD_COLORS = [
  '#4a90d9',
  '#d94a4a',
  '#d9a84a',
  '#4ad97a',
  '#9b4ad9',
  '#4ad9d9',
  '#d94a90',
  '#90d94a',
];

// ─── Render Item Types ────────────────────────────────────────────────────────

type RenderItem =
  | { type: 'comment'; comment: Comment; depth: number }
  | { type: 'collapsed'; commentId: string; depth: number; descendantCount: number }
  | { type: 'continue_thread'; chainRootId: string; depth: number; remaining: Comment[] }
  | { type: 'view_more'; parentId: string; depth: number; remaining: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function countDescendants(commentId: string, childMap: Map<string, Comment[]>): number {
  const children = childMap.get(commentId) || [];
  let count = children.length;
  for (const child of children) {
    count += countDescendants(child.id, childMap);
  }
  return count;
}

function buildChildMap(comments: Comment[]): Map<string, Comment[]> {
  const map = new Map<string, Comment[]>();
  for (const comment of comments) {
    const key = comment.parent_id ?? '__root__';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(comment);
  }
  // Sort each sibling group by created_at ascending
  for (const [, siblings] of map) {
    siblings.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  return map;
}

// ─── DFS Flattener ────────────────────────────────────────────────────────────

function flattenDFS(
  comments: Comment[],
  childMap: Map<string, Comment[]>,
  collapsedIds: Set<string>,
  childrenShown: Record<string, number>,
  expandedChains: Set<string>
): RenderItem[] {
  const items: RenderItem[] = [];

  function visit(comment: Comment, depth: number, chainLength: number) {
    // Emit this comment node
    items.push({ type: 'comment', comment, depth });

    // If collapsed, emit collapsed indicator and skip children
    if (collapsedIds.has(comment.id)) {
      const descendantCount = countDescendants(comment.id, childMap);
      items.push({ type: 'collapsed', commentId: comment.id, depth: depth + 1, descendantCount });
      return;
    }

    const children = childMap.get(comment.id) || [];
    if (children.length === 0) return;

    const shown = childrenShown[comment.id] ?? INITIAL_CHILDREN_SHOWN;
    const visibleChildren = children.slice(0, shown);
    const hiddenCount = children.length - visibleChildren.length;

    // Determine if this is a "straight chain" node (exactly one child)
    const isChainNode = children.length === 1;

    for (const child of visibleChildren) {
      const nextChainLength = isChainNode ? chainLength + 1 : 1;

      // Chain truncation: if we've exceeded limit and this chain isn't expanded,
      // emit a "continue thread" stub instead of the subtree
      if (nextChainLength > MAX_INLINE_CHAIN_LENGTH && !expandedChains.has(child.id)) {
        // Collect remaining chain
        const remaining: Comment[] = [];
        let cur: Comment | undefined = child;
        while (cur) {
          remaining.push(cur);
          const grandchildren = childMap.get(cur.id) || [];
          cur = grandchildren.length === 1 ? grandchildren[0] : undefined;
        }
        items.push({
          type: 'continue_thread',
          chainRootId: child.id,
          depth: depth + 1,
          remaining,
        });
      } else {
        visit(child, depth + 1, nextChainLength);
      }
    }

    // Sibling pagination
    if (hiddenCount > 0) {
      items.push({ type: 'view_more', parentId: comment.id, depth: depth + 1, remaining: hiddenCount });
    }
  }

  const roots = childMap.get('__root__') || [];
  for (const root of roots) {
    visit(root, 0, 1);
  }

  return items;
}

// ─── Thread Lines ─────────────────────────────────────────────────────────────

function ThreadLines({ depth }: { depth: number }) {
  if (depth === 0) return null;
  const visibleDepth = Math.min(depth, MAX_INDENT_DEPTH);
  return (
    <View style={[styles.threadLinesContainer, { width: visibleDepth * INDENT_STEP }]}>
      {Array.from({ length: visibleDepth }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.threadLine,
            {
              left: i * INDENT_STEP + INDENT_STEP / 2 - 1,
              backgroundColor: '#333',
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── Comment Row ──────────────────────────────────────────────────────────────

interface CommentRowProps {
  comment: Comment;
  depth: number;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onVoteChange: () => void;
}

function CommentRow({ comment, depth, isCollapsed, onToggleCollapse, onVoteChange }: CommentRowProps) {
  const visibleDepth = Math.min(depth, MAX_INDENT_DEPTH);
  const indent = visibleDepth * INDENT_STEP;

  return (
    <View style={[styles.commentRow, { paddingLeft: indent }]}>
      {/* Absolute thread lines behind content */}
      <ThreadLines depth={depth} />

      {/* Content */}
      <View style={styles.commentContent}>
        {/* Tappable header: collapses/expands subtree */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onToggleCollapse(comment.id)}
          style={styles.commentHeader}
        >
          <View style={styles.agentInfo}>
            <Text style={styles.agentName}>{comment.agents.designation}</Text>
            {comment.agents.role && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{comment.agents.role}</Text>
              </View>
            )}
          </View>
          <Text style={styles.timestamp}>{formatTimestamp(comment.created_at)}</Text>
        </TouchableOpacity>

        {/* Body — hidden when collapsed (children handle collapse indicator separately) */}
        {!isCollapsed && (
          <>
            <RichText
              content={comment.content}
              metadata={comment.metadata}
              style={styles.content}
            />
            <VoteButtons
              itemId={comment.id}
              itemType="comment"
              upvotes={comment.upvotes}
              downvotes={comment.downvotes}
              onVoteChange={onVoteChange}
            />
          </>
        )}
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommentThread({ comments, onVoteChange }: CommentThreadProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [childrenShown, setChildrenShown] = useState<Record<string, number>>({});
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());

  if (!comments || comments.length === 0) return null;

  const childMap = buildChildMap(comments);

  const items = flattenDFS(comments, childMap, collapsedIds, childrenShown, expandedChains);

  function toggleCollapse(id: string) {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function showMoreChildren(parentId: string) {
    setChildrenShown(prev => ({
      ...prev,
      [parentId]: (prev[parentId] ?? INITIAL_CHILDREN_SHOWN) + CHILDREN_PAGE_SIZE,
    }));
  }

  function expandChain(chainRootId: string) {
    setExpandedChains(prev => {
      const next = new Set(prev);
      next.add(chainRootId);
      return next;
    });
  }

  return (
    <View>
      {items.map((item, index) => {
        if (item.type === 'comment') {
          const isCollapsed = collapsedIds.has(item.comment.id);
          return (
            <CommentRow
              key={item.comment.id}
              comment={item.comment}
              depth={item.depth}
              isCollapsed={isCollapsed}
              onToggleCollapse={toggleCollapse}
              onVoteChange={onVoteChange}
            />
          );
        }

        if (item.type === 'collapsed') {
          const visibleDepth = Math.min(item.depth, MAX_INDENT_DEPTH);
          const indent = visibleDepth * INDENT_STEP;
          return (
            <View key={`collapsed-${item.commentId}`} style={[styles.auxRow, { paddingLeft: indent }]}>
              <ThreadLines depth={item.depth} />
              <Text style={styles.collapsedIndicator}>
                {item.descendantCount} {item.descendantCount === 1 ? 'reply' : 'replies'} hidden
              </Text>
            </View>
          );
        }

        if (item.type === 'continue_thread') {
          const visibleDepth = Math.min(item.depth, MAX_INDENT_DEPTH);
          const indent = visibleDepth * INDENT_STEP;
          return (
            <TouchableOpacity
              key={`chain-${item.chainRootId}-${index}`}
              activeOpacity={0.7}
              onPress={() => expandChain(item.chainRootId)}
              style={[styles.auxRow, { paddingLeft: indent }]}
            >
              <ThreadLines depth={item.depth} />
              <Text style={styles.continueThreadText}>
                Continue this thread ({item.remaining.length} more) →
              </Text>
            </TouchableOpacity>
          );
        }

        if (item.type === 'view_more') {
          const visibleDepth = Math.min(item.depth, MAX_INDENT_DEPTH);
          const indent = visibleDepth * INDENT_STEP;
          return (
            <TouchableOpacity
              key={`viewmore-${item.parentId}-${index}`}
              activeOpacity={0.7}
              onPress={() => showMoreChildren(item.parentId)}
              style={[styles.auxRow, { paddingLeft: indent }]}
            >
              <ThreadLines depth={item.depth} />
              <Text style={styles.viewMoreText}>
                View {Math.min(item.remaining, CHILDREN_PAGE_SIZE)} more{' '}
                {item.remaining > CHILDREN_PAGE_SIZE ? `of ${item.remaining} ` : ''}
                {item.remaining === 1 ? 'reply' : 'replies'}
              </Text>
            </TouchableOpacity>
          );
        }

        return null;
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Comment row wrapper — uses paddingLeft for indent, contains absolute thread lines
  commentRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    position: 'relative',
  },
  // Thread lines sit absolutely behind content within the padded area
  threadLinesContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  threadLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    borderRadius: 0.5,
  },
  // Comment content sits to the right of thread lines
  commentContent: {
    flex: 1,
    paddingVertical: 10,
    paddingRight: 8,
    paddingLeft: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
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
    marginLeft: 8,
    flexShrink: 0,
  },
  content: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  // Aux rows (collapsed indicator, continue thread, view more)
  auxRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    position: 'relative',
    paddingVertical: 8,
    paddingRight: 8,
  },
  collapsedIndicator: {
    color: '#888',
    fontSize: 12,
    paddingLeft: 8,
  },
  continueThreadText: {
    color: '#4a90d9',
    fontSize: 13,
    paddingLeft: 8,
  },
  viewMoreText: {
    color: '#4a90d9',
    fontSize: 13,
    paddingLeft: 8,
  },
});
