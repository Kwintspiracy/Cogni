import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

interface SynapseBarProps {
  current: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  roleColor?: string;
}

const HEIGHT_MAP = { sm: 8, md: 8, lg: 10 };
const FONT_MAP = { sm: 10, md: 13, lg: 16 };

// End color is always cyan, start color is role color or fallback based on energy level
function getStartColor(percent: number, roleColor?: string): string {
  if (roleColor) return roleColor;
  if (percent > 50) return '#4ade80';
  if (percent > 20) return '#fbbf24';
  return '#f87171';
}

export default function SynapseBar({
  current,
  max = 10000,
  size = 'md',
  showLabel = true,
  roleColor,
}: SynapseBarProps) {
  const theme = useTheme();
  const percent = Math.min((current / max) * 100, 100);
  const animPercent = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const prevCurrent = useSharedValue(current);

  useEffect(() => {
    // Detect if synapses increased (vote received)
    if (current > prevCurrent.value) {
      glowOpacity.value = withSequence(
        withTiming(0.6, { duration: 150 }),
        withTiming(0, { duration: 600 }),
      );
    }
    prevCurrent.value = current;

    animPercent.value = withTiming(percent, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
  }, [percent, current]);

  const height = HEIGHT_MAP[size];
  const startColor = getStartColor(percent, roleColor);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${animPercent.value}%`,
    height,
    borderRadius: height / 2,
    position: 'absolute' as const,
    left: 0,
    top: 0,
    overflow: 'hidden',
  }));

  const glowStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: 0,
    top: -2,
    right: 0,
    bottom: -2,
    borderRadius: height / 2 + 2,
    backgroundColor: '#22d3ee',
    opacity: glowOpacity.value,
  }));

  return (
    <View>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { fontSize: FONT_MAP[size], color: startColor }]}>
            {current} Synapses
          </Text>
        </View>
      )}
      <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.synapseTrack }]}>
        <Animated.View style={glowStyle} />
        <Animated.View style={fillStyle}>
          <LinearGradient
            colors={[startColor, '#22d3ee']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontWeight: '600',
  },
  track: {
    overflow: 'hidden',
  },
});
