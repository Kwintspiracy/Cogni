// Event Detail Screen - Full view of a world event with impacts and timeline
import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme, palette, type Theme } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventImpact {
  metric: string;
  before_value: number | null;
  after_value: number | null;
  measured_at: string;
}

interface WorldEventDetail {
  id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  started_at: string | null;
  ends_at: string | null;
  impact_summary: string | null;
  impacts: EventImpact[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, string> = {
  topic_shock: '💥',
  scarcity_shock: '💧',
  community_mood_shift: '🌡️',
  migration_wave: '🌊',
  ideology_catalyst: '💡',
  timed_challenge: '⏱️',
};

const CATEGORY_BORDER_COLORS: Record<string, string> = {
  topic_shock: '#ef4444',
  scarcity_shock: '#3b82f6',
  community_mood_shift: '#f59e0b',
  migration_wave: '#06b6d4',
  ideology_catalyst: '#a78bfa',
  timed_challenge: '#f97316',
};

const CATEGORY_LABELS: Record<string, string> = {
  topic_shock: 'Topic Shock',
  scarcity_shock: 'Scarcity Shock',
  community_mood_shift: 'Mood Shift',
  migration_wave: 'Migration Wave',
  ideology_catalyst: 'Ideology Catalyst',
  timed_challenge: 'Timed Challenge',
};

function getStatusColor(status: string): string {
  switch (status) {
    case 'seeded': return '#888';
    case 'active': return '#4ade80';
    case 'decaying': return '#fbbf24';
    case 'ended': return '#f87171';
    default: return '#666';
  }
}

const STATUS_ORDER = ['seeded', 'active', 'decaying', 'ended'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatMetricChange(before: number | null, after: number | null): string {
  if (before === null && after === null) return '—';
  if (before === null) return `→ ${after}`;
  if (after === null) return `${before} → —`;
  const diff = after - before;
  const sign = diff >= 0 ? '+' : '';
  return `${before} → ${after} (${sign}${diff.toFixed(1)})`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<WorldEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!id) return;
    loadEvent(id);
  }, [id]);

  async function loadEvent(eventId: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_event_with_impacts', {
        p_event_id: eventId,
      });
      if (rpcError) throw rpcError;
      if (!data) {
        setError('Event not found.');
        return;
      }
      setEvent(data as WorldEventDetail);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load event.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'World Event' }} />
        <ActivityIndicator size="large" color={palette.blue} />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'World Event' }} />
        <Text style={styles.errorText}>{error ?? 'Event not found.'}</Text>
      </View>
    );
  }

  const icon = CATEGORY_ICONS[event.category] ?? '?';
  const borderColor = CATEGORY_BORDER_COLORS[event.category] ?? '#444';
  const categoryLabel = CATEGORY_LABELS[event.category] ?? event.category;
  const statusColor = getStatusColor(event.status);
  const currentStatusIndex = STATUS_ORDER.indexOf(event.status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: event.title }} />

      {/* Header card */}
      <View style={[styles.headerCard, { borderLeftColor: borderColor }]}>
        <View style={styles.headerTop}>
          <Text style={styles.headerIcon}>{icon}</Text>
          <View style={styles.headerMeta}>
            <Text style={[styles.categoryLabel, { color: borderColor }]}>
              {categoryLabel}
            </Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: statusColor + '22', borderColor: statusColor },
            ]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {event.status.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.title}>{event.title}</Text>
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DESCRIPTION</Text>
        <Text style={styles.description}>{event.description}</Text>
      </View>

      {/* Impact summary */}
      {event.impact_summary && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>IMPACT SUMMARY</Text>
          <Text style={styles.description}>{event.impact_summary}</Text>
        </View>
      )}

      {/* Measured impacts */}
      {event.impacts && event.impacts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MEASURED IMPACTS</Text>
          {event.impacts.map((impact, idx) => (
            <View key={idx} style={styles.impactRow}>
              <Text style={styles.impactMetric}>{impact.metric}</Text>
              <Text style={styles.impactChange}>
                {formatMetricChange(impact.before_value, impact.after_value)}
              </Text>
              <Text style={styles.impactDate}>
                {formatDate(impact.measured_at)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TIMELINE</Text>
        <View style={styles.timeline}>
          {STATUS_ORDER.map((step, idx) => {
            const isPast = STATUS_ORDER.indexOf(step) < currentStatusIndex;
            const isCurrent = step === event.status;
            const isFuture = STATUS_ORDER.indexOf(step) > currentStatusIndex;
            const stepColor = isFuture ? theme.border : getStatusColor(step);
            let timestamp: string | null = null;
            if (step === 'seeded') timestamp = formatDate(event.created_at);
            if (step === 'active') timestamp = formatDate(event.started_at);
            if (step === 'ended') timestamp = formatDate(event.ends_at);

            return (
              <View key={step} style={styles.timelineRow}>
                {/* Connector line */}
                <View style={styles.timelineConnectorCol}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor: isCurrent || isPast ? stepColor : 'transparent',
                        borderColor: stepColor,
                      },
                    ]}
                  />
                  {idx < STATUS_ORDER.length - 1 && (
                    <View
                      style={[
                        styles.timelineLine,
                        { backgroundColor: isPast ? theme.borderMedium : theme.border },
                      ]}
                    />
                  )}
                </View>
                {/* Label */}
                <View style={styles.timelineLabelCol}>
                  <Text
                    style={[
                      styles.timelineStepLabel,
                      { color: isFuture ? theme.textFaint : theme.textSecondary },
                      isCurrent && { color: theme.textPrimary, fontWeight: 'bold' },
                    ]}
                  >
                    {step.charAt(0).toUpperCase() + step.slice(1)}
                    {isCurrent && ' (current)'}
                  </Text>
                  {timestamp && !isFuture && (
                    <Text style={styles.timelineTimestamp}>{timestamp}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Created at */}
      <Text style={styles.createdAt}>
        Seeded {formatDate(event.created_at)}
      </Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles factory
// ---------------------------------------------------------------------------

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    errorText: {
      color: theme.voteNegative,
      fontSize: 14,
      textAlign: 'center',
    },
    headerCard: {
      backgroundColor: theme.bgCard,
      borderRadius: 8,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      borderLeftWidth: 4,
      marginBottom: 16,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    headerIcon: {
      fontSize: 28,
    },
    headerMeta: {
      flex: 1,
      gap: 6,
    },
    categoryLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      borderWidth: 1,
    },
    statusText: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: 'bold',
      lineHeight: 24,
    },
    section: {
      backgroundColor: theme.bgCard,
      borderRadius: 8,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 12,
    },
    sectionLabel: {
      color: theme.textTertiary,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    description: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    impactRow: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 3,
    },
    impactMetric: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    impactChange: {
      color: theme.votePositive,
      fontSize: 12,
      fontFamily: 'monospace',
    },
    impactDate: {
      color: theme.textTertiary,
      fontSize: 11,
    },
    timeline: {
      gap: 0,
    },
    timelineRow: {
      flexDirection: 'row',
      gap: 12,
    },
    timelineConnectorCol: {
      alignItems: 'center',
      width: 16,
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      marginTop: 4,
    },
    timelineLine: {
      width: 2,
      flex: 1,
      minHeight: 24,
      marginVertical: 2,
    },
    timelineLabelCol: {
      flex: 1,
      paddingBottom: 16,
    },
    timelineStepLabel: {
      fontSize: 13,
      lineHeight: 20,
    },
    timelineTimestamp: {
      color: theme.textTertiary,
      fontSize: 11,
      marginTop: 1,
    },
    createdAt: {
      color: theme.textFaint,
      fontSize: 11,
      textAlign: 'center',
      marginTop: 8,
    },
  });
}
