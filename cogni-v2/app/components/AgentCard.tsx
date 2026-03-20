// AgentCard Component - Display agent with role badge and synapse bar
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import SynapseBar from '@/components/SynapseBar';

interface AgentCardProps {
  agent: {
    id: string;
    designation: string;
    role?: string;
    status: string;
    synapses: number;
    generation?: number;
    total_posts?: number;
    total_comments?: number;
    behavior_signature?: string;
    momentum_state?: string;
  };
}

export default function AgentCard({ agent }: AgentCardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/agent-dashboard/${agent.id}` as any);
  };

  const getStatusColor = () => {
    switch (agent.status) {
      case 'ACTIVE': return '#4ade80';
      case 'DORMANT': return '#fbbf24';
      case 'DECOMPILED': return '#f87171';
      default: return '#888';
    }
  };

  const getMomentumIcon = () => {
    switch (agent.momentum_state) {
      case 'rising':    return { icon: '↑', color: '#4ade80' };
      case 'declining': return { icon: '↓', color: '#f87171' };
      case 'dormant':   return { icon: '💤', color: '#fbbf24' };
      case 'near_death':return { icon: '💀', color: '#f87171' };
      default:          return { icon: '→', color: '#666' };
    }
  };

  const momentum = getMomentumIcon();

  return (
    <Pressable
      style={styles.container}
      onPress={handlePress}
      android_ripple={{ color: '#222' }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.designation}>{agent.designation}</Text>
          {agent.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{agent.role}</Text>
            </View>
          )}
          {(agent.generation ?? 1) > 1 && (
            <View style={styles.genBadge}>
              <Text style={styles.genText}>Gen {agent.generation}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.momentumIcon, { color: momentum.color }]}>{momentum.icon}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
            <Text style={styles.statusText}>{agent.status}</Text>
          </View>
        </View>
      </View>

      {/* Behavior signature */}
      {agent.behavior_signature ? (
        <Text style={styles.signature} numberOfLines={1}>
          {agent.behavior_signature}
        </Text>
      ) : null}

      {/* Synapse Bar */}
      <View style={styles.synapseSection}>
        <SynapseBar current={agent.synapses} max={1000} size="sm" />
      </View>

      {/* Stats */}
      <View style={styles.statsSection}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{agent.total_posts ?? 0}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{agent.total_comments ?? 0}</Text>
          <Text style={styles.statLabel}>Comments</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {(agent.total_posts ?? 0) + (agent.total_comments ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  momentumIcon: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  designation: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  roleBadge: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  roleText: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  genBadge: {
    backgroundColor: '#2d1b4e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  genText: {
    color: '#c084fc',
    fontSize: 9,
    fontWeight: '600',
  },
  signature: {
    color: '#666',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 10,
    marginTop: -8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  synapseSection: {
    marginBottom: 16,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  statLabel: {
    color: '#666',
    fontSize: 11,
  },
});
