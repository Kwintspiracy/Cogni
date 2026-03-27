// AgentCard Component - Display agent with role badge and synapse bar
import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import SynapseBar from '@/components/SynapseBar';
import { useTheme, getAvatarColor } from '@/theme';

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
  const theme = useTheme();

  const handlePress = () => {
    router.push(`/agent-dashboard/${agent.id}` as any);
  };

  const getStatusColor = () => {
    switch (agent.status) {
      case 'ACTIVE': return '#10b981';
      case 'DORMANT': return '#fbbf24';
      case 'DECOMPILED': return '#f87171';
      default: return '#888';
    }
  };

  const getStatusLabel = () => {
    switch (agent.status) {
      case 'ACTIVE': return 'Active';
      case 'DORMANT': return 'Dormant';
      case 'DECOMPILED': return 'Decompiled';
      default: return agent.status;
    }
  };

  const getMomentumColor = () => {
    switch (agent.momentum_state) {
      case 'rising':    return '#a78bfa';
      case 'declining': return '#f87171';
      case 'dormant':   return '#fbbf24';
      case 'near_death':return '#f87171';
      default:          return theme.textMuted;
    }
  };

  const statusColor = getStatusColor();
  const avatarColor = getAvatarColor(agent.designation);
  const avatarColorFade = avatarColor + '87'; // ~53% opacity

  const styles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: theme.bgCard,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      gap: 10,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    avatarText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    headerCenter: {
      flex: 1,
      gap: 2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    designation: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    roleText: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.55,
    },
    genBadge: {
      backgroundColor: 'rgba(142,81,255,0.13)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    genText: {
      color: theme.statusRisingText,
      fontSize: 10,
      fontWeight: '600',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      flexShrink: 0,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
    },
    signature: {
      color: theme.textMuted,
      fontSize: 12,
      fontStyle: 'italic',
      marginBottom: 12,
      marginTop: -4,
    },
    synapseSection: {
      marginBottom: 14,
    },
    statsSection: {
      flexDirection: 'row',
      gap: 8,
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.bgCard,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    statValue: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 2,
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 11,
    },
  }), [theme]);

  return (
    <Pressable
      style={styles.container}
      onPress={handlePress}
      android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
    >
      {/* Header row: avatar + name/role + status badge */}
      <View style={styles.header}>
        <LinearGradient
          colors={[avatarColor, avatarColorFade]}
          style={styles.avatar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.avatarText}>{agent.designation.charAt(0).toUpperCase()}</Text>
        </LinearGradient>

        <View style={styles.headerCenter}>
          <View style={styles.nameRow}>
            <Text style={styles.designation}>{agent.designation}</Text>
            {(agent.generation ?? 1) > 1 && (
              <View style={styles.genBadge}>
                <Text style={styles.genText}>Gen {agent.generation}</Text>
              </View>
            )}
          </View>
          {agent.role && (
            <Text style={[styles.roleText, { color: avatarColor }]}>{agent.role.toUpperCase()}</Text>
          )}
        </View>

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '1a' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{getStatusLabel()}</Text>
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
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{agent.total_posts ?? 0}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{agent.total_comments ?? 0}</Text>
          <Text style={styles.statLabel}>Comments</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {(agent.total_posts ?? 0) + (agent.total_comments ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>
    </Pressable>
  );
}
