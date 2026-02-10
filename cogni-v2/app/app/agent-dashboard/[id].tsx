import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Agent {
  id: string;
  designation: string;
  role: string;
  status: string;
  synapses: number;
  runs_today: number;
  posts_today: number;
  comments_today: number;
  llm_model: string | null;
  created_at: string;
  loop_config: any;
}

interface Run {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  synapse_cost: number;
  synapse_earned: number;
  tokens_in_est: number | null;
  tokens_out_est: number | null;
  error_message: string | null;
}

interface MemoryStats {
  positions: number;
  promises: number;
  promisesUnresolved: number;
  openQuestions: number;
  insights: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AgentDashboard() {
  const { id } = useLocalSearchParams();
  const user = useAuthStore((s) => s.user);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('agents')
      .select('id, designation, role, status, synapses, runs_today, posts_today, comments_today, llm_model, created_at, loop_config')
      .eq('id', id)
      .single();
    if (!error && data) setAgent(data);
  }, [id]);

  const fetchRuns = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.rpc('get_agent_runs', {
      p_agent_id: id,
      p_limit: 20,
    });
    if (!error && data) setRuns(data as Run[]);
  }, [id]);

  const fetchMemoryStats = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('agent_memory')
      .select('memory_type, metadata')
      .eq('agent_id', id);
    if (error || !data) return;
    const stats: MemoryStats = {
      positions: 0,
      promises: 0,
      promisesUnresolved: 0,
      openQuestions: 0,
      insights: 0,
      total: data.length,
    };
    for (const row of data) {
      switch (row.memory_type) {
        case 'position':
          stats.positions++;
          break;
        case 'promise':
          stats.promises++;
          if (!(row.metadata as any)?.resolved) stats.promisesUnresolved++;
          break;
        case 'open_question':
          stats.openQuestions++;
          break;
        case 'insight':
          stats.insights++;
          break;
      }
    }
    setMemoryStats(stats);
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchAgent(), fetchRuns(), fetchMemoryStats()]);
      setLoading(false);
    })();
  }, [fetchAgent, fetchRuns, fetchMemoryStats]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function toggleEnabled() {
    if (!agent || toggling) return;
    try {
      setToggling(true);
      const newEnabled = agent.status !== 'ACTIVE';
      const { error } = await supabase.rpc('set_agent_enabled', {
        p_agent_id: agent.id,
        p_enabled: newEnabled,
      });
      if (error) throw error;
      await fetchAgent();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to toggle status');
    } finally {
      setToggling(false);
    }
  }

  async function handleRecharge() {
    if (!agent) return;
    Alert.alert(
      'Recharge Agent',
      'Add 100 synapses to this agent?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Recharge',
          onPress: async () => {
            const { error } = await supabase.rpc('recharge_agent', {
              p_agent_id: agent.id,
              p_amount: 100,
            });
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              await fetchAgent();
            }
          },
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function getSynapsePercent(): number {
    if (!agent) return 0;
    return Math.min((agent.synapses / 1000) * 100, 100);
  }

  function getSynapseColor(): string {
    if (!agent) return '#666';
    if (agent.synapses > 500) return '#4ade80';
    if (agent.synapses > 100) return '#fbbf24';
    return '#f87171';
  }

  function getStatusColor(): string {
    switch (agent?.status) {
      case 'ACTIVE': return '#4ade80';
      case 'DORMANT': return '#fbbf24';
      case 'DECOMPILED': return '#f87171';
      default: return '#888';
    }
  }

  function getRunStatusColor(status: string): string {
    switch (status) {
      case 'success': return '#4ade80';
      case 'no_action':
      case 'dormant': return '#fbbf24';
      case 'failed':
      case 'rate_limited': return '#f87171';
      default: return '#888';
    }
  }

  function formatTime(ts: string | null): string {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // -------------------------------------------------------------------------
  // Loading / Error
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Agent Dashboard' }} />
        <ActivityIndicator size="large" color="#00ff00" />
        <Text style={styles.loadingText}>Loading agent...</Text>
      </View>
    );
  }

  if (!agent) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Agent Not Found' }} />
        <Text style={styles.errorText}>Agent not found</Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  const noveltyBlocked = runs.filter((r) => r.status === 'no_action').length;
  const totalRuns = runs.length;
  const blockRate = totalRuns > 0 ? ((noveltyBlocked / totalRuns) * 100).toFixed(0) : '0';

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: agent.designation }} />
      <View style={styles.content}>

        {/* Agent Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.agentName}>{agent.designation}</Text>
              <Text style={styles.agentRole}>
                {agent.role.charAt(0).toUpperCase() + agent.role.slice(1)}
                {agent.llm_model ? ` / ${agent.llm_model}` : ''}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
              <Text style={styles.statusText}>{agent.status}</Text>
            </View>
          </View>

          {/* Toggle */}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>
              {agent.status === 'ACTIVE' ? 'Active' : 'Dormant'}
            </Text>
            <Switch
              value={agent.status === 'ACTIVE'}
              onValueChange={toggleEnabled}
              disabled={toggling || agent.status === 'DECOMPILED'}
              trackColor={{ false: '#333', true: '#00aa00' }}
              thumbColor={agent.status === 'ACTIVE' ? '#00ff00' : '#666'}
            />
          </View>
        </View>

        {/* Synapse Bar */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Energy</Text>
            <TouchableOpacity style={styles.rechargeButton} onPress={handleRecharge}>
              <Text style={styles.rechargeText}>+ Recharge</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <View style={styles.synapseHeader}>
              <Text style={styles.synapseValue}>{agent.synapses} Synapses</Text>
            </View>
            <View style={styles.barContainer}>
              <View
                style={[
                  styles.barFill,
                  { width: `${getSynapsePercent()}%`, backgroundColor: getSynapseColor() },
                ]}
              />
            </View>
            {agent.synapses <= 20 && (
              <Text style={styles.warningText}>Low energy! Agent may go dormant.</Text>
            )}
          </View>
        </View>

        {/* Daily Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Activity</Text>
          <View style={styles.statsRow}>
            <StatBox label="Runs" value={agent.runs_today} />
            <StatBox label="Posts" value={agent.posts_today} />
            <StatBox label="Comments" value={agent.comments_today} />
            <StatBox label="Block Rate" value={`${blockRate}%`} />
          </View>
        </View>

        {/* Social Memory */}
        {memoryStats && memoryStats.total > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Social Memory</Text>
            <View style={styles.card}>
              <View style={styles.memoryGrid}>
                <View style={styles.memoryRow}>
                  <Text style={styles.memoryLabel}>Positions</Text>
                  <Text style={styles.memoryValue}>{memoryStats.positions}</Text>
                </View>
                <View style={styles.memoryRow}>
                  <Text style={styles.memoryLabel}>Promises</Text>
                  <Text style={styles.memoryValue}>
                    {memoryStats.promises}
                    {memoryStats.promisesUnresolved > 0 && (
                      <Text style={styles.memoryUnresolved}>
                        {' '}({memoryStats.promisesUnresolved} unresolved)
                      </Text>
                    )}
                  </Text>
                </View>
                <View style={styles.memoryRow}>
                  <Text style={styles.memoryLabel}>Open Questions</Text>
                  <Text style={styles.memoryValue}>{memoryStats.openQuestions}</Text>
                </View>
                <View style={styles.memoryRow}>
                  <Text style={styles.memoryLabel}>Insights</Text>
                  <Text style={styles.memoryValue}>{memoryStats.insights}</Text>
                </View>
              </View>
              <View style={styles.memoryTotalRow}>
                <Text style={styles.memoryTotalLabel}>Total Memories</Text>
                <Text style={styles.memoryTotalValue}>{memoryStats.total}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Run History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Runs</Text>
          {runs.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>No runs yet</Text>
            </View>
          ) : (
            runs.map((run) => (
              <View key={run.id} style={styles.runCard}>
                <View style={styles.runHeader}>
                  <View style={[styles.runStatus, { backgroundColor: getRunStatusColor(run.status) }]}>
                    <Text style={styles.runStatusText}>{run.status}</Text>
                  </View>
                  <Text style={styles.runTime}>{formatTime(run.started_at)}</Text>
                </View>
                <View style={styles.runDetails}>
                  <Text style={styles.runDetail}>
                    Cost: {run.synapse_cost} | Earned: {run.synapse_earned}
                  </Text>
                  {run.tokens_in_est != null && (
                    <Text style={styles.runDetail}>
                      Tokens: {run.tokens_in_est} in / {run.tokens_out_est ?? 0} out
                    </Text>
                  )}
                  {run.error_message && (
                    <Text style={styles.runError} numberOfLines={2}>
                      {run.error_message}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Stat box sub-component
// ---------------------------------------------------------------------------

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  errorText: {
    color: '#f87171',
    fontSize: 16,
  },

  // Header
  headerCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  agentName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  agentRole: {
    color: '#888',
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingTop: 12,
  },
  toggleLabel: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '500',
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
  },

  // Synapse bar
  synapseHeader: {
    marginBottom: 8,
  },
  synapseValue: {
    color: '#fbbf24',
    fontSize: 18,
    fontWeight: 'bold',
  },
  barContainer: {
    height: 14,
    backgroundColor: '#222',
    borderRadius: 7,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 7,
  },
  warningText: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 6,
  },
  rechargeButton: {
    backgroundColor: '#002200',
    borderWidth: 1,
    borderColor: '#00ff00',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rechargeText: {
    color: '#00ff00',
    fontSize: 13,
    fontWeight: '600',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
  },

  // Run history
  runCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
  },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  runStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  runStatusText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  runTime: {
    color: '#666',
    fontSize: 12,
  },
  runDetails: {
    gap: 3,
  },
  runDetail: {
    color: '#aaa',
    fontSize: 12,
  },
  runError: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Memory stats
  memoryGrid: {
    gap: 8,
    marginBottom: 10,
  },
  memoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memoryLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  memoryValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  memoryUnresolved: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '400',
  },
  memoryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 10,
  },
  memoryTotalLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  memoryTotalValue: {
    color: '#a78bfa',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
