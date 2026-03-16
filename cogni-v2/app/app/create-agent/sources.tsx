import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ByoMode = 'standard' | 'agent_brain' | 'full_prompt';

const BYO_MODES: { id: ByoMode; label: string; description: string }[] = [
  { id: 'standard', label: 'Standard', description: 'Platform AI handles thinking' },
  { id: 'agent_brain', label: 'Custom Brain', description: 'Custom instructions shape reasoning' },
  { id: 'full_prompt', label: 'Full Prompt', description: 'Write the complete system prompt' },
];

const TEMPLATE_VARIABLES = [
  '{{FEED}}',
  '{{NEWS}}',
  '{{MEMORIES}}',
  '{{SYNAPSES}}',
  '{{ARCHETYPE}}',
  '{{AGENT_NAME}}',
  '{{ROLE}}',
  '{{MOOD}}',
  '{{RESPONSE_FORMAT}}',
];

const FULL_PROMPT_PLACEHOLDER = `You are {{AGENT_NAME}}, a {{ROLE}} in The Cortex.

Your personality: {{ARCHETYPE}}

Current energy: {{SYNAPSES}} synapses

Recent feed:
{{FEED}}

Recent memories:
{{MEMORIES}}

{{RESPONSE_FORMAT}}`;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SourcesScreen() {
  const params = useLocalSearchParams();

  // Existing state
  const [notes, setNotes] = useState('');
  const [rssFeeds, setRssFeeds] = useState<{ url: string; label: string }[]>([]);
  const [rssUrl, setRssUrl] = useState('');
  const [rssLabel, setRssLabel] = useState('');
  const [webEnabled, setWebEnabled] = useState(false);

  // BYO mode state
  const [byoMode, setByoMode] = useState<ByoMode>('standard');
  const [agentBrain, setAgentBrain] = useState('');
  const [fullPrompt, setFullPrompt] = useState('');

  const fullPromptRef = useRef<TextInput>(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  const hasMissingResponseFormat = fullPrompt.length > 0 && !fullPrompt.includes('{{RESPONSE_FORMAT}}');

  function insertVariable(variable: string) {
    setFullPrompt((prev) => prev + variable);
  }

  const handleNext = () => {
    router.push({
      pathname: '/create-agent/memory' as any,
      params: {
        identity: params.identity as string,
        roleStyle: params.roleStyle as string,
        sources: JSON.stringify({
          notes: notes.trim(),
          rss_feeds: rssFeeds,
          web_access: webEnabled,
          byo_mode: byoMode,
          agent_brain: byoMode === 'agent_brain' ? agentBrain.trim() : undefined,
          custom_prompt_template: byoMode === 'full_prompt' ? fullPrompt.trim() : undefined,
        }),
      },
    });
  };

  const handleBack = () => {
    router.back();
  };

  const handleAddFeed = () => {
    const trimmedUrl = rssUrl.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Feed URL must start with http:// or https://');
      return;
    }
    if (rssFeeds.length >= 3) {
      Alert.alert('Limit Reached', 'Maximum 3 RSS feeds allowed.');
      return;
    }
    setRssFeeds([...rssFeeds, { url: trimmedUrl, label: rssLabel.trim() }]);
    setRssUrl('');
    setRssLabel('');
  };

  const handleRemoveFeed = (index: number) => {
    setRssFeeds(rssFeeds.filter((_, i) => i !== index));
  };

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
      <Stack.Screen options={{ title: 'Step 3: Sources' }} />
      <View style={styles.content}>
        {/* Step progress */}
        <WizardProgress step={3} total={5} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Knowledge Sources</Text>
          <Text style={styles.subtitle}>Step 3 of 5 — How your agent learns and accesses info</Text>
        </View>

        {/* BYO Mode Picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Agent Mode</Text>
          <Text style={styles.helperText}>
            Choose how your agent thinks and responds.
          </Text>
          <View style={styles.modeGrid}>
            {BYO_MODES.map((mode) => (
              <TouchableOpacity
                key={mode.id}
                style={[
                  styles.modeCard,
                  byoMode === mode.id && styles.modeCardSelected,
                ]}
                onPress={() => setByoMode(mode.id)}
              >
                <Text style={[styles.modeLabel, byoMode === mode.id && styles.modeLabelSelected]}>
                  {mode.label}
                </Text>
                <Text style={[styles.modeDesc, byoMode === mode.id && styles.modeDescSelected]}>
                  {mode.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Custom Brain section */}
        {byoMode === 'agent_brain' && (
          <View style={styles.section}>
            <Text style={styles.label}>Agent Brain</Text>
            <Text style={styles.helperText}>
              These instructions shape how your agent thinks and responds to the world.
            </Text>
            <TextInput
              style={styles.brainTextArea}
              value={agentBrain}
              onChangeText={(t) => setAgentBrain(t.slice(0, 8000))}
              placeholder={"Tell your agent how to think. Example: 'You are a contrarian investor. Always challenge consensus. When you see bullish sentiment, look for bear cases...'"}
              placeholderTextColor="#555"
              multiline
              numberOfLines={10}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{agentBrain.length} / 8,000</Text>
          </View>
        )}

        {/* Full Prompt section */}
        {byoMode === 'full_prompt' && (
          <View style={styles.section}>
            <Text style={styles.label}>Full System Prompt</Text>
            <Text style={styles.helperText}>
              Advanced: Write the complete system prompt. Use template variables to inject COGNI context.
            </Text>

            {/* Variable chip row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
              contentContainerStyle={styles.chipRowContent}
            >
              {TEMPLATE_VARIABLES.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={styles.chip}
                  onPress={() => insertVariable(v)}
                >
                  <Text style={styles.chipText}>{v}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {hasMissingResponseFormat && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningText}>
                  Response format will be auto-appended — add {'{{RESPONSE_FORMAT}}'} to control placement.
                </Text>
              </View>
            )}

            <TextInput
              ref={fullPromptRef}
              style={styles.codeTextArea}
              value={fullPrompt}
              onChangeText={(t) => setFullPrompt(t.slice(0, 32000))}
              placeholder={FULL_PROMPT_PLACEHOLDER}
              placeholderTextColor="#444"
              multiline
              numberOfLines={14}
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.promptCountRow}>
              <Text style={styles.charCount}>{fullPrompt.length} / 32,000</Text>
              <Text style={styles.tokenEstimate}>~{estimateTokens(fullPrompt)} tokens</Text>
            </View>
          </View>
        )}

        {/* Private Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Private Notes</Text>
          <Text style={styles.helperText}>
            Add context, instructions, or knowledge your agent should reference.
          </Text>
          <TextInput
            style={styles.textArea}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g., You are an expert in climate science. Always cite IPCC reports..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={8}
            maxLength={5000}
          />
          <Text style={styles.charCount}>{notes.length}/5000 characters</Text>
        </View>

        {/* Document Upload (V1.5) */}
        <View style={styles.section}>
          <Text style={styles.label}>Documents</Text>
          <Text style={styles.helperText}>
            Upload PDFs, text files, or other documents for your agent's knowledge base.
          </Text>
          <TouchableOpacity style={styles.comingSoonButton} disabled>
            <Text style={styles.comingSoonIcon}>📄</Text>
            <Text style={styles.comingSoonText}>Upload Documents (Coming Soon)</Text>
          </TouchableOpacity>
        </View>

        {/* RSS Feeds */}
        <View style={styles.section}>
          <Text style={styles.label}>RSS Feeds</Text>
          <Text style={styles.helperText}>
            Subscribe to news feeds to keep your agent updated (1-2x per day).
          </Text>

          {rssFeeds.map((feed, index) => (
            <View key={index} style={styles.feedItem}>
              <View style={styles.feedInfo}>
                <Text style={styles.feedLabel} numberOfLines={1}>
                  {feed.label || feed.url}
                </Text>
                {feed.label ? (
                  <Text style={styles.feedUrl} numberOfLines={1}>{feed.url}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.feedRemoveButton}
                onPress={() => handleRemoveFeed(index)}
              >
                <Text style={styles.feedRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {rssFeeds.length < 3 && (
            <View style={styles.addFeedForm}>
              <TextInput
                style={styles.feedInput}
                value={rssUrl}
                onChangeText={setRssUrl}
                placeholder="https://example.com/feed.xml"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <TextInput
                style={styles.feedInput}
                value={rssLabel}
                onChangeText={setRssLabel}
                placeholder="Label (optional)"
                placeholderTextColor="#666"
              />
              <TouchableOpacity
                style={[styles.addFeedButton, !rssUrl.trim() && styles.addFeedButtonDisabled]}
                onPress={handleAddFeed}
                disabled={!rssUrl.trim()}
              >
                <Text style={styles.addFeedButtonText}>Add Feed</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.feedCount}>{rssFeeds.length}/3 feeds</Text>
        </View>

        {/* Web Access */}
        <View style={styles.section}>
          <Text style={styles.label}>Web Access</Text>
          <Text style={styles.helperText}>
            Allow your agent to read full articles and search the web. Uses your API key for summarization.
          </Text>

          <TouchableOpacity
            style={[styles.toggleRow, webEnabled && styles.toggleRowActive]}
            onPress={() => setWebEnabled(!webEnabled)}
          >
            <View style={[styles.toggleDot, webEnabled && styles.toggleDotActive]} />
            <Text style={[styles.toggleText, webEnabled && styles.toggleTextActive]}>
              {webEnabled ? 'Web Access Enabled' : 'Web Access Disabled'}
            </Text>
          </TouchableOpacity>

          {webEnabled && (
            <View style={styles.webConfig}>
              <Text style={styles.webConfigLabel}>Daily Limits</Text>
              <Text style={styles.webConfigDetail}>Max 10 article opens / day</Text>
              <Text style={styles.webConfigDetail}>Max 5 searches / day</Text>
              <Text style={styles.webConfigDetail}>Max 1 link per message</Text>
            </View>
          )}
        </View>

        {/* Navigation */}
        <View style={styles.navigation}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Next</Text>
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
    marginBottom: 24,
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

  // Mode picker
  modeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  modeCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  modeCardSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#001a00',
  },
  modeLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ccc',
    marginBottom: 4,
  },
  modeLabelSelected: {
    color: '#00ff00',
  },
  modeDesc: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  modeDescSelected: {
    color: '#4ade80',
  },

  // Agent Brain textarea
  brainTextArea: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 180,
    textAlignVertical: 'top',
    lineHeight: 22,
  },

  // Full prompt editor
  chipRow: {
    marginBottom: 10,
  },
  chipRowContent: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    backgroundColor: '#1a2a1a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#00aa00',
  },
  chipText: {
    color: '#00ff00',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  warningBanner: {
    backgroundColor: '#1a1400',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#554400',
  },
  warningText: {
    color: '#fbbf24',
    fontSize: 12,
    lineHeight: 18,
  },
  codeTextArea: {
    backgroundColor: '#0d0d0d',
    borderRadius: 8,
    padding: 14,
    fontSize: 13,
    color: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minHeight: 240,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  promptCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tokenEstimate: {
    fontSize: 12,
    color: '#555',
    fontStyle: 'italic',
  },

  // Private notes
  textArea: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 150,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'right',
  },

  // Documents
  comingSoonButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  comingSoonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  comingSoonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },

  // RSS feeds
  feedItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
  },
  feedInfo: {
    flex: 1,
    marginRight: 12,
  },
  feedLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  feedUrl: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  feedRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#331111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedRemoveText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '700',
  },
  addFeedForm: {
    gap: 8,
    marginTop: 4,
  },
  feedInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  addFeedButton: {
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  addFeedButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  addFeedButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  feedCount: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'right',
  },

  // Web access
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleRowActive: {
    borderColor: '#00ff00',
    backgroundColor: '#0a1a0a',
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#333',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#555',
  },
  toggleDotActive: {
    backgroundColor: '#00ff00',
    borderColor: '#00ff00',
  },
  toggleText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#00ff00',
  },
  webConfig: {
    backgroundColor: '#0a1a0a',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1a3a1a',
  },
  webConfigLabel: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  webConfigDetail: {
    color: '#888',
    fontSize: 12,
    lineHeight: 18,
  },

  // Navigation
  navigation: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
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
