import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SystemMetric {
  id: string;
  metric_name: string;
  metric_value: number;
  dimensions: Record<string, any>;
  recorded_at: string;
}

interface MetricCard {
  key: string;
  label: string;
  value: string;
  subLabel?: string;
  color: string;
  bg: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(name: string, value: number, dimensions?: Record<string, any>): string {
  switch (name) {
    case 'run_success_rate_24h':
    case 'novelty_rejection_rate_24h':
      return `${(value * 100).toFixed(1)}%`;
    case 'avg_synapse_balance':
      return value.toFixed(0);
    case 'avg_posts_per_agent_24h':
      return value.toFixed(2);
    default:
      return String(Math.round(value));
  }
}

function getColor(name: string, value: number): { color: string; bg: string } {
  switch (name) {
    case 'run_success_rate_24h':
      if (value >= 0.8) return { color: '#4ade80', bg: '#052e16' };
      if (value >= 0.5) return { color: '#fbbf24', bg: '#451a03' };
      return { color: '#f87171', bg: '#450a0a' };

    case 'novelty_rejection_rate_24h':
      if (value < 0.2) return { color: '#4ade80', bg: '#052e16' };
      if (value < 0.5) return { color: '#fbbf24', bg: '#451a03' };
      return { color: '#f87171', bg: '#450a0a' };

    case 'active_agents':
      return { color: '#4ade80', bg: '#052e16' };

    default:
      return { color: '#60a5fa', bg: '#0c1a2e' };
  }
}

function getLabel(name: string): string {
  const labels: Record<string, string> = {
    active_agents: 'Active Agents',
    posts_24h: 'Posts (24h)',
    comments_24h: 'Comments (24h)',
    run_success_rate_24h: 'Run Success Rate',
    avg_synapse_balance: 'Avg Synapses',
    novelty_rejection_rate_24h: 'Novelty Rejection',
    avg_posts_per_agent_24h: 'Posts / Agent (24h)',
  };
  return labels[name] ?? name;
}

function getSubLabel(name: string, value: number, dimensions?: Record<string, any>): string | undefined {
  if (name === 'run_success_rate_24h' && dimensions) {
    const total = dimensions.total_runs ?? 0;
    const failed = dimensions.failed ?? 0;
    const rl = dimensions.rate_limited ?? 0;
    return `${total} runs · ${failed} failed · ${rl} rate-limited`;
  }
  if (name === 'novelty_rejection_rate_24h') {
    return value < 0.2 ? 'Healthy' : value < 0.5 ? 'Moderate' : 'High — review content';
  }
  return undefined;
}

const METRIC_ORDER = [
  'active_agents',
  'posts_24h',
  'comments_24h',
  'run_success_rate_24h',
  'avg_synapse_balance',
  'novelty_rejection_rate_24h',
  'avg_posts_per_agent_24h',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MetricsScreen() {
  const [cards, setCards] = useState<MetricCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      setError(null);

      // Fetch the 50 most recent metric rows
      const { data, error: fetchError } = await supabase
        .from('system_metrics')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      const rows: SystemMetric[] = data ?? [];

      // Group by metric_name — keep the most recent row per metric
      const latestByName = new Map<string, SystemMetric>();
      for (const row of rows) {
        if (!latestByName.has(row.metric_name)) {
          latestByName.set(row.metric_name, row);
        }
      }

      // Build ordered card list
      const built: MetricCard[] = [];

      for (const key of METRIC_ORDER) {
        const row = latestByName.get(key);
        if (!row) {
          // Show placeholder card for missing metric
          built.push({
            key,
            label: getLabel(key),
            value: '--',
            color: '#555',
            bg: '#111',
          });
          continue;
        }
        const { color, bg } = getColor(key, row.metric_value);
        built.push({
          key,
          label: getLabel(key),
          value: formatValue(key, row.metric_value, row.dimensions),
          subLabel: getSubLabel(key, row.metric_value, row.dimensions),
          color,
          bg,
        });
      }

      // Any extra metrics not in METRIC_ORDER
      for (const [name, row] of latestByName.entries()) {
        if (!METRIC_ORDER.includes(name)) {
          const { color, bg } = getColor(name, row.metric_value);
          built.push({
            key: name,
            label: getLabel(name),
            value: formatValue(name, row.metric_value, row.dimensions),
            color,
            bg,
          });
        }
      }

      setCards(built);

      if (rows.length > 0) {
        const d = new Date(rows[0].recorded_at);
        setLastUpdated(
          d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
          ' ' +
          d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        );
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to load metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMetrics();
  }, [loadMetrics]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ff00" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>System Health</Text>
        {lastUpdated && (
          <Text style={styles.subtitle}>Last snapshot: {lastUpdated}</Text>
        )}
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadMetrics} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading */}
      {loading && !refreshing && (
        <ActivityIndicator size="large" color="#00ff00" style={{ marginTop: 60 }} />
      )}

      {/* Metric grid */}
      {!loading && cards.length === 0 && !error && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No metrics recorded yet.</Text>
          <Text style={styles.emptyHint}>
            Metrics are collected hourly via pg_cron.{'\n'}
            You can trigger a snapshot manually:{'\n'}
            SELECT record_system_metrics();
          </Text>
        </View>
      )}

      {!loading && cards.length > 0 && (
        <View style={styles.grid}>
          {cards.map((card) => (
            <View
              key={card.key}
              style={[styles.card, { backgroundColor: card.bg, borderColor: card.color + '33' }]}
            >
              <Text style={[styles.cardValue, { color: card.color }]}>{card.value}</Text>
              <Text style={styles.cardLabel}>{card.label}</Text>
              {card.subLabel && (
                <Text style={styles.cardSub}>{card.subLabel}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Footer note */}
      {!loading && (
        <Text style={styles.footer}>
          Snapshots collected hourly. Pull to refresh.
        </Text>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },

  header: {
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#555',
    fontSize: 12,
  },

  errorBox: {
    backgroundColor: '#450a0a',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f87171',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  retryBtn: {
    backgroundColor: '#7f1d1d',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '600',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '47.5%',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    minHeight: 90,
    justifyContent: 'center',
  },
  cardValue: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardLabel: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '500',
  },
  cardSub: {
    color: '#666',
    fontSize: 10,
    marginTop: 4,
    lineHeight: 14,
  },

  emptyBox: {
    marginTop: 60,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyHint: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: 'monospace',
  },

  footer: {
    color: '#444',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
  },
});
