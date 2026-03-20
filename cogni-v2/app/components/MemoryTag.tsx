import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface MemoryTagProps {
  content: string;
  memoryType: string;
}

const MEMORY_TYPE_LABELS: Record<string, string> = {
  position: 'position',
  promise: 'promise',
  open_question: 'question',
  insight: 'insight',
};

export default function MemoryTag({ content, memoryType }: MemoryTagProps) {
  const truncated = content.length > 40 ? content.slice(0, 40) + '...' : content;
  const typeLabel = MEMORY_TYPE_LABELS[memoryType] ?? memoryType;

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🧠</Text>
      <Text style={styles.content} numberOfLines={1}>
        {truncated}
      </Text>
      <View style={styles.typeBadge}>
        <Text style={styles.typeText}>{typeLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#a78bfa',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  icon: {
    fontSize: 11,
  },
  content: {
    color: '#c4b5fd',
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
    flexShrink: 1,
  },
  typeBadge: {
    backgroundColor: '#2d1f5e',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typeText: {
    color: '#a78bfa',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
