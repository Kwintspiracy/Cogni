// AgentIdentityHeader — rich identity card shown at top of agent dashboard
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SynapseBar from '@/components/SynapseBar';
import { useTheme } from '@/theme';

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

function getRoleColor(role?: string): string {
  if (!role) return '#7c3aed';
  const normalized = role.toLowerCase();
  if (normalized.includes('builder') || normalized.includes('engineer')) return '#2563eb';
  if (normalized.includes('storyteller') || normalized.includes('writer')) return '#db2777';
  if (normalized.includes('philosopher') || normalized.includes('thinker')) return '#7c3aed';
  if (normalized.includes('troll') || normalized.includes('provocateur') || normalized.includes('skeptic')) return '#dc2626';
  if (normalized.includes('investor') || normalized.includes('analyst')) return '#059669';
  return hashColor(role);
}

function getMomentumConfig(state?: string): { icon: string; color: string; label: string } {
  switch (state) {
    case 'rising':    return { icon: '↑', color: '#4ade80', label: 'Rising' };
    case 'declining': return { icon: '↓', color: '#f87171', label: 'Declining' };
    case 'dormant':   return { icon: '💤', color: '#fbbf24', label: 'Dormant' };
    case 'near_death':return { icon: '💀', color: '#f87171', label: 'Near Death' };
    default:          return { icon: '→', color: '#9ca3af', label: 'Stable' };
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
  const theme = useTheme();
  const roleColor = getRoleColor(agent.role);
  const firstLetter = agent.designation.charAt(0).toUpperCase();
  const momentum = getMomentumConfig(agent.momentum_state);
  const statusColor = getStatusColor(agent.status);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: theme.bg,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 20,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    avatarWrap: {
      marginBottom: 12,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarLetter: {
      color: '#fff',
      fontSize: 26,
      fontWeight: 'bold',
    },
    designation: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '500',
      marginBottom: 10,
      textAlign: 'center',
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 12,
    },
    roleBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    roleBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    genBadge: {
      borderWidth: 1,
      borderColor: theme.borderMedium,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    genBadgeText: {
      color: theme.textTertiary,
      fontSize: 11,
      fontWeight: '600',
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '600',
    },
    momentumBadge: {
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'transparent',
    },
    momentumText: {
      fontSize: 11,
      fontWeight: '600',
    },
    signature: {
      color: theme.textMuted,
      fontSize: 12,
      fontStyle: 'italic',
      textAlign: 'center',
      marginBottom: 14,
      lineHeight: 18,
      paddingHorizontal: 16,
    },
    synapseWrap: {
      width: '100%',
    },
  }), [theme]);

  return (
    <View style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        <View style={[styles.avatar, { backgroundColor: roleColor }]}>
          <Text style={styles.avatarLetter}>{firstLetter}</Text>
        </View>
      </View>

      {/* Designation */}
      <Text style={styles.designation}>{agent.designation}</Text>

      {/* Badge row */}
      <View style={styles.badgeRow}>
        {agent.role ? (
          <View style={[styles.roleBadge, { backgroundColor: roleColor + '21' }]}>
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>{agent.role}</Text>
          </View>
        ) : null}

        <View style={styles.genBadge}>
          <Text style={styles.genBadgeText}>GEN {agent.generation}</Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusColor + '21' }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{agent.status}</Text>
        </View>

        <View style={[styles.momentumBadge, { borderColor: theme.borderMedium }]}>
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
