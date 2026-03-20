import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getAgents, Agent } from '@/services/agent.service';
import { useTheme, Theme } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MomentumState = 'rising' | 'stable' | 'declining' | 'dormant' | 'near_death';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMomentumColor(state: MomentumState | undefined): string {
  switch (state) {
    case 'rising':    return '#4ade80'; // green
    case 'declining': return '#f87171'; // red
    case 'dormant':   return '#f59e0b'; // amber
    case 'near_death': return '#ef4444'; // bright red
    case 'stable':
    default:          return '#6b7280'; // gray
  }
}

function getMomentumLabel(state: MomentumState | undefined): string {
  switch (state) {
    case 'rising':    return 'Rising';
    case 'declining': return 'Declining';
    case 'dormant':   return 'Dormant';
    case 'near_death': return 'Near Death';
    case 'stable':
    default:          return 'Stable';
  }
}

/** Map synapses to bubble diameter: 40px (low) to 100px (high). */
function getBubbleSize(synapses: number, maxSynapses: number): number {
  const MIN_SIZE = 44;
  const MAX_SIZE = 100;
  if (maxSynapses <= 0) return MIN_SIZE;
  const ratio = Math.min(synapses / maxSynapses, 1);
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * ratio;
}

// ---------------------------------------------------------------------------
// AgentBubble
// ---------------------------------------------------------------------------

interface AgentBubbleProps {
  agent: Agent;
  size: number;
  theme: Theme;
  onPress: () => void;
}

function AgentBubble({ agent, size, theme, onPress }: AgentBubbleProps) {
  const color = getMomentumColor(agent.momentum_state);
  const fontSize = size <= 52 ? 9 : size <= 68 ? 10 : 11;

  return (
    <Pressable
      style={({ pressed }) => [
        staticStyles.bubble,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          backgroundColor: pressed ? `${color}22` : `${color}11`,
        },
      ]}
      onPress={onPress}
      android_ripple={{ color: `${color}33` }}
    >
      {/* Synapse count */}
      <Text style={[staticStyles.bubbleSynapses, { fontSize: fontSize - 1, color: `${color}cc` }]}>
        {agent.synapses >= 1000
          ? `${(agent.synapses / 1000).toFixed(1)}k`
          : String(agent.synapses)}
      </Text>
      {/* Designation — trim if too long for bubble */}
      <Text
        style={[staticStyles.bubbleName, { fontSize, color: theme.textPrimary }]}
        numberOfLines={2}
      >
        {agent.designation.length > 10 && size < 64
          ? agent.designation.slice(0, 8) + '…'
          : agent.designation}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Legend entry
// ---------------------------------------------------------------------------

function LegendDot({ color, label, theme }: { color: string; label: string; theme: Theme }) {
  return (
    <View style={staticStyles.legendItem}>
      <View style={[staticStyles.legendDot, { backgroundColor: color }]} />
      <Text style={[staticStyles.legendLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// EcosystemMap
// ---------------------------------------------------------------------------

interface EcosystemMapProps {
  /** If true, auto-fetches active agents on mount. Default: true. */
  autoFetch?: boolean;
  /** Optional pre-loaded agents (skips fetch). */
  agents?: Agent[];
  /** Max height for the scrollable bubble grid. */
  maxHeight?: number;
}

export default function EcosystemMap({
  autoFetch = true,
  agents: propAgents,
  maxHeight = 420,
}: EcosystemMapProps) {
  const router = useRouter();
  const theme = useTheme();
  const [agents, setAgents] = useState<Agent[]>(propAgents ?? []);
  const [loading, setLoading] = useState(autoFetch && !propAgents);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useMemo(() => makeStyles(theme), [theme]);

  const loadAgents = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await getAgents({ status: 'ACTIVE' });
      setAgents(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load agents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch && !propAgents) {
      loadAgents();
    }
  }, [autoFetch, propAgents]);

  const maxSynapses = agents.length > 0
    ? Math.max(...agents.map((a) => a.synapses))
    : 1;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6b7280" />
        <Text style={styles.loadingText}>Loading ecosystem...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={() => loadAgents()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (agents.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No active agents</Text>
        <Text style={styles.emptySubtext}>Agents will appear here when the pulse is running</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ecosystem Map</Text>
        <Text style={styles.headerMeta}>{agents.length} active</Text>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendDot color="#4ade80" label="Rising" theme={theme} />
        <LegendDot color="#6b7280" label="Stable" theme={theme} />
        <LegendDot color="#f59e0b" label="Dormant" theme={theme} />
        <LegendDot color="#f87171" label="Declining" theme={theme} />
      </View>
      <Text style={styles.legendHint}>Bubble size = synapse count · Tap to open dashboard</Text>

      {/* Bubble grid */}
      <ScrollView
        style={{ maxHeight }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAgents(true)}
            tintColor="#6b7280"
            colors={['#6b7280']}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bubblesGrid}>
          {agents.map((agent) => {
            const size = getBubbleSize(agent.synapses, maxSynapses);
            return (
              <AgentBubble
                key={agent.id}
                agent={agent}
                size={size}
                theme={theme}
                onPress={() => router.push(`/agent-dashboard/${agent.id}` as any)}
              />
            );
          })}
        </View>
      </ScrollView>

      {/* Status summary strip */}
      <View style={styles.statusStrip}>
        {(['rising', 'stable', 'dormant', 'declining', 'near_death'] as MomentumState[]).map((state) => {
          const count = agents.filter((a) => (a.momentum_state ?? 'stable') === state).length;
          if (count === 0) return null;
          return (
            <View key={state} style={styles.statusChip}>
              <View style={[staticStyles.statusDot, { backgroundColor: getMomentumColor(state) }]} />
              <Text style={styles.statusCount}>{count}</Text>
              <Text style={styles.statusLabel}>{getMomentumLabel(state)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const staticStyles = StyleSheet.create({
  bubble: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    gap: 1,
  },
  bubbleSynapses: {
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  bubbleName: {
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});

function makeStyles(theme: Theme) {
  return {
    container: {
      backgroundColor: theme.bgCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden' as const,
    },
    center: {
      backgroundColor: theme.bgCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 32,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
    },
    loadingText: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: 8,
    },
    errorText: {
      color: '#f87171',
      fontSize: 14,
      textAlign: 'center' as const,
    },
    retryButton: {
      marginTop: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.bgElevated,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.borderMedium,
    },
    retryText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600' as const,
    },
    emptyText: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '600' as const,
    },
    emptySubtext: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: 'center' as const,
    },
    header: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700' as const,
      letterSpacing: 0.3,
    },
    headerMeta: {
      color: theme.textMuted,
      fontSize: 12,
    },
    legend: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      paddingHorizontal: 16,
      gap: 12,
      marginBottom: 2,
    },
    legendHint: {
      color: theme.textFaint,
      fontSize: 10,
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    bubblesGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      paddingHorizontal: 12,
      paddingBottom: 12,
      gap: 10,
      alignItems: 'center' as const,
    },
    statusStrip: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
    },
    statusChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      backgroundColor: theme.bgElevated,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    statusCount: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700' as const,
    },
    statusLabel: {
      color: theme.textSecondary,
      fontSize: 11,
    },
  };
}
