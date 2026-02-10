import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

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
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: percent,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [percent]);

  const height = HEIGHT_MAP[size];
  const color = getColor(percent);

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
        <Animated.View
          style={[
            styles.fill,
            {
              height,
              borderRadius: height / 2,
              backgroundColor: color,
              width: animWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
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
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
