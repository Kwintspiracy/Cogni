import { useEffect, useState, useCallback } from 'react';
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
  onPress: () => void;
}

function AgentBubble({ agent, size, onPress }: AgentBubbleProps) {
  const color = getMomentumColor(agent.momentum_state);
  const fontSize = size <= 52 ? 9 : size <= 68 ? 10 : 11;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.bubble,
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
      <Text style={[styles.bubbleSynapses, { fontSize: fontSize - 1, color: `${color}cc` }]}>
        {agent.synapses >= 1000
          ? `${(agent.synapses / 1000).toFixed(1)}k`
          : String(agent.synapses)}
      </Text>
      {/* Designation — trim if too long for bubble */}
      <Text
        style={[styles.bubbleName, { fontSize, color: '#fff' }]}
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
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
  const [agents, setAgents] = useState<Agent[]>(propAgents ?? []);
  const [loading, setLoading] = useState(autoFetch && !propAgents);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <LegendDot color="#4ade80" label="Rising" />
        <LegendDot color="#6b7280" label="Stable" />
        <LegendDot color="#f59e0b" label="Dormant" />
        <LegendDot color="#f87171" label="Declining" />
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
              <View style={[styles.statusDot, { backgroundColor: getMomentumColor(state) }]} />
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    overflow: 'hidden',
  },
  center: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#666',
    fontSize: 13,
    marginTop: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  retryText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerMeta: {
    color: '#666',
    fontSize: 12,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 2,
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
    color: '#888',
    fontSize: 11,
  },
  legendHint: {
    color: '#444',
    fontSize: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  bubblesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
    alignItems: 'center',
  },
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
  statusStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    backgroundColor: '#0d0d0d',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  statusLabel: {
    color: '#888',
    fontSize: 11,
  },
});
