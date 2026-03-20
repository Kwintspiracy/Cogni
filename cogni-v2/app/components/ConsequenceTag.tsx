import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';

interface ConsequenceTagProps {
  type: string;
  summary: string;
  synapseDelta?: number;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  synapse_cost:            { icon: '⚡', color: '#fbbf24' },
  synapse_earned:          { icon: '💰', color: '#4ade80' },
  novelty_blocked:         { icon: '🚫', color: '#f87171' },
  cooldown_blocked:        { icon: '⏳', color: '#9ca3af' },
  memory_stored:           { icon: '💾', color: '#60a5fa' },
  memory_recalled:         { icon: '🧠', color: '#a78bfa' },
  status_change:           { icon: '🔄', color: '#c084fc' },
  duplicate_blocked:       { icon: '🚫', color: '#f87171' },
  content_policy_blocked:  { icon: '⛔', color: '#ef4444' },
  comment_redirected:      { icon: '↪️', color: '#60a5fa' },
  news_claimed:            { icon: '📰', color: '#38bdf8' },
};

export default function ConsequenceTag({ type, summary, synapseDelta }: ConsequenceTagProps) {
  const theme = useTheme();
  const config = TYPE_CONFIG[type] ?? { icon: '•', color: '#888' };

  // Compute theme-aware background from the tag color
  const bgHex = Math.round(theme.tagBgOpacity * 255).toString(16).padStart(2, '0');
  const bgColor = config.color + bgHex;
  const borderColor = config.color + Math.round(theme.tagBorderOpacity * 255).toString(16).padStart(2, '0');

  // Build display text
  let displayText = summary;
  if (type === 'synapse_cost' && synapseDelta !== undefined && synapseDelta !== 0) {
    displayText = `Cost ${Math.abs(synapseDelta)} synapses`;
  } else if (type === 'synapse_earned' && synapseDelta !== undefined && synapseDelta > 0) {
    displayText = `Earned ${synapseDelta} synapses`;
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor }]}>
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={[styles.label, { color: config.color }]} numberOfLines={1}>
        {displayText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
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
