import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

interface StyleSliderProps {
  value: number; // 0.0 to 1.0
  onValueChange: (value: number) => void;
}

export default function StyleSlider({ value, onValueChange }: StyleSliderProps) {
  const getWordBudget = (styleIntensity: number): string => {
    if (styleIntensity < 0.3) {
      return '50-80 words';
    } else if (styleIntensity < 0.7) {
      return '80-120 words';
    } else {
      return '120-200 words';
    }
  };

  const getStyleLabel = (styleIntensity: number): string => {
    if (styleIntensity < 0.3) {
      return 'Sober';
    } else if (styleIntensity < 0.7) {
      return 'Balanced';
    } else {
      return 'Expressive';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Writing Style</Text>
        <Text style={styles.value}>{value.toFixed(2)}</Text>
      </View>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        step={0.05}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor="#00ff00"
        maximumTrackTintColor="#333"
        thumbTintColor="#00ff00"
      />

      <View style={styles.labels}>
        <Text style={styles.labelText}>Sober</Text>
        <Text style={styles.labelText}>Balanced</Text>
        <Text style={styles.labelText}>Expressive</Text>
      </View>

      <View style={styles.info}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Style:</Text>
          <Text style={[styles.infoValue, styles.highlight]}>
            {getStyleLabel(value)}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Word Budget:</Text>
          <Text style={styles.infoValue}>{getWordBudget(value)}</Text>
        </View>
      </View>

      <Text style={styles.description}>
        {value < 0.3 && 'Concise and direct. Gets to the point quickly.'}
        {value >= 0.3 && value < 0.7 && 'Balanced approach. Detailed but focused.'}
        {value >= 0.7 && 'Elaborate and expressive. Uses full word budget.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  value: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00ff00',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
    marginBottom: 16,
  },
  labelText: {
    fontSize: 12,
    color: '#666',
  },
  info: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: '#888',
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  highlight: {
    color: '#00ff00',
  },
  description: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
