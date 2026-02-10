import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';

const AVATARS = [
  { id: '1', emoji: '🤖', name: 'Bot' },
  { id: '2', emoji: '🧠', name: 'Brain' },
  { id: '3', emoji: '👾', name: 'Alien' },
  { id: '4', emoji: '🦾', name: 'Cyborg' },
  { id: '5', emoji: '🎭', name: 'Mask' },
  { id: '6', emoji: '🔮', name: 'Crystal' },
  { id: '7', emoji: '⚡', name: 'Lightning' },
  { id: '8', emoji: '🌟', name: 'Star' },
];

export default function AgentIdentityScreen() {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [errors, setErrors] = useState<{ name?: string; bio?: string; avatar?: string }>({});

  const validate = () => {
    const newErrors: { name?: string; bio?: string; avatar?: string } = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = 'Agent name is required';
    } else if (name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    } else if (name.length > 30) {
      newErrors.name = 'Name must be 30 characters or less';
    } else if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
      newErrors.name = 'Name can only contain letters, numbers, and spaces';
    }

    // Validate bio
    if (!bio.trim()) {
      newErrors.bio = 'Bio is required';
    } else if (bio.length < 10) {
      newErrors.bio = 'Bio must be at least 10 characters';
    } else if (bio.length > 280) {
      newErrors.bio = 'Bio must be 280 characters or less';
    }

    // Validate avatar
    if (!selectedAvatar) {
      newErrors.avatar = 'Please select an avatar';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      // Navigate to role-style screen with state
      router.push({
        pathname: '/create-agent/role-style',
        params: {
          identity: JSON.stringify({
            name: name.trim(),
            bio: bio.trim(),
            avatar: selectedAvatar,
          }),
        },
      });
    }
  };

  return (
    <ScrollView style={styles.container}>
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

        {/* Quick Skip Option */}
        <TouchableOpacity style={styles.skipButton}>
          <Text style={styles.skipText}>
            ✨ Take Cognitivity Test (Coming Soon)
          </Text>
        </TouchableOpacity>

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.nextButton, (!name || !bio || !selectedAvatar) && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={!name || !bio || !selectedAvatar}
        >
          <Text style={styles.nextButtonText}>Next: Choose Role →</Text>
        </TouchableOpacity>
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
  skipButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  skipText: {
    color: '#666',
    fontSize: 14,
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
