import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import ConsequenceTag from './ConsequenceTag';
import { useTheme } from '@/theme';

interface ConsequenceItem {
  id: string;
  consequence_type: string;
  consequence_summary: string;
  synapse_delta: number;
  created_at: string;
}

interface ImpactSummaryProps {
  consequences: ConsequenceItem[];
}

function formatDateTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ImpactSummary({ consequences }: ImpactSummaryProps) {
  const theme = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: theme.bgCard,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    emptyCard: {
      backgroundColor: theme.bgCard,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 13,
      fontStyle: 'italic',
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    summaryLabel: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    summaryDelta: {
      color: theme.textSecondary,
      fontSize: 16,
      fontWeight: 'bold',
    },
    deltaPositive: {
      color: '#4ade80',
    },
    deltaNegative: {
      color: '#f87171',
    },
    typeRow: {
      flexGrow: 0,
      marginBottom: 10,
    },
    typeRowContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 6,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 2,
    },
    countBadge: {
      backgroundColor: theme.bgElevated,
      borderRadius: 8,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -4,
      marginRight: 6,
    },
    countText: {
      color: theme.textPrimary,
      fontSize: 10,
      fontWeight: '700',
    },
    list: {
      gap: 6,
    },
    consequenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    consequenceLeft: {
      flex: 1,
      marginRight: 8,
    },
    consequenceTime: {
      color: theme.textMuted,
      fontSize: 11,
      flexShrink: 0,
    },
  }), [theme]);

  if (!consequences || consequences.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>No consequences recorded yet</Text>
      </View>
    );
  }

  // Total synapse impact
  const totalDelta = consequences.reduce((sum, c) => sum + (c.synapse_delta ?? 0), 0);

  // Group by type with counts
  const typeCounts: Record<string, number> = {};
  for (const c of consequences) {
    typeCounts[c.consequence_type] = (typeCounts[c.consequence_type] ?? 0) + 1;
  }

  return (
    <View style={styles.container}>
      {/* Summary row */}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Net Synapse Impact</Text>
        <Text style={[
          styles.summaryDelta,
          totalDelta > 0 && styles.deltaPositive,
          totalDelta < 0 && styles.deltaNegative,
        ]}>
          {totalDelta > 0 ? '+' : ''}{totalDelta}
        </Text>
      </View>

      {/* Type breakdown */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.typeRow}
        contentContainerStyle={styles.typeRowContent}
      >
        {Object.entries(typeCounts).map(([type, count]) => (
          <View key={type} style={styles.typeChip}>
            <ConsequenceTag type={type} summary={type.replace(/_/g, ' ')} />
            {count > 1 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{count}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Recent consequence list */}
      <View style={styles.list}>
        {consequences.slice(0, 10).map((c) => (
          <View key={c.id} style={styles.consequenceRow}>
            <View style={styles.consequenceLeft}>
              <ConsequenceTag
                type={c.consequence_type}
                summary={c.consequence_summary}
                synapseDelta={c.synapse_delta}
              />
            </View>
            <Text style={styles.consequenceTime}>{formatDateTime(c.created_at)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
