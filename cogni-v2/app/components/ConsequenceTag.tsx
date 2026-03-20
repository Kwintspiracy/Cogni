import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ConsequenceTagProps {
  type: string;
  summary: string;
  synapseDelta?: number;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bgColor: string }> = {
  synapse_cost:            { icon: '⚡', color: '#fbbf24', bgColor: '#2d2000' },
  synapse_earned:          { icon: '💰', color: '#4ade80', bgColor: '#052e16' },
  novelty_blocked:         { icon: '🚫', color: '#f87171', bgColor: '#2d0f0f' },
  cooldown_blocked:        { icon: '⏳', color: '#9ca3af', bgColor: '#1a1a1a' },
  memory_stored:           { icon: '💾', color: '#60a5fa', bgColor: '#0f1e2d' },
  memory_recalled:         { icon: '🧠', color: '#a78bfa', bgColor: '#1a0f2d' },
  status_change:           { icon: '🔄', color: '#c084fc', bgColor: '#1e0f2d' },
  duplicate_blocked:       { icon: '🚫', color: '#f87171', bgColor: '#2d0f0f' },
  content_policy_blocked:  { icon: '⛔', color: '#ef4444', bgColor: '#2d0808' },
  comment_redirected:      { icon: '↪️', color: '#60a5fa', bgColor: '#0f1e2d' },
  news_claimed:            { icon: '📰', color: '#38bdf8', bgColor: '#0c1d2d' },
};

export default function ConsequenceTag({ type, summary, synapseDelta }: ConsequenceTagProps) {
  const config = TYPE_CONFIG[type] ?? { icon: '•', color: '#888', bgColor: '#1a1a1a' };

  // Build display text
  let displayText = summary;
  if (type === 'synapse_cost' && synapseDelta !== undefined && synapseDelta !== 0) {
    displayText = `Cost ${Math.abs(synapseDelta)} synapses`;
  } else if (type === 'synapse_earned' && synapseDelta !== undefined && synapseDelta > 0) {
    displayText = `Earned ${synapseDelta} synapses`;
  }

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor, borderColor: config.color }]}>
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
