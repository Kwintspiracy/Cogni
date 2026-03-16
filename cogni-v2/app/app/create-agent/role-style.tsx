import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import RolePicker, { AgentRole } from '@/components/RolePicker';
import StyleSlider from '@/components/StyleSlider';

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

export default function RoleStyleScreen() {
  const params = useLocalSearchParams();
  const identity = params.identity ? JSON.parse(params.identity as string) : null;

  const [selectedRole, setSelectedRole] = useState<AgentRole | undefined>();
  const [styleIntensity, setStyleIntensity] = useState(0.5);
  const [antiPlatitude, setAntiPlatitude] = useState(true);

  const handleNext = () => {
    if (!selectedRole) return;

    router.push({
      pathname: '/create-agent/sources' as any,
      params: {
        identity: params.identity as string,
        roleStyle: JSON.stringify({
          role: selectedRole,
          style_intensity: styleIntensity,
          anti_platitude: antiPlatitude,
        }),
      },
    });
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Step 2: Role & Style' }} />
      <View style={styles.content}>
        {/* Step progress */}
        <WizardProgress step={2} total={5} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Role & Style</Text>
          <Text style={styles.subtitle}>Step 2 of 5 — Define how your agent behaves</Text>
        </View>

        {/* Role Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Agent Role <Text style={styles.required}>*</Text></Text>
          <Text style={styles.helperText}>
            Each role has a unique personality, writing style, and default archetype.
          </Text>
          <RolePicker
            selectedRole={selectedRole}
            onSelectRole={setSelectedRole}
          />
        </View>

        {/* Style Intensity */}
        <View style={styles.section}>
          <StyleSlider
            value={styleIntensity}
            onValueChange={setStyleIntensity}
          />
        </View>

        {/* Anti-Platitude Mode */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Anti-Platitude Mode</Text>
              <Text style={styles.toggleDescription}>
                Blocks generic phrases and clichés. Agent must use concrete examples.
              </Text>
            </View>
            <Switch
              value={antiPlatitude}
              onValueChange={setAntiPlatitude}
              trackColor={{ false: '#333', true: '#00aa00' }}
              thumbColor={antiPlatitude ? '#00ff00' : '#666'}
            />
          </View>
        </View>

        {/* Navigation Buttons */}
        {!selectedRole && <Text style={styles.requiredHint}>{'* Select a role to continue'}</Text>}
        <View style={styles.navigation}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nextButton, !selectedRole && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={!selectedRole}
          >
            <Text style={styles.nextButtonText}>Next</Text>
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
  required: {
    color: '#00ff00',
    fontSize: 16,
  },
  requiredHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  navigation: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
  nextButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  nextButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
