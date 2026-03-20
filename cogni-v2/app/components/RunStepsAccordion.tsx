import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunStep {
  id: string;
  step_index: number;
  step_type: string;
  payload: any;
  created_at: string;
}

interface RunStepsAccordionProps {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStepTypeColor(stepType: string): string {
  switch (stepType) {
    case 'tool_call': return '#60a5fa';
    case 'tool_result': return '#34d399';
    case 'llm_request': return '#a78bfa';
    case 'llm_response': return '#c084fc';
    case 'action': return '#fbbf24';
    case 'error': return '#f87171';
    case 'policy_block': return '#fb923c';
    case 'memory_store': return '#4ade80';
    case 'post_created': return '#4ade80';
    case 'comment_created': return '#4ade80';
    default: return '#888';
  }
}

function summarizePayload(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') {
    return payload.length > 120 ? payload.slice(0, 120) + '...' : payload;
  }
  // Extract useful fields from common payload shapes
  if (payload.action) return `action: ${payload.action}`;
  if (payload.tool) return `tool: ${payload.tool}`;
  if (payload.error) return `error: ${payload.error}`;
  if (payload.thought) {
    const t = String(payload.thought);
    return t.length > 120 ? t.slice(0, 120) + '...' : t;
  }
  if (payload.content) {
    const c = String(payload.content);
    return c.length > 120 ? c.slice(0, 120) + '...' : c;
  }
  const str = JSON.stringify(payload);
  return str.length > 120 ? str.slice(0, 120) + '...' : str;
}

function elapsedBetween(from: string, to: string | null): string {
  if (!to) return '';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RunStepsAccordion({ runId, startedAt, finishedAt }: RunStepsAccordionProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<RunStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    // First expand
    setExpanded(true);
    if (steps !== null) return; // Already loaded

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('run_steps')
        .select('*')
        .eq('run_id', runId)
        .order('step_index');
      if (fetchError) throw fetchError;
      setSteps((data as RunStep[]) ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load steps');
      setSteps([]);
    } finally {
      setLoading(false);
    }
  }

  const elapsed = elapsedBetween(startedAt, finishedAt);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <Text style={styles.toggleLabel}>
          {expanded ? 'Hide Steps' : 'View Steps'}
          {elapsed ? ` · ${elapsed}` : ''}
        </Text>
        <Text style={styles.toggleChevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.stepsContainer}>
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#666" />
              <Text style={styles.loadingText}>Loading steps...</Text>
            </View>
          )}

          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          {!loading && steps !== null && steps.length === 0 && (
            <Text style={styles.emptyText}>No steps recorded for this run</Text>
          )}

          {!loading && steps !== null && steps.map((step, idx) => {
            const summary = summarizePayload(step.payload);
            const stepColor = getStepTypeColor(step.step_type);
            return (
              <View key={step.id} style={styles.stepRow}>
                <View style={styles.stepLeft}>
                  <View style={styles.stepIndexDot}>
                    <Text style={styles.stepIndex}>{step.step_index}</Text>
                  </View>
                  {idx < steps.length - 1 && <View style={styles.stepLine} />}
                </View>
                <View style={styles.stepBody}>
                  <View style={[styles.stepTypeBadge, { backgroundColor: stepColor + '22', borderColor: stepColor + '66' }]}>
                    <Text style={[styles.stepTypeText, { color: stepColor }]}>
                      {step.step_type}
                    </Text>
                  </View>
                  {summary ? (
                    <Text style={styles.stepSummary} numberOfLines={3}>
                      {summary}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  toggleLabel: {
    color: '#555',
    fontSize: 12,
    fontWeight: '500',
  },
  toggleChevron: {
    color: '#444',
    fontSize: 10,
  },

  stepsContainer: {
    marginTop: 10,
    gap: 0,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    color: '#555',
    fontSize: 12,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    paddingVertical: 6,
  },
  emptyText: {
    color: '#555',
    fontSize: 12,
    paddingVertical: 6,
  },

  // Step row
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 36,
  },
  stepLeft: {
    alignItems: 'center',
    width: 20,
  },
  stepIndexDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  stepIndex: {
    color: '#666',
    fontSize: 9,
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    width: 1,
    backgroundColor: '#222',
    marginVertical: 2,
  },
  stepBody: {
    flex: 1,
    paddingBottom: 10,
    gap: 4,
  },
  stepTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  stepTypeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepSummary: {
    color: '#777',
    fontSize: 11,
    lineHeight: 16,
  },
});
