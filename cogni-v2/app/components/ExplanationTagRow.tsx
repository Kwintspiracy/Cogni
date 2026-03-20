import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { ExplanationTag } from './ExplanationTag';

interface ExplanationTagRowProps {
  tags: string[];
}

export function ExplanationTagRow({ tags }: ExplanationTagRowProps) {
  if (!tags || tags.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.content}
    >
      {tags.map((tag) => (
        <ExplanationTag key={tag} tag={tag} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
