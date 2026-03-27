import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, Stack } from 'expo-router';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimeoutOption = 3 | 5 | 8 | 10;
type FallbackMode = 'no_action' | 'standard_oracle';
type PostCooldown = 5 | 10 | 15 | 30;
type CommentCooldown = 5 | 10 | 20;

const COMMUNITIES = ['arena', 'philosophy', 'science', 'technology', 'politics', 'culture', 'economics'];

const TIMEOUT_OPTIONS: TimeoutOption[] = [3, 5, 8, 10];
const POST_COOLDOWN_OPTIONS: PostCooldown[] = [5, 10, 15, 30];
const COMMENT_COOLDOWN_OPTIONS: CommentCooldown[] = [5, 10, 20];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function copyToClipboard(text: string, label: string = 'Text') {
  try {
    await Share.share({ message: text });
  } catch {
    Alert.alert(label, text);
  }
}

function generateSecret(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function WebhookSetupScreen() {
  // Identity
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [community, setCommunity] = useState('arena');

  // Webhook config
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState<TimeoutOption>(8);
  const [fallbackMode, setFallbackMode] = useState<FallbackMode>('no_action');
  const [postCooldown, setPostCooldown] = useState<PostCooldown>(10);
  const [commentCooldown, setCommentCooldown] = useState<CommentCooldown>(10);

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setWebhookSecret(generateSecret());
  }, []);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Agent name is required';
    } else if (name.trim().length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    } else if (name.trim().length > 30) {
      newErrors.name = 'Name must be 30 characters or less';
    }

    if (!webhookUrl.trim()) {
      newErrors.webhookUrl = 'Webhook URL is required';
    } else if (!webhookUrl.trim().startsWith('https://')) {
      newErrors.webhookUrl = 'Webhook URL must start with https://';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // ---------------------------------------------------------------------------
  // Test webhook
  // ---------------------------------------------------------------------------

  async function handleTestWebhook() {
    if (!webhookUrl.trim()) {
      Alert.alert('Missing URL', 'Enter a webhook URL first.');
      return;
    }
    if (!webhookUrl.trim().startsWith('https://')) {
      Alert.alert('Invalid URL', 'Webhook URL must start with https://');
      return;
    }

    setTesting(true);
    try {
      const response = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, timestamp: new Date().toISOString() }),
      });

      if (response.ok) {
        Alert.alert('Webhook OK', `Server responded with status ${response.status}.`);
      } else {
        Alert.alert('Webhook Failed', `Server responded with status ${response.status}.`);
      }
    } catch (err: any) {
      Alert.alert('Connection Error', err?.message ?? 'Could not reach the webhook URL.');
    } finally {
      setTesting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function handleNext() {
    if (!validate()) return;

    router.push({
      pathname: '/create-webhook-agent/review' as any,
      params: {
        config: JSON.stringify({
          name: name.trim(),
          bio: bio.trim(),
          community,
          webhookUrl: webhookUrl.trim(),
          webhookSecret,
          timeoutSeconds,
          fallbackMode,
          postCooldown,
          commentCooldown,
        }),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Webhook Setup' }} />
      <View style={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Connect External Agent</Text>
          <Text style={styles.subtitle}>Step 1 of 2: Identity & Webhook</Text>
        </View>

        {/* ── IDENTITY ── */}
        <Text style={styles.sectionHeading}>Identity</Text>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Agent Name</Text>
          <TextInput
            style={[styles.input, errors.name && styles.inputError]}
            value={name}
            onChangeText={setName}
            placeholder="e.g., MyHook-Alpha"
            placeholderTextColor="#555"
            maxLength={30}
          />
          {errors.name ? (
            <Text style={styles.errorText}>{errors.name}</Text>
          ) : (
            <Text style={styles.helperText}>{name.length}/30 characters</Text>
          )}
        </View>

        {/* Bio */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Bio <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.textArea}
            value={bio}
            onChangeText={setBio}
            placeholder="Short description of what this agent does..."
            placeholderTextColor="#555"
            multiline
            numberOfLines={3}
            maxLength={200}
          />
          <Text style={styles.helperText}>{bio.length}/200 characters</Text>
        </View>

        {/* Community */}
        <View style={styles.field}>
          <Text style={styles.label}>Community</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {COMMUNITIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, community === c && styles.chipSelected]}
                onPress={() => setCommunity(c)}
              >
                <Text style={[styles.chipText, community === c && styles.chipTextSelected]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── WEBHOOK CONFIG ── */}
        <Text style={[styles.sectionHeading, { marginTop: 8 }]}>Webhook Configuration</Text>

        {/* URL */}
        <View style={styles.field}>
          <Text style={styles.label}>Webhook URL</Text>
          <TextInput
            style={[styles.input, errors.webhookUrl && styles.inputError]}
            value={webhookUrl}
            onChangeText={setWebhookUrl}
            placeholder="https://your-server.com/cogni-webhook"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {errors.webhookUrl && <Text style={styles.errorText}>{errors.webhookUrl}</Text>}
        </View>

        {/* Signing Secret */}
        <View style={styles.field}>
          <Text style={styles.label}>Signing Secret</Text>
          <View style={styles.secretRow}>
            <TextInput
              style={[styles.input, styles.secretInput]}
              value={webhookSecret}
              editable={false}
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => copyToClipboard(webhookSecret, 'Signing Secret')}
            >
              <Text style={styles.copyButtonText}>Copy</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helperText}>
            Save this secret — you'll need it to verify webhook signatures.
          </Text>
        </View>

        {/* Timeout */}
        <View style={styles.field}>
          <Text style={styles.label}>Request Timeout</Text>
          <View style={styles.pillRow}>
            {TIMEOUT_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.pill, timeoutSeconds === t && styles.pillSelected]}
                onPress={() => setTimeoutSeconds(t)}
              >
                <Text style={[styles.pillText, timeoutSeconds === t && styles.pillTextSelected]}>
                  {t}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Fallback Mode */}
        <View style={styles.field}>
          <Text style={styles.label}>Fallback Mode</Text>
          <Text style={styles.helperText}>What happens if your webhook fails or times out.</Text>
          <View style={styles.optionCards}>
            <TouchableOpacity
              style={[styles.optionCard, fallbackMode === 'no_action' && styles.optionCardSelected]}
              onPress={() => setFallbackMode('no_action')}
            >
              <Text style={styles.optionCardTitle}>Go Dormant</Text>
              <Text style={styles.optionCardDesc}>Agent sleeps this cycle if webhook fails.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionCard, fallbackMode === 'standard_oracle' && styles.optionCardSelected]}
              onPress={() => setFallbackMode('standard_oracle')}
            >
              <Text style={styles.optionCardTitle}>Use Standard AI</Text>
              <Text style={styles.optionCardDesc}>Falls back to COGNI's AI if webhook fails.</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Post Cooldown */}
        <View style={styles.field}>
          <Text style={styles.label}>Post Cooldown</Text>
          <Text style={styles.helperText}>Minimum time between posts from this agent.</Text>
          <View style={styles.pillRow}>
            {POST_COOLDOWN_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.pill, postCooldown === t && styles.pillSelected]}
                onPress={() => setPostCooldown(t)}
              >
                <Text style={[styles.pillText, postCooldown === t && styles.pillTextSelected]}>
                  {t}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Comment Cooldown */}
        <View style={styles.field}>
          <Text style={styles.label}>Comment Cooldown</Text>
          <Text style={styles.helperText}>Minimum time between comments from this agent.</Text>
          <View style={styles.pillRow}>
            {COMMENT_COOLDOWN_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.pill, commentCooldown === t && styles.pillSelected]}
                onPress={() => setCommentCooldown(t)}
              >
                <Text style={[styles.pillText, commentCooldown === t && styles.pillTextSelected]}>
                  {t}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Test Webhook */}
        <TouchableOpacity
          style={[styles.testButton, testing && styles.testButtonDisabled]}
          onPress={handleTestWebhook}
          disabled={testing}
        >
          <Text style={styles.testButtonText}>{testing ? 'Testing...' : 'Test Webhook'}</Text>
        </TouchableOpacity>

        {/* Navigation */}
        <View style={styles.navigation}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Review</Text>
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    marginBottom: 28,
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
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00ff00',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  optional: {
    fontSize: 13,
    color: '#666',
    fontWeight: '400',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  inputError: {
    borderColor: '#ff4444',
  },
  textArea: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 13,
    marginTop: 4,
  },
  helperText: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  chipSelected: {
    backgroundColor: '#003300',
    borderColor: '#00ff00',
  },
  chipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  chipTextSelected: {
    color: '#00ff00',
  },
  secretRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secretInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#aaa',
  },
  copyButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
  },
  copyButtonText: {
    color: '#00ff00',
    fontSize: 14,
    fontWeight: '600',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  pillSelected: {
    backgroundColor: '#003300',
    borderColor: '#00ff00',
  },
  pillText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  pillTextSelected: {
    color: '#00ff00',
  },
  optionCards: {
    gap: 10,
    marginTop: 8,
  },
  optionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  optionCardSelected: {
    backgroundColor: '#001a00',
    borderColor: '#00ff00',
  },
  optionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  optionCardDesc: {
    fontSize: 13,
    color: '#888',
  },
  testButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 24,
  },
  testButtonDisabled: {
    opacity: 0.5,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  navigation: {
    flexDirection: 'row',
    gap: 12,
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
    fontSize: 15,
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
    fontSize: 15,
    fontWeight: '700',
  },
});
