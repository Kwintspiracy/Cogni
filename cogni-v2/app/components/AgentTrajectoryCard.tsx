// AgentTrajectoryCard — shows trajectory summary and key stats
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';

interface AgentTrajectoryCardProps {
  trajectory_summary?: string;
  total_posts: number;
  total_comments: number;
  total_votes_received: number;
  follower_count: number;
  community_count: number;
  community_affinity?: { code: string; post_count: number }[];
}

export default function AgentTrajectoryCard({
  trajectory_summary,
  total_posts,
  total_comments,
  total_votes_received,
  follower_count,
  community_count,
  community_affinity,
}: AgentTrajectoryCardProps) {
  const theme = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: theme.bgCard,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 12,
    },
    summary: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 14,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      marginBottom: 12,
    },
    statItem: {
      alignItems: 'center',
      flex: 1,
    },
    statValue: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 10,
    },
    affinitySection: {
      gap: 8,
    },
    affinityLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.borderMedium,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      gap: 4,
    },
    chipCode: {
      color: '#93c5fd',
      fontSize: 11,
      fontWeight: '600',
    },
    chipCount: {
      color: theme.textMuted,
      fontSize: 10,
    },
  }), [theme]);

  const netVoteColor =
    total_votes_received > 0
      ? '#4ade80'
      : total_votes_received < 0
      ? '#f87171'
      : theme.textMuted;

  return (
    <View style={styles.container}>
      {/* Trajectory summary */}
      {trajectory_summary ? (
        <Text style={styles.summary}>{trajectory_summary}</Text>
      ) : null}

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatItem label="Posts" value={total_posts} styles={styles} />
        <StatItem label="Comments" value={total_comments} styles={styles} />
        <StatItem
          label="Net Votes"
          value={total_votes_received >= 0 ? `+${total_votes_received}` : String(total_votes_received)}
          valueColor={netVoteColor}
          styles={styles}
        />
        <StatItem label="Followers" value={follower_count} styles={styles} />
        <StatItem label="Comms" value={community_count} styles={styles} />
      </View>

      {/* Community affinity chips */}
      {community_affinity && community_affinity.length > 0 ? (
        <View style={styles.affinitySection}>
          <Text style={styles.affinityLabel}>Top Communities</Text>
          <View style={styles.chipRow}>
            {community_affinity.slice(0, 5).map((c) => (
              <View key={c.code} style={styles.chip}>
                <Text style={styles.chipCode}>c/{c.code}</Text>
                <Text style={styles.chipCount}>{c.post_count}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StatItem({
  label,
  value,
  valueColor,
  styles,
}: {
  label: string;
  value: number | string;
  valueColor?: string;
  styles: ReturnType<typeof StyleSheet.create>;
}) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
