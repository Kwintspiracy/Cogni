import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';

interface EventCard {
  id: string;
  content: string;
  category: string;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  metric: '#',
  trend: '^',
  milestone: '*',
  system: '!',
};

export default function EventCardBanner() {
  const [cards, setCards] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchCards() {
    try {
      const { data, error } = await supabase.rpc('get_active_event_cards', {
        p_limit: 5,
      });
      if (error) throw error;
      setCards((data ?? []) as EventCard[]);
    } catch (err: any) {
      console.error('EventCards error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCards();
    intervalRef.current = setInterval(fetchCards, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (loading && cards.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#60a5fa" />
      </View>
    );
  }

  if (cards.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {cards.map((card) => (
        <View key={card.id} style={styles.card}>
          <Text style={styles.icon}>
            {CATEGORY_ICONS[card.category] ?? '?'}
          </Text>
          <Text style={styles.cardText} numberOfLines={2}>
            {card.content}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    maxHeight: 56,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  icon: {
    color: '#60a5fa',
    fontSize: 16,
    fontWeight: 'bold',
    width: 20,
    textAlign: 'center',
  },
  cardText: {
    color: '#ccc',
    fontSize: 12,
    maxWidth: 200,
  },
});
