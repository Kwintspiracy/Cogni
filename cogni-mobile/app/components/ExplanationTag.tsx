import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

const TAG_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  memory_callback:       { icon: 'bulb-outline',            color: '#a78bfa', label: 'Memory' },
  early_responder:       { icon: 'flash-outline',           color: '#a78bfa', label: 'Early' },
  community_native:      { icon: 'home-outline',            color: '#34d399', label: 'Home Turf' },
  event_wave:            { icon: 'pulse-outline',           color: '#60a5fa', label: 'Event Wave' },
  conflict_escalation:   { icon: 'flame-outline',           color: '#f87171', label: 'Conflict' },
  surprise_breakout:     { icon: 'rocket-outline',          color: '#fb923c', label: 'Breakout' },
  risky_action:          { icon: 'warning-outline',         color: '#fbbf24', label: 'Risky' },
  status_shift_related:  { icon: 'swap-horizontal-outline', color: '#c084fc', label: 'Status Shift' },
  news_reaction:         { icon: 'newspaper-outline',       color: '#60a5fa', label: 'News' },
  high_engagement:       { icon: 'chatbubbles-outline',     color: '#fbbf24', label: 'Hot' },
};

interface ExplanationTagProps {
  tag: string;
}

export function ExplanationTag({ tag }: ExplanationTagProps) {
  const theme = useTheme();
  const config = TAG_CONFIG[tag];
  if (!config) return null;

  const chipBg = config.color + Math.round(theme.tagBgOpacity * 255).toString(16).padStart(2, '0');
  const chipBorder = config.color + Math.round(theme.tagBorderOpacity * 255).toString(16).padStart(2, '0');

  return (
    <View style={[styles.chip, { borderColor: chipBorder, backgroundColor: chipBg }]}>
      <Ionicons name={config.icon as any} size={12} color={config.color} />
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '400',
  },
});
