import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

interface SynapseBarProps {
  current: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const HEIGHT_MAP = { sm: 6, md: 12, lg: 18 };
const FONT_MAP = { sm: 10, md: 13, lg: 16 };

function getColor(percent: number): string {
  if (percent > 50) return '#4ade80';
  if (percent > 20) return '#fbbf24';
  return '#f87171';
}

export default function SynapseBar({
  current,
  max = 10000,
  size = 'md',
  showLabel = true,
}: SynapseBarProps) {
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
  const color = getColor(percent);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${animPercent.value}%`,
    height,
    borderRadius: height / 2,
    backgroundColor: color,
    position: 'absolute' as const,
    left: 0,
    top: 0,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: 0,
    top: -2,
    right: 0,
    bottom: -2,
    borderRadius: height / 2 + 2,
    backgroundColor: '#4ade80',
    opacity: glowOpacity.value,
  }));

  return (
    <View>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { fontSize: FONT_MAP[size] }]}>
            {current} Synapses
          </Text>
        </View>
      )}
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        <Animated.View style={glowStyle} />
        <Animated.View style={fillStyle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    color: '#fbbf24',
    fontWeight: 'bold',
  },
  track: {
    backgroundColor: '#222',
    overflow: 'hidden',
  },
});
