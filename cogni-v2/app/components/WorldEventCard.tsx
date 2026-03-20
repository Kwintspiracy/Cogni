// WorldEventCard - Displays a world event in the feed
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export interface WorldEvent {
  id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  started_at?: string;
  ends_at?: string;
  impact_summary?: string;
}

interface WorldEventCardProps {
  event: WorldEvent;
  onPress?: () => void;
}

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

function getStatusStyle(status: string): { label: string; color: string; pulse: boolean } {
  switch (status) {
    case 'seeded':
      return { label: 'SEEDED', color: '#666', pulse: false };
    case 'active':
      return { label: 'ACTIVE', color: '#4ade80', pulse: true };
    case 'decaying':
      return { label: 'DECAYING', color: '#fbbf24', pulse: false };
    case 'ended':
      return { label: 'ENDED', color: '#f87171', pulse: false };
    default:
      return { label: status.toUpperCase(), color: '#666', pulse: false };
  }
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

export default function WorldEventCard({ event, onPress }: WorldEventCardProps) {
  const router = useRouter();
  const statusStyle = getStatusStyle(event.status);
  const countdown = useCountdown(event.ends_at);
  const icon = CATEGORY_ICONS[event.category] ?? '?';
  const borderColor = CATEGORY_BORDER_COLORS[event.category] ?? '#444';
  const categoryLabel = CATEGORY_LABELS[event.category] ?? event.category;

  function handlePress() {
    if (onPress) {
      onPress();
    } else {
      router.push(`/events/${event.id}` as any);
    }
  }

  return (
    <Pressable
      style={[styles.container, { borderLeftColor: borderColor }]}
      onPress={handlePress}
      android_ripple={{ color: '#222' }}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.categoryIcon}>{icon}</Text>
          <Text style={[styles.categoryLabel, { color: borderColor }]}>
            {categoryLabel}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.color + '22', borderColor: statusStyle.color }]}>
          {statusStyle.pulse && <View style={[styles.pulseDot, { backgroundColor: statusStyle.color }]} />}
          <Text style={[styles.statusText, { color: statusStyle.color }]}>
            {statusStyle.label}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title}>{event.title}</Text>

      {/* Description */}
      <Text style={styles.description} numberOfLines={3}>
        {event.description}
      </Text>

      {/* Footer: countdown or impact summary */}
      {(countdown || event.impact_summary) && (
        <View style={styles.footer}>
          {countdown && (
            <Text style={styles.countdown}>{countdown}</Text>
          )}
          {event.impact_summary && !countdown && (
            <Text style={styles.impactSummary} numberOfLines={1}>
              {event.impact_summary}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
    borderLeftWidth: 4,
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
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 6,
    lineHeight: 20,
  },
  description: {
    color: '#999',
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  countdown: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
  },
  impactSummary: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
