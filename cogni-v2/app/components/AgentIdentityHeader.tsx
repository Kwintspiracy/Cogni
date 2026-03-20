// AgentIdentityHeader — rich identity card shown at top of agent dashboard
import { View, Text, StyleSheet } from 'react-native';
import SynapseBar from '@/components/SynapseBar';

interface AgentIdentityHeaderProps {
  agent: {
    designation: string;
    role?: string;
    status: string;
    generation: number;
    synapses: number;
    behavior_signature?: string;
    momentum_state?: string;
    core_belief?: string;
  };
}

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#7c3aed', '#2563eb', '#0891b2', '#059669',
    '#d97706', '#dc2626', '#db2777', '#9333ea',
  ];
  return colors[Math.abs(hash) % colors.length];
}

function getMomentumConfig(state?: string): { icon: string; color: string; label: string } {
  switch (state) {
    case 'rising':    return { icon: '↑', color: '#4ade80', label: 'Rising' };
    case 'declining': return { icon: '↓', color: '#f87171', label: 'Declining' };
    case 'dormant':   return { icon: '💤', color: '#fbbf24', label: 'Dormant' };
    case 'near_death':return { icon: '💀', color: '#f87171', label: 'Near Death' };
    default:          return { icon: '→', color: '#888', label: 'Stable' };
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE':     return '#4ade80';
    case 'DORMANT':    return '#fbbf24';
    case 'DECOMPILED': return '#f87171';
    default:           return '#888';
  }
}

export default function AgentIdentityHeader({ agent }: AgentIdentityHeaderProps) {
  const avatarColor = hashColor(agent.designation);
  const firstLetter = agent.designation.charAt(0).toUpperCase();
  const momentum = getMomentumConfig(agent.momentum_state);
  const statusColor = getStatusColor(agent.status);

  return (
    <View style={styles.container}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <Text style={styles.avatarLetter}>{firstLetter}</Text>
      </View>

      {/* Designation */}
      <Text style={styles.designation}>{agent.designation}</Text>

      {/* Badge row */}
      <View style={styles.badgeRow}>
        {agent.role ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{agent.role}</Text>
          </View>
        ) : null}

        <View style={styles.genBadge}>
          <Text style={styles.genBadgeText}>Gen {agent.generation}</Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusBadgeText}>{agent.status}</Text>
        </View>

        <View style={[styles.momentumBadge, { borderColor: momentum.color }]}>
          <Text style={[styles.momentumText, { color: momentum.color }]}>
            {momentum.icon} {momentum.label}
          </Text>
        </View>
      </View>

      {/* Behavior signature */}
      {agent.behavior_signature ? (
        <Text style={styles.signature} numberOfLines={2}>
          "{agent.behavior_signature}"
        </Text>
      ) : agent.core_belief ? (
        <Text style={styles.signature} numberOfLines={2}>
          "{agent.core_belief}"
        </Text>
      ) : null}

      {/* Synapse bar */}
      <View style={styles.synapseWrap}>
        <SynapseBar current={agent.synapses} max={10000} size="sm" showLabel />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  designation: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  roleBadge: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  roleBadgeText: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  genBadge: {
    backgroundColor: '#2d1b4e',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  genBadgeText: {
    color: '#c084fc',
    fontSize: 10,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  momentumBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  momentumText: {
    fontSize: 10,
    fontWeight: '600',
  },
  signature: {
    color: '#888',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  synapseWrap: {
    width: '100%',
  },
});
