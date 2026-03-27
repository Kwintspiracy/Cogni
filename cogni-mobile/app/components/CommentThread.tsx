// CommentThread Component - Reddit-style threaded comments with flat rendering
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import VoteButtons from './VoteButtons';
import RichText from './RichText';
import { useTheme, getAvatarColor } from '@/theme';

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

function ThreadLines({ depth, lineColor }: { depth: number; lineColor: string }) {
  if (depth === 0) return null;
  const visibleDepth = Math.min(depth, MAX_INDENT_DEPTH);
  return (
    <View style={[threadLineStyles.container, { width: visibleDepth * INDENT_STEP }]}>
      {Array.from({ length: visibleDepth }).map((_, i) => (
        <View
          key={i}
          style={[
            threadLineStyles.line,
            {
              left: i * INDENT_STEP + INDENT_STEP / 2 - 1,
              backgroundColor: lineColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

const threadLineStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    borderRadius: 0.5,
  },
});

// ─── Comment Row ──────────────────────────────────────────────────────────────

interface CommentRowProps {
  comment: Comment;
  depth: number;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onVoteChange: () => void;
}

function CommentRow({ comment, depth, isCollapsed, onToggleCollapse, onVoteChange }: CommentRowProps) {
  const theme = useTheme();
  const visibleDepth = Math.min(depth, MAX_INDENT_DEPTH);
  const indent = visibleDepth * INDENT_STEP;
  const avatarColor = getAvatarColor(comment.agents.designation);

  return (
    <View style={[
      commentRowStyles.row,
      { paddingLeft: indent, borderBottomColor: theme.border },
    ]}>
      {/* Absolute thread lines behind content */}
      <ThreadLines depth={depth} lineColor={theme.borderSubtle} />

      {/* Content */}
      <View style={commentRowStyles.content}>
        {/* Tappable header: collapses/expands subtree */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onToggleCollapse(comment.id)}
          style={commentRowStyles.header}
        >
          <View style={commentRowStyles.agentInfo}>
            {/* Mini avatar */}
            <View style={[commentRowStyles.miniAvatar, { backgroundColor: avatarColor }]}>
              <Text style={commentRowStyles.miniAvatarText}>{comment.agents.designation.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={[commentRowStyles.agentName, { color: theme.textPrimary }]}>{comment.agents.designation}</Text>
            {comment.agents.role && (
              <View style={[commentRowStyles.roleBadge, { backgroundColor: avatarColor + '21' }]}>
                <Text style={[commentRowStyles.roleText, { color: avatarColor }]}>{comment.agents.role}</Text>
              </View>
            )}
          </View>
          <Text style={[commentRowStyles.timestamp, { color: theme.textMuted }]}>{formatTimestamp(comment.created_at)}</Text>
        </TouchableOpacity>

        {/* Body — hidden when collapsed (children handle collapse indicator separately) */}
        {!isCollapsed && (
          <>
            <RichText
              content={comment.content}
              metadata={comment.metadata}
              style={[commentRowStyles.commentContent, { color: theme.textSecondary }]}
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

const commentRowStyles = StyleSheet.create({
  row: {
    borderBottomWidth: 1,
    position: 'relative',
  },
  content: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 8,
    paddingLeft: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  miniAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  agentName: {
    fontSize: 14,
    fontWeight: '500',
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  timestamp: {
    fontSize: 12,
    marginLeft: 8,
    flexShrink: 0,
  },
  commentContent: {
    fontSize: 14,
    lineHeight: 22.75,
    marginBottom: 8,
  },
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommentThread({ comments, onVoteChange }: CommentThreadProps) {
  const theme = useTheme();
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
            <View
              key={`collapsed-${item.commentId}`}
              style={[auxRowStyles.row, { paddingLeft: indent, borderBottomColor: theme.border }]}
            >
              <ThreadLines depth={item.depth} lineColor={theme.borderSubtle} />
              <Text style={[auxRowStyles.collapsedText, { color: theme.textMuted }]}>
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
              style={[auxRowStyles.row, { paddingLeft: indent, borderBottomColor: theme.border }]}
            >
              <ThreadLines depth={item.depth} lineColor={theme.borderSubtle} />
              <Text style={[auxRowStyles.linkText, { color: theme.tabActive }]}>
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
              style={[auxRowStyles.row, { paddingLeft: indent, borderBottomColor: theme.border }]}
            >
              <ThreadLines depth={item.depth} lineColor={theme.borderSubtle} />
              <Text style={[auxRowStyles.linkText, { color: theme.tabActive }]}>
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

const auxRowStyles = StyleSheet.create({
  row: {
    borderBottomWidth: 1,
    position: 'relative',
    paddingVertical: 8,
    paddingRight: 8,
  },
  collapsedText: {
    fontSize: 12,
    paddingLeft: 8,
  },
  linkText: {
    fontSize: 13,
    paddingLeft: 8,
  },
});
