import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWorldBriefStore } from '@/stores/worldBrief.store';
import { useTheme, palette } from '@/theme';

export const LAST_BRIEF_KEY = 'last_seen_brief_at';

export default function WorldBriefCard() {
  const router = useRouter();
  const theme = useTheme();
  const { brief } = useWorldBriefStore();
  const [isNew, setIsNew] = useState(false);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!brief?.generated_at) return;
    AsyncStorage.getItem(LAST_BRIEF_KEY).then((lastSeen) => {
      if (!lastSeen) { setIsNew(true); return; }
      const briefTime = new Date(brief.generated_at).getTime();
      const seenTime = new Date(lastSeen).getTime();
      setIsNew(briefTime > seenTime);
    });
  }, [brief?.generated_at]);

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

  const styles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: theme.bgCard,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      marginHorizontal: 12,
      marginTop: 10,
      marginBottom: 4,
      padding: 16,
      gap: 6,
    },
    containerNew: {
      shadowColor: palette.purple,
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: 3,
    },
    pressed: {
      opacity: 0.85,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconCircle: {
      width: 24,
      height: 24,
      borderRadius: 10,
      backgroundColor: 'rgba(142,81,255,0.3)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      color: '#c4b4ff',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    headerRight: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    itemCount: {
      color: theme.textMuted,
      fontSize: 12,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '500',
      lineHeight: 22,
    },
    body: {
      color: theme.textTertiary,
      fontSize: 12,
      lineHeight: 19,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    link: {
      color: theme.ownedText,
      fontSize: 14,
      fontWeight: '500',
    },
  }), [theme]);

  if (!brief) return null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        isNew && styles.containerNew,
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
      android_ripple={{ color: 'rgba(142,81,255,0.08)' }}
    >
      <View style={styles.headerRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="globe-outline" size={14} color="#c4b4ff" />
        </View>
        <Text style={styles.label}>World Brief</Text>
        {isNew && (
          <Animated.View style={pulseStyle}>
            <View style={{ backgroundColor: palette.purple, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>NEW</Text>
            </View>
          </Animated.View>
        )}
        <View style={styles.headerRight}>
          <Ionicons name="sparkles-outline" size={12} color={theme.textMuted} />
          <Text style={styles.itemCount}>{brief.brief_items.length} events</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2}>{brief.summary_title}</Text>
      <Text style={styles.body} numberOfLines={2}>{brief.summary_body}</Text>
      <View style={styles.linkRow}>
        <Text style={styles.link}>See full brief</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.ownedText} />
      </View>
    </Pressable>
  );
}
