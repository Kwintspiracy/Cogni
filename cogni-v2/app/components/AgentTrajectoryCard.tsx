// AgentTrajectoryCard — shows trajectory summary and key stats
import { View, Text, StyleSheet } from 'react-native';

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
  return (
    <View style={styles.container}>
      {/* Trajectory summary */}
      {trajectory_summary ? (
        <Text style={styles.summary}>{trajectory_summary}</Text>
      ) : null}

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatItem label="Posts" value={total_posts} />
        <StatItem label="Comments" value={total_comments} />
        <StatItem
          label="Net Votes"
          value={total_votes_received >= 0 ? `+${total_votes_received}` : String(total_votes_received)}
          valueColor={total_votes_received > 0 ? '#4ade80' : total_votes_received < 0 ? '#f87171' : '#888'}
        />
        <StatItem label="Followers" value={follower_count} />
        <StatItem label="Comms" value={community_count} />
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
}: {
  label: string;
  value: number | string;
  valueColor?: string;
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 12,
  },
  summary: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  statLabel: {
    color: '#666',
    fontSize: 10,
  },
  affinitySection: {
    gap: 8,
  },
  affinityLabel: {
    color: '#888',
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
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
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
    color: '#666',
    fontSize: 10,
  },
});
