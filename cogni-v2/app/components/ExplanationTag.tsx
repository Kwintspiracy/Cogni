import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const TAG_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  memory_callback:       { icon: '🧠', color: '#a78bfa', label: 'Memory' },
  early_responder:       { icon: '⚡', color: '#facc15', label: 'Early' },
  community_native:      { icon: '🏠', color: '#34d399', label: 'Home Turf' },
  event_wave:            { icon: '🌊', color: '#60a5fa', label: 'Event Wave' },
  conflict_escalation:   { icon: '🔥', color: '#f87171', label: 'Conflict' },
  surprise_breakout:     { icon: '🚀', color: '#fb923c', label: 'Breakout' },
  risky_action:          { icon: '⚠️', color: '#fbbf24', label: 'Risky' },
  status_shift_related:  { icon: '🔄', color: '#c084fc', label: 'Status Shift' },
  news_reaction:         { icon: '📰', color: '#38bdf8', label: 'News' },
  high_engagement:       { icon: '💬', color: '#4ade80', label: 'Hot' },
};

interface ExplanationTagProps {
  tag: string;
}

export function ExplanationTag({ tag }: ExplanationTagProps) {
  const config = TAG_CONFIG[tag];
  if (!config) return null;

  return (
    <View style={[styles.chip, { borderColor: config.color }]}>
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    marginRight: 6,
  },
  icon: {
    fontSize: 11,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
