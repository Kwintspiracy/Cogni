import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useCreateAgentStore } from '@/stores/create-agent.store';

const AVATARS = [
  { id: '1', emoji: '\u{1F916}', name: 'Bot' },
  { id: '2', emoji: '\u{1F9E0}', name: 'Brain' },
  { id: '3', emoji: '\u{1F47E}', name: 'Alien' },
  { id: '4', emoji: '\u{1F9BE}', name: 'Cyborg' },
  { id: '5', emoji: '\u{1F3AD}', name: 'Mask' },
  { id: '6', emoji: '\u{1F52E}', name: 'Crystal' },
  { id: '7', emoji: '\u{26A1}', name: 'Lightning' },
  { id: '8', emoji: '\u{1F31F}', name: 'Star' },
];

export default function AgentIdentityScreen() {
  const params = useLocalSearchParams();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [errors, setErrors] = useState<{ name?: string; bio?: string; avatar?: string }>({});

  // Get behaviorSpec and archetype from zustand store
  const { behaviorSpec, archetype, reset } = useCreateAgentStore();

  // Reset store when entering identity screen for the first time (fresh start)
  // This ensures clean state when creating a new agent
  useEffect(() => {
    // Only reset if we're not returning from the cognitivity test
    // and we don't have any identity params (meaning it's a fresh start)
    if (!params.identity && !behaviorSpec) {
      reset();
    }
  }, []); // Run only once on mount

  const validate = () => {
    const newErrors: { name?: string; bio?: string; avatar?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Agent name is required';
    } else if (name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    } else if (name.length > 30) {
      newErrors.name = 'Name must be 30 characters or less';
    } else if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
      newErrors.name = 'Name can only contain letters, numbers, and spaces';
    }

    if (!bio.trim()) {
      newErrors.bio = 'Bio is required';
    } else if (bio.length < 10) {
      newErrors.bio = 'Bio must be at least 10 characters';
    } else if (bio.length > 280) {
      newErrors.bio = 'Bio must be 280 characters or less';
    }

    if (!selectedAvatar) {
      newErrors.avatar = 'Please select an avatar';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTakeTest = () => {
    router.push('/create-agent/cognitivity-test' as any);
  };

  const handleNext = () => {
    if (validate()) {
      router.push({
        pathname: '/create-agent/role-style',
        params: {
          identity: JSON.stringify({
            name: name.trim(),
            bio: bio.trim(),
            avatar: selectedAvatar,
            behaviorSpec: behaviorSpec ? JSON.stringify(behaviorSpec) : undefined,
            archetype: archetype ? JSON.stringify(archetype) : undefined,
          }),
        },
      });
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Step 1: Identity' }} />
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Create Your Agent</Text>
          <Text style={styles.subtitle}>Step 1 of 5: Identity</Text>
        </View>

        {/* Agent Name */}
        <View style={styles.section}>
          <Text style={styles.label}>Agent Name</Text>
          <TextInput
            style={[styles.input, errors.name && styles.inputError]}
            value={name}
            onChangeText={setName}
            placeholder="e.g., ThinkTank-Alpha"
            placeholderTextColor="#666"
            maxLength={30}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          <Text style={styles.helperText}>{name.length}/30 characters</Text>
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.textArea, errors.bio && styles.inputError]}
            value={bio}
            onChangeText={setBio}
            placeholder="Describe your agent in 1-2 sentences..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={3}
            maxLength={280}
          />
          {errors.bio && <Text style={styles.errorText}>{errors.bio}</Text>}
          <Text style={styles.helperText}>{bio.length}/280 characters</Text>
        </View>

        {/* Avatar Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Choose Avatar</Text>
          <View style={styles.avatarGrid}>
            {AVATARS.map((avatar) => (
              <TouchableOpacity
                key={avatar.id}
                style={[
                  styles.avatarButton,
                  selectedAvatar === avatar.id && styles.avatarButtonSelected,
                ]}
                onPress={() => setSelectedAvatar(avatar.id)}
              >
                <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
                <Text style={styles.avatarName}>{avatar.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.avatar && <Text style={styles.errorText}>{errors.avatar}</Text>}
        </View>

        {/* Cognitivity Test */}
        {behaviorSpec ? (
          <View style={styles.specCard}>
            <View style={styles.specCardHeader}>
              <Text style={styles.specCardTitle}>Cognitivity Test Complete</Text>
              <TouchableOpacity onPress={handleTakeTest}>
                <Text style={styles.retakeLink}>Retake</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.specPreview}>
              <SpecRow label="Role" value={behaviorSpec.role?.primary_function ?? '-'} />
              <SpecRow label="Stance" value={behaviorSpec.stance?.default_mode ?? '-'} />
              <SpecRow label="Voice" value={behaviorSpec.output_style?.voice ?? '-'} />
              {archetype && (
                <SpecRow
                  label="Traits"
                  value={`O:${(archetype.openness ?? 0).toFixed(1)} A:${(archetype.aggression ?? 0).toFixed(1)} N:${(archetype.neuroticism ?? 0).toFixed(1)}`}
                />
              )}
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.testButton} onPress={handleTakeTest}>
            <Text style={styles.testButtonTitle}>Take Cognitivity Test</Text>
            <Text style={styles.testButtonSubtitle}>
              38 questions that define exactly how your agent thinks, speaks, and behaves
            </Text>
          </TouchableOpacity>
        )}

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.nextButton, (!name || !bio || !selectedAvatar) && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={!name || !bio || !selectedAvatar}
        >
          <Text style={styles.nextButtonText}>Next: Choose Role</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 30,
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
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 4,
  },
  helperText: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  avatarButton: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  avatarButtonSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#002200',
  },
  avatarEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  avatarName: {
    fontSize: 10,
    color: '#888',
    textAlign: 'center',
  },

  // Cognitivity Test Button
  testButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#00aa00',
  },
  testButtonTitle: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  testButtonSubtitle: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },

  // Spec card (after test completion)
  specCard: {
    backgroundColor: '#0a1a0a',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#00aa00',
  },
  specCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  specCardTitle: {
    color: '#00ff00',
    fontSize: 15,
    fontWeight: '700',
  },
  retakeLink: {
    color: '#888',
    fontSize: 13,
  },
  specPreview: {
    gap: 6,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  specLabel: {
    color: '#888',
    fontSize: 13,
  },
  specValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  nextButton: {
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
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
