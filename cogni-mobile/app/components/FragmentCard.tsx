// FragmentCard - Displays a single writing fragment with voting
import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/theme';
import { WritingFragment } from '@/services/writingEvent.service';

const FRAGMENT_TYPE_ICONS: Record<string, string> = {
  scene: '🎭',
  dialogue: '💬',
  transition: '🔗',
  beat: '🥁',
  direction: '🧭',
  draft: '📝',
  critique: '🔍',
  revision: '✏️',
  polish: '✨',
};

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  proposed: {
    bg: 'rgba(96,165,250,0.1)',
    border: 'rgba(96,165,250,0.3)',
    text: '#60a5fa',
  },
  contested: {
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.3)',
    text: '#f59e0b',
  },
  shortlisted: {
    bg: 'rgba(142,81,255,0.1)',
    border: 'rgba(142,81,255,0.3)',
    text: '#a78bfa',
  },
  canonized: {
    bg: 'rgba(74,222,128,0.1)',
    border: 'rgba(74,222,128,0.3)',
    text: '#4ade80',
  },
  draft: {
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.3)',
    text: '#3b82f6',
  },
  under_review: {
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.3)',
    text: '#f59e0b',
  },
  polished: {
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.3)',
    text: '#10b981',
  },
};

const CONTENT_PREVIEW_LIMIT = 200;

interface FragmentCardProps {
  fragment: WritingFragment;
  onVote?: (fragmentId: string, score: number) => void;
  userVote?: number;
}

function StarRating({ score, userVote, onVote, fragmentId }: {
  score: number;
  userVote?: number;
  onVote?: (fragmentId: string, score: number) => void;
  fragmentId: string;
}) {
  const theme = useTheme();
  const displayVote = userVote ?? 0;

  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => onVote?.(fragmentId, star)}
          hitSlop={4}
        >
          <Text style={{ fontSize: 18, color: star <= displayVote ? '#f59e0b' : theme.textFaint }}>
            {star <= displayVote ? '★' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function FragmentCard({ fragment, onVote, userVote }: FragmentCardProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const isLong = fragment.content.length > CONTENT_PREVIEW_LIMIT;
  const displayContent = isLong && !expanded
    ? fragment.content.slice(0, CONTENT_PREVIEW_LIMIT) + '...'
    : fragment.content;

  const typeIcon = FRAGMENT_TYPE_ICONS[fragment.fragment_type] ?? '📄';
  const statusStyle = STATUS_COLORS[fragment.status] ?? STATUS_COLORS.proposed;
  const scoreDisplay = fragment.score > 0 ? fragment.score.toFixed(1) : '—';

  const styles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: theme.bgCard,
      borderRadius: 8,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    typeIcon: {
      fontSize: 14,
    },
    typeLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    dot: {
      color: theme.textFaint,
      fontSize: 12,
    },
    authorName: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    authorRole: {
      color: theme.textMuted,
      fontSize: 11,
    },
    statusBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 4,
      borderWidth: 1,
    },
    statusText: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    content: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      fontStyle: 'italic',
      marginBottom: 4,
    },
    readMore: {
      color: '#f59e0b',
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 10,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    scoreMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    scoreText: {
      color: '#f59e0b',
      fontSize: 13,
      fontWeight: '700',
    },
    votesText: {
      color: theme.textMuted,
      fontSize: 12,
    },
  }), [theme]);

  return (
    <View style={styles.container}>
      {/* Header: type + author + status */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.typeIcon}>{typeIcon}</Text>
          <Text style={styles.typeLabel}>{fragment.fragment_type}</Text>
          {fragment.author_designation ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.authorName}>{fragment.author_designation}</Text>
              {fragment.author_role ? (
                <Text style={styles.authorRole}> ({fragment.author_role})</Text>
              ) : null}
            </>
          ) : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>{fragment.status}</Text>
        </View>
      </View>

      {/* Content */}
      <Text style={styles.content}>"{displayContent}"</Text>
      {isLong && (
        <Pressable onPress={() => setExpanded((v) => !v)}>
          <Text style={styles.readMore}>{expanded ? 'Show less' : 'Read more'}</Text>
        </Pressable>
      )}

      {/* Footer: score + votes + vote selector */}
      <View style={styles.footer}>
        <View style={styles.scoreMeta}>
          <Text style={styles.scoreText}>★ {scoreDisplay}</Text>
          <Text style={styles.votesText}>· {fragment.vote_count} votes</Text>
        </View>
        {onVote && (
          <StarRating
            score={fragment.score}
            userVote={userVote}
            onVote={onVote}
            fragmentId={fragment.id}
          />
        )}
      </View>
    </View>
  );
}
