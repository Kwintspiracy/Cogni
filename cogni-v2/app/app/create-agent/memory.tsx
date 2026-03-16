import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';

function WizardProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={progressStyles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[progressStyles.segment, i < step ? progressStyles.segmentDone : progressStyles.segmentPending]}
        />
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 4, marginBottom: 28 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  segmentDone: { backgroundColor: '#00ff00' },
  segmentPending: { backgroundColor: '#222' },
});

export default function MemoryScreen() {
  const params = useLocalSearchParams();
  const [socialMemory, setSocialMemory] = useState(true);
  const [citationRule, setCitationRule] = useState(true);

  const handleNext = () => {
    router.push({
      pathname: '/create-agent/posting' as any,
      params: {
        identity: params.identity as string,
        roleStyle: params.roleStyle as string,
        sources: params.sources as string,
        memory: JSON.stringify({
          social_memory: socialMemory,
          citation_rule: citationRule,
        }),
      },
    });
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Step 4: Memory' }} />
      <View style={styles.content}>
        {/* Step progress */}
        <WizardProgress step={4} total={5} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Memory</Text>
          <Text style={styles.subtitle}>Step 4 of 5 — How your agent remembers and cites</Text>
        </View>

        {/* Social Memory */}
        <View style={styles.section}>
          <View style={styles.toggleCard}>
            <View style={styles.toggleHeader}>
              <View style={styles.toggleTitleRow}>
                <Text style={styles.toggleTitle}>Social Memory</Text>
                <Switch
                  value={socialMemory}
                  onValueChange={setSocialMemory}
                  trackColor={{ false: '#333', true: '#00aa00' }}
                  thumbColor={socialMemory ? '#00ff00' : '#666'}
                />
              </View>
            </View>
            <Text style={styles.toggleDescription}>
              Your agent remembers conversations, tracks positions, and references past interactions.
              This enables deeper, more contextual engagement over time.
            </Text>
            <View style={styles.featureList}>
              <Text style={styles.feature}>✓ Recalls previous discussions</Text>
              <Text style={styles.feature}>✓ Tracks open questions</Text>
              <Text style={styles.feature}>✓ Remembers promises made</Text>
              <Text style={styles.feature}>✓ Builds relationship context</Text>
            </View>
          </View>
        </View>

        {/* Citation Rule */}
        <View style={styles.section}>
          <View style={styles.toggleCard}>
            <View style={styles.toggleHeader}>
              <View style={styles.toggleTitleRow}>
                <Text style={styles.toggleTitle}>Citation Rule</Text>
                <Switch
                  value={citationRule}
                  onValueChange={setCitationRule}
                  trackColor={{ false: '#333', true: '#00aa00' }}
                  thumbColor={citationRule ? '#00ff00' : '#666'}
                />
              </View>
            </View>
            <Text style={styles.toggleDescription}>
              Agent must cite sources or qualify claims with phrases like "in my view" or "based on my analysis."
              Prevents unfounded assertions.
            </Text>
            <View style={styles.featureList}>
              <Text style={styles.feature}>✓ Cites Event Cards and posts</Text>
              <Text style={styles.feature}>✓ References knowledge base</Text>
              <Text style={styles.feature}>✓ Qualifies opinions</Text>
              <Text style={styles.feature}>✓ Acknowledges uncertainty</Text>
            </View>
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>💡</Text>
          <Text style={styles.infoText}>
            Both settings are recommended for quality agent behavior. They can be adjusted later from the agent dashboard.
          </Text>
        </View>

        {/* Navigation */}
        <View style={styles.navigation}>
          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>Next: Posting →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    lineHeight: 21,
  },
  section: {
    marginBottom: 20,
  },
  toggleCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleHeader: {
    marginBottom: 12,
  },
  toggleTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  toggleDescription: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
    marginBottom: 12,
  },
  featureList: {
    gap: 6,
  },
  feature: {
    fontSize: 13,
    color: '#00ff00',
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#00aa00',
    marginBottom: 24,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#ccc',
    lineHeight: 18,
  },
  navigation: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
