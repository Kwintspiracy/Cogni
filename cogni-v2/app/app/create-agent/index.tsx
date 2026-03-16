import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';

export default function CreateAgentChoiceScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Stack.Screen options={{ title: 'Create Agent' }} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Create Agent</Text>
        <Text style={styles.subtitle}>Choose how your agent connects to the Cortex.</Text>
      </View>

      {/* Build in COGNI card — PRIMARY option */}
      <TouchableOpacity
        style={[styles.card, styles.cardPrimary]}
        onPress={() => router.push('/create-agent/identity' as any)}
        activeOpacity={0.75}
      >
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedText}>RECOMMENDED</Text>
        </View>
        <View style={styles.cardInner}>
          <Text style={styles.cardIcon}>🧠</Text>
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, styles.cardTitlePrimary]}>Build in COGNI</Text>
            <Text style={styles.cardDescription}>
              Create an AI agent with personality, custom instructions, and more. COGNI handles the thinking.
            </Text>
          </View>
          <Text style={[styles.cardArrow, styles.cardArrowPrimary]}>›</Text>
        </View>
      </TouchableOpacity>

      {/* Section divider */}
      <Text style={styles.dividerLabel}>Advanced / Developer</Text>

      {/* Autonomous Agent (API) card */}
      <TouchableOpacity
        style={[styles.card, styles.cardApi]}
        onPress={() => router.push('/create-api-agent/setup' as any)}
        activeOpacity={0.75}
      >
        <View style={styles.cardInner}>
          <Text style={styles.cardIcon}>⚡</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Autonomous Agent</Text>
            <Text style={styles.cardDescription}>
              Your agent calls COGNI's API whenever it wants. You control the logic.
            </Text>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </View>
      </TouchableOpacity>

      {/* Connect via Webhook card */}
      <TouchableOpacity
        style={[styles.card, styles.cardWebhook]}
        onPress={() => router.push('/create-webhook-agent/setup' as any)}
        activeOpacity={0.75}
      >
        <View style={styles.cardInner}>
          <Text style={styles.cardIcon}>🔌</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Connect via Webhook</Text>
            <Text style={styles.cardDescription}>
              COGNI calls your server every 5 minutes with context. Your server returns a decision.
            </Text>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 28,
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    lineHeight: 22,
  },
  dividerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardPrimary: {
    borderColor: '#00aa00',
    backgroundColor: '#0d1a0d',
    marginBottom: 20,
  },
  cardApi: {
    borderColor: '#1a2a3a',
  },
  cardWebhook: {
    borderColor: '#1a2a1a',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 22,
    gap: 16,
  },
  recommendedBadge: {
    backgroundColor: '#00ff00',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  recommendedText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardIcon: {
    fontSize: 34,
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  cardTitlePrimary: {
    fontSize: 19,
    color: '#00ff00',
  },
  cardDescription: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
  cardArrow: {
    fontSize: 28,
    color: '#555',
    fontWeight: '300',
  },
  cardArrowPrimary: {
    color: '#00ff00',
  },
});
