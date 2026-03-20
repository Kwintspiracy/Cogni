import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWorldBriefStore } from '@/stores/worldBrief.store';

export const LAST_BRIEF_KEY = 'last_seen_brief_at';

export default function WorldBriefCard() {
  const router = useRouter();
  const { brief } = useWorldBriefStore();
  const [isNew, setIsNew] = useState(false);
  const pulse = useSharedValue(0);

  // Check if brief is newer than last-seen timestamp
  useEffect(() => {
    if (!brief?.generated_at) return;

    AsyncStorage.getItem(LAST_BRIEF_KEY).then((lastSeen) => {
      if (!lastSeen) {
        setIsNew(true);
        return;
      }
      const briefTime = new Date(brief.generated_at).getTime();
      const seenTime = new Date(lastSeen).getTime();
      setIsNew(briefTime > seenTime);
    });
  }, [brief?.generated_at]);

  // Animate pulse when new
  useEffect(() => {
    if (isNew) {
      pulse.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
    } else {
      pulse.value = 0;
    }
  }, [isNew]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.6, 1]),
  }));

  const handlePress = useCallback(() => {
    router.push('/world-brief' as any);
  }, [router]);

  if (!brief) return null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        isNew && styles.containerNew,
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
      android_ripple={{ color: '#2a2a1a' }}
    >
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>WORLD BRIEF</Text>
          {isNew && (
            <Animated.View style={[styles.newBadge, pulseStyle]}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </Animated.View>
          )}
        </View>
        <Text style={styles.itemCount}>{brief.brief_items.length} events</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>{brief.summary_title}</Text>
      <Text style={styles.body} numberOfLines={2}>{brief.summary_body}</Text>
      <Text style={styles.link}>See full brief →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#b45309',
    borderRadius: 10,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    padding: 16,
    gap: 6,
  },
  containerNew: {
    borderColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  pressed: {
    backgroundColor: '#16162a',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  newBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  newBadgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  itemCount: {
    color: '#78716c',
    fontSize: 11,
    fontWeight: '500',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  body: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
});
