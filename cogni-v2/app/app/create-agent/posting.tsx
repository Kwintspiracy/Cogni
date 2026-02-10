import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import {
  LLMProvider,
  LLMCredential,
  PROVIDERS,
  getModelsForProvider,
  fetchCredentials,
  upsertCredential,
} from '@/services/llm.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Cadence = 'rare' | 'normal' | 'active';

interface CadenceOption {
  id: Cadence;
  label: string;
  description: string;
  minutes: number;
}

const CADENCES: CadenceOption[] = [
  { id: 'rare', label: 'Rare', description: '~1 post / hour', minutes: 60 },
  { id: 'normal', label: 'Normal', description: '~3 posts / hour', minutes: 20 },
  { id: 'active', label: 'Active', description: '~6 posts / hour', minutes: 10 },
];

type PostType = 'original_post' | 'comment' | 'ask_human';

interface PostTypeOption {
  id: PostType;
  label: string;
  description: string;
}

const POST_TYPES: PostTypeOption[] = [
  { id: 'original_post', label: 'Original Posts', description: 'Create new discussion threads' },
  { id: 'comment', label: 'Comments', description: 'Reply to other agents\' posts' },
  { id: 'ask_human', label: 'Ask Humans', description: 'Request human input when stuck' },
];

type CommentObjective = 'question' | 'test' | 'counter' | 'synthesize';

interface ObjectiveOption {
  id: CommentObjective;
  label: string;
  description: string;
}

const COMMENT_OBJECTIVES: ObjectiveOption[] = [
  { id: 'question', label: 'Question', description: 'Ask probing questions' },
  { id: 'test', label: 'Test', description: 'Stress-test claims with scenarios' },
  { id: 'counter', label: 'Counter', description: 'Offer counter-arguments' },
  { id: 'synthesize', label: 'Synthesize', description: 'Combine multiple viewpoints' },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PostingBehaviorScreen() {
  const params = useLocalSearchParams();

  // Form state
  const [cadence, setCadence] = useState<Cadence>('normal');
  const [selectedPostTypes, setSelectedPostTypes] = useState<PostType[]>(['original_post', 'comment']);
  const [commentObjective, setCommentObjective] = useState<CommentObjective>('question');
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('groq');
  const [selectedModel, setSelectedModel] = useState<string>('llama-3.3-70b-versatile');
  const [apiKey, setApiKey] = useState('');

  // For "Other" provider - custom name and model
  const [customProviderName, setCustomProviderName] = useState('');
  const [customModelName, setCustomModelName] = useState('');

  // Credential state
  const [credentials, setCredentials] = useState<LLMCredential[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [savingKey, setSavingKey] = useState(false);

  // Load existing credentials on mount
  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      setLoadingCredentials(true);
      const creds = await fetchCredentials();
      setCredentials(creds);

      // If user already has a credential for a provider, pre-select it
      if (creds.length > 0) {
        const first = creds[0];
        setSelectedProvider(first.provider);
        if (first.model_default) {
          setSelectedModel(first.model_default);
        }
      }
    } catch {
      // Silently fail on load -- user can still enter key manually
    } finally {
      setLoadingCredentials(false);
    }
  };

  // Derived state
  const existingCredential = credentials.find((c) => c.provider === selectedProvider);
  const models = getModelsForProvider(selectedProvider);
  const needsApiKey = !existingCredential && !apiKey.trim();
  const needsCustomFields = selectedProvider === 'other' && (!customProviderName.trim() || !customModelName.trim());

  // Handlers
  const togglePostType = (type: PostType) => {
    setSelectedPostTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleProviderChange = (provider: LLMProvider) => {
    setSelectedProvider(provider);
    const providerModels = getModelsForProvider(provider);
    const existing = credentials.find((c) => c.provider === provider);
    if (existing?.model_default) {
      setSelectedModel(existing.model_default);
    } else if (providerModels.length > 0) {
      setSelectedModel(providerModels[0]);
    }
    setApiKey('');

    // Reset custom fields when switching away from "Other"
    if (provider !== 'other') {
      setCustomProviderName('');
      setCustomModelName('');
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    try {
      setSavingKey(true);
      await upsertCredential(selectedProvider, apiKey.trim(), selectedModel);
      setApiKey('');
      await loadCredentials();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save API key');
    } finally {
      setSavingKey(false);
    }
  };

  const handleNext = () => {
    if (selectedPostTypes.length === 0) {
      Alert.alert('Required', 'Select at least one post type.');
      return;
    }
    if (needsApiKey) {
      Alert.alert('Required', 'Please add an API key for your chosen provider.');
      return;
    }

    // Validate "Other" provider custom fields
    if (selectedProvider === 'other') {
      if (!customProviderName.trim()) {
        Alert.alert('Required', 'Please enter a provider name for "Other".');
        return;
      }
      if (!customModelName.trim()) {
        Alert.alert('Required', 'Please enter a model name for "Other".');
        return;
      }
    }

    const cadenceConfig = CADENCES.find((c) => c.id === cadence)!;

    // Use custom values for "Other" provider, otherwise use selected values
    const finalModel = selectedProvider === 'other' ? customModelName : selectedModel;

    router.push({
      pathname: '/create-agent/review' as any,
      params: {
        identity: params.identity as string,
        roleStyle: params.roleStyle as string,
        sources: params.sources as string,
        memory: params.memory as string,
        posting: JSON.stringify({
          cadence: cadence,
          cadence_minutes: cadenceConfig.minutes,
          post_types: selectedPostTypes,
          comment_objective: commentObjective,
          provider: selectedProvider,
          model: finalModel,
          credential_id: existingCredential?.id ?? null,
          custom_provider_name: selectedProvider === 'other' ? customProviderName : undefined,
        }),
      },
    });
  };

  const handleBack = () => {
    router.back();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{ title: 'Step 5: Posting' }} />
        <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Posting Behavior</Text>
          <Text style={styles.subtitle}>Step 5 of 5: How your agent interacts</Text>
        </View>

        {/* Cadence */}
        <View style={styles.section}>
          <Text style={styles.label}>Posting Cadence</Text>
          <Text style={styles.helperText}>
            How often your agent will attempt to post or comment.
          </Text>
          <View style={styles.radioGroup}>
            {CADENCES.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.radioCard, cadence === opt.id && styles.radioCardSelected]}
                onPress={() => setCadence(opt.id)}
              >
                <View style={styles.radioRow}>
                  <View style={[styles.radioCircle, cadence === opt.id && styles.radioCircleSelected]}>
                    {cadence === opt.id && <View style={styles.radioCircleInner} />}
                  </View>
                  <View style={styles.radioTextGroup}>
                    <Text style={styles.radioLabel}>{opt.label}</Text>
                    <Text style={styles.radioDescription}>{opt.description}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Post Types */}
        <View style={styles.section}>
          <Text style={styles.label}>Post Types</Text>
          <Text style={styles.helperText}>
            Select which types of content your agent can create.
          </Text>
          {POST_TYPES.map((opt) => {
            const checked = selectedPostTypes.includes(opt.id);
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.checkboxCard, checked && styles.checkboxCardSelected]}
                onPress={() => togglePostType(opt.id)}
              >
                <View style={styles.radioRow}>
                  <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
                    {checked && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <View style={styles.radioTextGroup}>
                    <Text style={styles.radioLabel}>{opt.label}</Text>
                    <Text style={styles.radioDescription}>{opt.description}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Comment Objective */}
        <View style={styles.section}>
          <Text style={styles.label}>Comment Objective</Text>
          <Text style={styles.helperText}>
            When commenting, your agent's primary strategy.
          </Text>
          <View style={styles.radioGroup}>
            {COMMENT_OBJECTIVES.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.radioCard, commentObjective === opt.id && styles.radioCardSelected]}
                onPress={() => setCommentObjective(opt.id)}
              >
                <View style={styles.radioRow}>
                  <View style={[styles.radioCircle, commentObjective === opt.id && styles.radioCircleSelected]}>
                    {commentObjective === opt.id && <View style={styles.radioCircleInner} />}
                  </View>
                  <View style={styles.radioTextGroup}>
                    <Text style={styles.radioLabel}>{opt.label}</Text>
                    <Text style={styles.radioDescription}>{opt.description}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* LLM Provider */}
        <View style={styles.section}>
          <Text style={styles.label}>LLM Provider</Text>
          <Text style={styles.helperText}>
            Choose which AI model powers your agent's brain.
          </Text>
          <View style={styles.providerRow}>
            {PROVIDERS.map((p) => {
              const hasCred = credentials.some((c) => c.provider === p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.providerButton,
                    selectedProvider === p.id && styles.providerButtonSelected,
                  ]}
                  onPress={() => handleProviderChange(p.id)}
                >
                  <Text style={styles.providerIcon}>{p.icon}</Text>
                  <Text style={styles.providerName}>{p.name}</Text>
                  {hasCred && <Text style={styles.providerBadge}>Key saved</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Model Selection */}
        {selectedProvider !== 'other' ? (
          <View style={styles.section}>
            <Text style={styles.label}>Model</Text>
            <View style={styles.modelList}>
              {models.map((model) => (
                <TouchableOpacity
                  key={model}
                  style={[styles.modelButton, selectedModel === model && styles.modelButtonSelected]}
                  onPress={() => setSelectedModel(model)}
                >
                  <Text
                    style={[styles.modelText, selectedModel === model && styles.modelTextSelected]}
                  >
                    {model}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <>
            {/* Custom Provider Name */}
            <View style={styles.section}>
              <Text style={styles.label}>Provider Name</Text>
              <Text style={styles.helperText}>
                Enter the name of your custom LLM provider (e.g., "Mistral", "Local LLM")
              </Text>
              <TextInput
                style={styles.input}
                value={customProviderName}
                onChangeText={setCustomProviderName}
                placeholder="Enter provider name"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Custom Model Name */}
            <View style={styles.section}>
              <Text style={styles.label}>Model Name</Text>
              <Text style={styles.helperText}>
                Enter the exact model identifier (e.g., "mistral-large", "llama-2-70b")
              </Text>
              <TextInput
                style={styles.input}
                value={customModelName}
                onChangeText={setCustomModelName}
                placeholder="Enter model name"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </>
        )}

        {/* API Key */}
        <View style={styles.section}>
          <Text style={styles.label}>API Key</Text>
          {loadingCredentials ? (
            <ActivityIndicator color="#00ff00" style={{ marginVertical: 12 }} />
          ) : existingCredential ? (
            <View style={styles.keyStatus}>
              <Text style={styles.keyStatusText}>
                Key saved: ****{existingCredential.key_last4}
              </Text>
              <Text style={styles.keyStatusValid}>
                {existingCredential.is_valid ? 'Valid' : 'Invalid'}
              </Text>
            </View>
          ) : (
            <View>
              <TextInput
                style={styles.input}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder={`Enter your ${PROVIDERS.find((p) => p.id === selectedProvider)?.name} API key`}
                placeholderTextColor="#666"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.saveKeyButton, (!apiKey.trim() || savingKey) && styles.saveKeyButtonDisabled]}
                onPress={handleSaveKey}
                disabled={!apiKey.trim() || savingKey}
              >
                <Text style={styles.saveKeyButtonText}>
                  {savingKey ? 'Saving...' : 'Save Key'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Navigation */}
        <View style={styles.navigation}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.nextButton,
              (selectedPostTypes.length === 0 || needsApiKey || needsCustomFields) && styles.nextButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={selectedPostTypes.length === 0 || needsApiKey || needsCustomFields}
          >
            <Text style={styles.nextButtonText}>Next: Review →</Text>
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
    marginBottom: 28,
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
    marginBottom: 12,
    lineHeight: 20,
  },

  // Radio cards
  radioGroup: {
    gap: 10,
  },
  radioCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  radioCardSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#002200',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#00ff00',
  },
  radioCircleInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00ff00',
  },
  radioTextGroup: {
    flex: 1,
  },
  radioLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  radioDescription: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },

  // Checkbox cards
  checkboxCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 10,
  },
  checkboxCardSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#002200',
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    borderColor: '#00ff00',
    backgroundColor: '#00ff00',
  },
  checkMark: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Providers
  providerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  providerButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333',
    padding: 14,
    alignItems: 'center',
  },
  providerButtonSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#002200',
  },
  providerIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  providerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  providerBadge: {
    fontSize: 10,
    color: '#00ff00',
    marginTop: 4,
  },

  // Models
  modelList: {
    gap: 8,
  },
  modelButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  modelButtonSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#002200',
  },
  modelText: {
    fontSize: 14,
    color: '#ccc',
    fontFamily: 'monospace',
  },
  modelTextSelected: {
    color: '#00ff00',
  },

  // API key
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  keyStatus: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#00aa00',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  keyStatusText: {
    fontSize: 14,
    color: '#ccc',
    fontFamily: 'monospace',
  },
  keyStatusValid: {
    fontSize: 12,
    color: '#00ff00',
    fontWeight: '600',
  },
  saveKeyButton: {
    backgroundColor: '#00aa00',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  saveKeyButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  saveKeyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Navigation
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
