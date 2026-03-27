// WritingEventCard - Feed card for active Literary Forge writing events
import { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { WritingEvent } from '@/services/writingEvent.service';

// Amber/gold accent for literary events
const LITERARY_COLOR = '#f59e0b';

const PHASES = ['drafting', 'revision', 'polish_canonize'];
const PHASE_LABELS: Record<string, string> = {
  drafting: 'Draft',
  revision: 'Revise',
  polish_canonize: 'Polish',
};

interface WritingEventCardProps {
  event: WritingEvent;
  fragmentCount?: number;
  voteCount?: number;
}

function useCountdown(endsAt?: string): string | null {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!endsAt) return;

    function update() {
      const end = new Date(endsAt!).getTime();
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        setRemaining('Ended');
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);

      if (days > 0) {
        setRemaining(`${days}d ${hours}h remaining`);
      } else if (hours > 0) {
        setRemaining(`${hours}h ${minutes}m remaining`);
      } else {
        setRemaining(`${minutes}m remaining`);
      }
    }

    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [endsAt]);

  return remaining;
}

export default function WritingEventCard({ event, fragmentCount, voteCount }: WritingEventCardProps) {
  const router = useRouter();
  const theme = useTheme();
  const countdown = useCountdown(event.phase_ends_at);
  const currentPhaseIndex = PHASES.indexOf(event.current_phase);

  function handlePress() {
    router.push(`/events/writing/${event.id}` as any);
  }

  const styles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: theme.bgCard,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
      borderLeftWidth: 4,
      borderLeftColor: LITERARY_COLOR,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    categoryIcon: {
      fontSize: 16,
    },
    categoryLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: LITERARY_COLOR,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      borderWidth: 1,
      backgroundColor: LITERARY_COLOR + '22',
      borderColor: LITERARY_COLOR,
    },
    pulseDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: LITERARY_COLOR,
    },
    statusText: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: LITERARY_COLOR,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: 'bold',
      marginBottom: 4,
      lineHeight: 20,
    },
    genreRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 12,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      backgroundColor: 'rgba(245,158,11,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.25)',
    },
    badgeText: {
      color: LITERARY_COLOR,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    phaseBarContainer: {
      marginBottom: 10,
    },
    phaseBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 0,
      marginBottom: 4,
    },
    phaseDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
    },
    phaseConnector: {
      height: 2,
      flex: 1,
    },
    phaseLabelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    phaseLabel: {
      fontSize: 10,
      fontWeight: '500',
    },
    footer: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    statText: {
      color: theme.textMuted,
      fontSize: 12,
    },
    countdown: {
      color: LITERARY_COLOR,
      fontSize: 12,
      fontWeight: '600',
    },
  }), [theme]);

  return (
    <Pressable
      style={styles.container}
      onPress={handlePress}
      android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.categoryIcon}>📖</Text>
          <Text style={styles.categoryLabel}>Literary Forge</Text>
        </View>
        <View style={styles.statusBadge}>
          <View style={styles.pulseDot} />
          <Text style={styles.statusText}>ACTIVE</Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title}>"{event.world_event_title}"</Text>

      {/* Genre + Tone badges */}
      <View style={styles.genreRow}>
        {event.genre ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{event.genre}</Text>
          </View>
        ) : null}
        {event.tone ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{event.tone}</Text>
          </View>
        ) : null}
      </View>

      {/* Phase progress bar */}
      <View style={styles.phaseBarContainer}>
        <View style={styles.phaseBar}>
          {PHASES.map((phase, index) => {
            const isCompleted = index < currentPhaseIndex;
            const isCurrent = index === currentPhaseIndex;
            const isFuture = index > currentPhaseIndex;

            const dotColor = isFuture ? theme.border : LITERARY_COLOR;
            const dotBg = isCurrent || isCompleted ? LITERARY_COLOR : 'transparent';
            const lineColor = isCompleted ? LITERARY_COLOR : theme.border;

            return (
              <View key={phase} style={{ flexDirection: 'row', alignItems: 'center', flex: index < PHASES.length - 1 ? 1 : 0 }}>
                <View style={[styles.phaseDot, { borderColor: dotColor, backgroundColor: dotBg }]} />
                {index < PHASES.length - 1 && (
                  <View style={[styles.phaseConnector, { backgroundColor: lineColor }]} />
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.phaseLabelsRow}>
          {PHASES.map((phase, index) => {
            const isCurrent = index === currentPhaseIndex;
            const isFuture = index > currentPhaseIndex;
            return (
              <Text
                key={phase}
                style={[
                  styles.phaseLabel,
                  {
                    color: isFuture
                      ? theme.textFaint
                      : isCurrent
                      ? LITERARY_COLOR
                      : theme.textMuted,
                    fontWeight: isCurrent ? '700' : '500',
                  },
                ]}
              >
                {PHASE_LABELS[phase]}
              </Text>
            );
          })}
        </View>
      </View>

      {/* Footer: stats + countdown */}
      <View style={styles.footer}>
        <View style={styles.statsRow}>
          {fragmentCount !== undefined && (
            <Text style={styles.statText}>{fragmentCount} fragments</Text>
          )}
          {voteCount !== undefined && (
            <Text style={styles.statText}>· {voteCount} votes</Text>
          )}
        </View>
        {countdown && (
          <Text style={styles.countdown}>{countdown}</Text>
        )}
      </View>
    </Pressable>
  );
}
