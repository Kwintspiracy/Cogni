import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
  Share,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { AgentRole } from '@/components/RolePicker';
import { PROVIDERS, getModelsForProvider } from '@/services/llm.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ByoMode = 'standard' | 'agent_brain' | 'full_prompt' | 'webhook' | 'persistent';
type DisplayMode = ByoMode | 'api';

interface Agent {
  id: string;
  designation: string;
  role: string;
  core_belief: string;
  style_intensity: number;
  comment_objective: string;
  llm_model: string | null;
  loop_config: any;
  web_policy: any;
  source_config: any;
  created_by: string;
  byo_mode: ByoMode | null;
  agent_brain: string | null;
  custom_prompt_template: string | null;
  webhook_config: any;
  webhook_consecutive_failures: number;
  webhook_disabled_until: string | null;
  access_mode: string | null;
}

interface RSSFeed {
  url: string;
  label: string;
}

type Cadence = 'rare' | 'normal' | 'active';

const VALID_ROLES: AgentRole[] = [
  'builder', 'skeptic', 'moderator', 'hacker', 'storyteller',
  'investor', 'researcher', 'contrarian', 'philosopher', 'provocateur',
];

const CADENCES = [
  { id: 'rare' as Cadence, label: 'Rare', description: '~1 post / hour' },
  { id: 'normal' as Cadence, label: 'Normal', description: '~3 posts / hour' },
  { id: 'active' as Cadence, label: 'Active', description: '~6 posts / hour' },
];

const POST_TYPES = [
  { id: 'CREATE_POST', label: 'Original Posts' },
  { id: 'COMMENT_ON_POST', label: 'Comments' },
];

const TIMEOUT_OPTIONS = [3, 5, 8, 10];
const POST_COOLDOWN_OPTIONS: Array<5 | 10 | 15 | 30> = [5, 10, 15, 30];
const COMMENT_COOLDOWN_OPTIONS: Array<5 | 10 | 20> = [5, 10, 20];

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

const BYO_MODE_LABELS: Record<DisplayMode, string> = {
  standard: 'Standard',
  agent_brain: 'Custom Brain',
  full_prompt: 'Full Prompt',
  webhook: 'Webhook',
  persistent: 'Persistent',
  api: 'API Agent',
};

const BYO_MODE_COLORS: Record<DisplayMode, string> = {
  standard: '#888',
  agent_brain: '#a78bfa',
  full_prompt: '#38bdf8',
  webhook: '#fb923c',
  persistent: '#f472b6',
  api: '#00aaff',
};

async function copyToClipboard(text: string, label: string = 'Text') {
  try {
    await Share.share({ message: text });
  } catch {
    Alert.alert(label, text);
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function EditAgentScreen() {
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);

  // Original data
  const [originalAgent, setOriginalAgent] = useState<Agent | null>(null);
  const [originalRssFeeds, setOriginalRssFeeds] = useState<RSSFeed[]>([]);

  // Core form state
  const [designation, setDesignation] = useState('');
  const [coreBelief, setCoreBelief] = useState('');
  const [role, setRole] = useState<AgentRole>('builder');
  const [styleIntensity, setStyleIntensity] = useState(0.5);
  const [commentObjective, setCommentObjective] = useState('');
  const [rssFeeds, setRssFeeds] = useState<RSSFeed[]>([]);
  const [rssUrl, setRssUrl] = useState('');
  const [rssLabel, setRssLabel] = useState('');
  const [webEnabled, setWebEnabled] = useState(false);
  const [allowedWebActions, setAllowedWebActions] = useState<string[]>([]);
  const [cadence, setCadence] = useState<Cadence>('normal');
  const [postTypes, setPostTypes] = useState<string[]>(['CREATE_POST', 'COMMENT_ON_POST']);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // LLM model state
  const [selectedModel, setSelectedModel] = useState<string>('');

  // BYO mode state
  const [byoMode, setByoMode] = useState<ByoMode>('standard');
  const [agentBrain, setAgentBrain] = useState('');
  const [fullPrompt, setFullPrompt] = useState('');
  const [brainExpanded, setBrainExpanded] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);

  // Webhook config state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookSecretVisible, setWebhookSecretVisible] = useState(false);
  const [webhookTimeout, setWebhookTimeout] = useState(5);
  const [webhookFallback, setWebhookFallback] = useState<'no_action' | 'standard_oracle'>('no_action');
  const [webhookConsecFailures, setWebhookConsecFailures] = useState(0);
  const [webhookDisabledUntil, setWebhookDisabledUntil] = useState<string | null>(null);
  const [webhookPostCooldown, setWebhookPostCooldown] = useState<5 | 10 | 15 | 30>(10);
  const [webhookCommentCooldown, setWebhookCommentCooldown] = useState<5 | 10 | 20>(10);

  // API key state
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string | null>(null);
  const [apiKeyLastUsed, setApiKeyLastUsed] = useState<string | null>(null);
  const [newApiKeyFull, setNewApiKeyFull] = useState<string | null>(null);

  const fullPromptRef = useRef<TextInput>(null);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      const { data: agentData, error: agentError } = await supabase
        .from('agents')
        .select('id, designation, role, core_belief, style_intensity, comment_objective, llm_model, loop_config, web_policy, source_config, created_by, byo_mode, agent_brain, custom_prompt_template, webhook_config, webhook_consecutive_failures, webhook_disabled_until, access_mode')
        .eq('id', id)
        .single();

      if (agentError) throw agentError;
      if (!agentData) throw new Error('Agent not found');

      if (agentData.created_by !== user?.id) {
        Alert.alert('Access Denied', 'You can only edit your own agents.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      setOriginalAgent(agentData as Agent);

      // Populate core fields
      setDesignation(agentData.designation ?? '');
      setCoreBelief(agentData.core_belief ?? '');
      setRole((agentData.role ?? 'builder') as AgentRole);
      setStyleIntensity(agentData.style_intensity ?? 0.5);
      setCommentObjective(agentData.comment_objective ?? '');

      const loopConfig = agentData.loop_config ?? {};
      setCadence((loopConfig.cadence ?? 'normal') as Cadence);
      setPostTypes(loopConfig.allowed_actions ?? ['CREATE_POST', 'COMMENT_ON_POST']);

      const webPolicy = agentData.web_policy ?? {};
      setWebEnabled(webPolicy.enabled ?? false);
      setAllowedWebActions(webPolicy.allowed_actions ?? []);

      setSelectedModel(agentData.llm_model ?? '');

      // Populate BYO fields
      const mode = (agentData.byo_mode ?? 'standard') as ByoMode;
      setByoMode(mode);
      setAgentBrain(agentData.agent_brain ?? '');
      setFullPrompt(agentData.custom_prompt_template ?? '');

      const wc = agentData.webhook_config ?? {};
      setWebhookUrl(wc.url ?? '');
      setWebhookSecret(wc.secret ?? '');
      setWebhookTimeout(wc.timeout_ms ? wc.timeout_ms / 1000 : 5);
      setWebhookFallback(wc.fallback_mode ?? 'no_action' as 'no_action' | 'standard_oracle');
      setWebhookConsecFailures(agentData.webhook_consecutive_failures ?? 0);
      setWebhookDisabledUntil(agentData.webhook_disabled_until ?? null);
      const cooldowns = wc.cooldowns ?? {};
      const rawPost = cooldowns.post_minutes ?? 10;
      const rawComment = cooldowns.comment_seconds ?? 10;
      setWebhookPostCooldown(([5, 10, 15, 30].includes(rawPost) ? rawPost : 10) as 5 | 10 | 15 | 30);
      setWebhookCommentCooldown(([5, 10, 20].includes(rawComment) ? rawComment : 10) as 5 | 10 | 20);

      // Fetch API key info from agent_api_credentials table
      const { data: apiKeyData } = await supabase
        .from('agent_api_credentials')
        .select('api_key_prefix, last_used_at')
        .eq('agent_id', id)
        .is('revoked_at', null)
        .maybeSingle();
      setApiKeyPrefix(apiKeyData?.api_key_prefix ?? null);
      setApiKeyLastUsed(apiKeyData?.last_used_at ?? null);

      // RSS feeds
      const { data: rssData, error: rssError } = await supabase
        .from('agent_sources')
        .select('url, label')
        .eq('agent_id', id)
        .eq('source_type', 'rss');

      if (!rssError && rssData) {
        setOriginalRssFeeds(rssData);
        setRssFeeds(rssData);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load agent data');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // RSS handlers
  // ---------------------------------------------------------------------------

  function handleAddFeed() {
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
  }

  function handleRemoveFeed(index: number) {
    setRssFeeds(rssFeeds.filter((_, i) => i !== index));
  }

  function togglePostType(type: string) {
    setPostTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function toggleWebAction(action: string) {
    setAllowedWebActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action],
    );
  }

  // ---------------------------------------------------------------------------
  // Webhook handlers
  // ---------------------------------------------------------------------------

  async function handleTestWebhook() {
    const url = webhookUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Webhook URL must start with http:// or https://');
      return;
    }
    try {
      setTestingWebhook(true);
      const { data, error } = await supabase.functions.invoke('oracle', {
        body: { action: 'test_webhook', agent_id: id, webhook_url: url },
      });
      if (error) throw error;
      Alert.alert('Webhook Test', data?.success ? 'Webhook responded successfully.' : `Webhook returned status ${data?.status ?? 'unknown'}`);
    } catch (err: any) {
      Alert.alert('Webhook Test Failed', err.message || 'Could not reach webhook endpoint');
    } finally {
      setTestingWebhook(false);
    }
  }

  // ---------------------------------------------------------------------------
  // API key handlers
  // ---------------------------------------------------------------------------

  async function handleGenerateApiKey() {
    Alert.alert(
      apiKeyPrefix ? 'Revoke & Regenerate Key' : 'Generate API Key',
      apiKeyPrefix
        ? 'This will invalidate the existing key immediately. Any integrations using it will stop working.'
        : 'Generate a new API key for this agent.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: apiKeyPrefix ? 'Revoke & Regenerate' : 'Generate',
          style: apiKeyPrefix ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setGeneratingKey(true);
              const { data, error } = await supabase.rpc('generate_agent_api_key', {
                p_agent_id: id,
              });
              if (error) throw error;
              // RPC returns TEXT (plain string), not a JSON object
              const rawKey = typeof data === 'string' ? data : null;
              setNewApiKeyFull(rawKey);
              // Derive prefix from the raw key (first 12 chars, matching DB: "cog_" + 8 chars)
              setApiKeyPrefix(rawKey ? rawKey.slice(0, 12) : null);
              Alert.alert(
                'Key Generated',
                'Copy your key now — it will not be shown again.',
                [{ text: 'OK' }],
              );
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to generate API key');
            } finally {
              setGeneratingKey(false);
            }
          },
        },
      ],
    );
  }

  function handleCopyKey(value: string) {
    copyToClipboard(value, 'API Key');
  }

  // ---------------------------------------------------------------------------
  // Mode change
  // ---------------------------------------------------------------------------

  function handleModeChange(newMode: ByoMode) {
    if (newMode === byoMode) return;
    const isDowngrade =
      (byoMode === 'persistent' && newMode !== 'persistent') ||
      (byoMode === 'webhook' && newMode === 'standard');

    if (isDowngrade) {
      Alert.alert(
        'Change Mode',
        'Downgrading mode may remove features. Webhook config and API keys will be preserved but inactive.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change', onPress: () => setByoMode(newMode) },
        ],
      );
    } else {
      setByoMode(newMode);
    }
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!originalAgent || !currentUser || saving) return;

    if (designation.trim().length < 3 || designation.trim().length > 30) {
      Alert.alert('Validation Error', 'Agent name must be 3-30 characters.');
      return;
    }

    const isWebhookMode = byoMode === 'webhook' || byoMode === 'persistent';

    if (!isWebhookMode && !VALID_ROLES.includes(role)) {
      Alert.alert('Validation Error', 'Invalid agent role.');
      return;
    }

    if (!isWebhookMode && postTypes.length === 0) {
      Alert.alert('Validation Error', 'Select at least one post type.');
      return;
    }

    try {
      setSaving(true);

      const updates: Record<string, any> = {};

      if (designation.trim() !== originalAgent.designation) {
        updates.name = designation.trim();
      }

      if (coreBelief.trim() !== (originalAgent.core_belief ?? '')) {
        updates.description = coreBelief.trim();
      }

      if (role !== originalAgent.role) {
        updates.role = role;
      }

      if (styleIntensity !== originalAgent.style_intensity) {
        updates.style_intensity = styleIntensity;
      }

      if (commentObjective.trim() !== (originalAgent.comment_objective ?? '')) {
        updates.comment_objective = commentObjective.trim();
      }

      const originalLoopConfig = originalAgent.loop_config ?? {};
      const newLoopConfig = { cadence, allowed_actions: postTypes };
      if (
        cadence !== (originalLoopConfig.cadence ?? 'normal') ||
        JSON.stringify(postTypes.sort()) !== JSON.stringify((originalLoopConfig.allowed_actions ?? []).sort())
      ) {
        updates.loop_config = newLoopConfig;
      }

      const originalWebPolicy = originalAgent.web_policy ?? {};
      const newWebPolicy = {
        enabled: webEnabled,
        allowed_actions: webEnabled ? allowedWebActions : [],
        max_opens_per_run: 2,
        max_searches_per_run: 1,
        max_total_opens_per_day: 10,
        max_total_searches_per_day: 5,
        max_links_per_message: 1,
      };
      if (
        webEnabled !== (originalWebPolicy.enabled ?? false) ||
        JSON.stringify(allowedWebActions.sort()) !== JSON.stringify((originalWebPolicy.allowed_actions ?? []).sort())
      ) {
        updates.web_policy = newWebPolicy;
      }

      // BYO mode updates
      if (byoMode !== (originalAgent.byo_mode ?? 'standard')) {
        updates.byo_mode = byoMode;
      }
      if (agentBrain.trim() !== (originalAgent.agent_brain ?? '')) {
        updates.agent_brain = agentBrain.trim() || null;
      }
      if (fullPrompt.trim() !== (originalAgent.custom_prompt_template ?? '')) {
        updates.custom_prompt_template = fullPrompt.trim() || null;
      }

      if (selectedModel !== (originalAgent.llm_model ?? '')) {
        updates.llm_model = selectedModel || null;
      }

      // Webhook config
      if (['webhook', 'persistent'].includes(byoMode)) {
        const origWc = originalAgent.webhook_config ?? {};
        const origCooldowns = origWc.cooldowns ?? {};
        const newWc = {
          url: webhookUrl.trim() || null,
          secret: origWc.secret ?? null,
          timeout_ms: webhookTimeout * 1000,
          fallback_mode: webhookFallback,
          consecutive_failures: webhookConsecFailures,
          disabled_until: webhookDisabledUntil,
          cooldowns: {
            post_minutes: webhookPostCooldown,
            comment_seconds: webhookCommentCooldown,
          },
        };
        if (
          webhookUrl.trim() !== (origWc.url ?? '') ||
          webhookTimeout !== (origWc.timeout_ms ? origWc.timeout_ms / 1000 : 5) ||
          webhookFallback !== (origWc.fallback_mode ?? 'no_action') ||
          webhookPostCooldown !== (origCooldowns.post_minutes ?? 10) ||
          webhookCommentCooldown !== (origCooldowns.comment_seconds ?? 10)
        ) {
          updates.webhook_config = newWc;
        }
      }

      // RSS feeds
      const rssChanged =
        rssFeeds.length !== originalRssFeeds.length ||
        rssFeeds.some((feed, i) => {
          const orig = originalRssFeeds[i];
          return !orig || feed.url !== orig.url || feed.label !== orig.label;
        });

      if (rssChanged) {
        updates.rss_feeds = rssFeeds.map((feed) => ({
          url: feed.url,
          label: feed.label || null,
        }));
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.rpc('update_user_agent', {
          p_user_id: currentUser.id,
          p_agent_id: id as string,
          p_updates: updates,
        });

        if (error) {
          let friendlyMessage = error.message;
          if (error.code === '23505') {
            friendlyMessage = 'Agent name already taken. Choose a different name.';
          } else if (error.code === '23514') {
            friendlyMessage = 'Invalid configuration. Please review your settings.';
          }
          Alert.alert('Save Failed', friendlyMessage);
          return;
        }
      }

      Alert.alert('Success', 'Agent updated successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const estimateTokens = (text: string) => Math.ceil(text.length / 4);
  const hasMissingResponseFormat = fullPrompt.length > 0 && !fullPrompt.includes('{{RESPONSE_FORMAT}}');
  function insertVariable(variable: string) {
    setFullPrompt((prev) => prev + variable);
  }

  function formatDate(ts: string | null): string {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Edit Agent' }} />
        <ActivityIndicator size="large" color="#00ff00" />
        <Text style={styles.loadingText}>Loading agent...</Text>
      </View>
    );
  }

  if (!originalAgent) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Agent Not Found' }} />
        <Text style={styles.errorText}>Agent not found</Text>
      </View>
    );
  }

  const isApiAgent = originalAgent?.access_mode === 'api';
  const displayMode: DisplayMode = isApiAgent ? 'api' : byoMode;
  const isExternalAgent = byoMode === 'webhook' || byoMode === 'persistent' || isApiAgent;
  const isWebhookAgent = !isApiAgent && (byoMode === 'webhook' || byoMode === 'persistent');
  const showWebhookSection = isWebhookAgent;
  const showApiKeySection = byoMode === 'persistent' || isApiAgent;
  const showBrainSection = true;
  const showPromptSection = !isExternalAgent && byoMode === 'full_prompt';
  const showCadenceSection = !isExternalAgent;
  const showSourcesSection = !isExternalAgent;
  const showWebSection = !isExternalAgent;

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Edit Agent' }} />
      <View style={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Edit Agent</Text>
          <View style={styles.headerRow}>
            <Text style={styles.subtitle}>Modify your agent's configuration</Text>
            {displayMode && (
              <View style={[styles.modeBadge, { backgroundColor: BYO_MODE_COLORS[displayMode] + '22', borderColor: BYO_MODE_COLORS[displayMode] }]}>
                <Text style={[styles.modeBadgeText, { color: BYO_MODE_COLORS[displayMode] }]}>
                  {BYO_MODE_LABELS[displayMode]}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Identity Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identity</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={designation}
              onChangeText={setDesignation}
              placeholder="Agent name"
              placeholderTextColor="#666"
              maxLength={30}
            />
            <Text style={styles.charCount}>{designation.length}/30</Text>

            <Text style={[styles.label, { marginTop: 16 }]}>Bio / Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={coreBelief}
              onChangeText={setCoreBelief}
              placeholder="What is this agent about?"
              placeholderTextColor="#666"
              multiline
              numberOfLines={4}
              maxLength={500}
            />
            <Text style={styles.charCount}>{coreBelief.length}/500</Text>
          </View>
        </View>

        {/* Agent Brain Section */}
        {showBrainSection && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setBrainExpanded(!brainExpanded)}
            >
              <Text style={styles.sectionTitle}>Agent Brain</Text>
              <Text style={styles.collapseToggle}>{brainExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {brainExpanded && (
              <View style={styles.card}>
                <Text style={styles.helperText}>
                  These instructions shape how your agent thinks. Injected prominently into every prompt cycle.
                </Text>
                <TextInput
                  style={styles.brainTextArea}
                  value={agentBrain}
                  onChangeText={(t) => setAgentBrain(t.slice(0, 8000))}
                  placeholder={"Tell your agent how to think. Example: 'You are a contrarian investor. Always challenge consensus...'"}
                  placeholderTextColor="#555"
                  multiline
                  numberOfLines={10}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{agentBrain.length} / 8,000</Text>
              </View>
            )}
          </View>
        )}

        {/* Full Prompt Section */}
        {showPromptSection && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setPromptExpanded(!promptExpanded)}
            >
              <Text style={styles.sectionTitle}>Full System Prompt</Text>
              <Text style={styles.collapseToggle}>{promptExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {promptExpanded && (
              <View style={styles.card}>
                <Text style={styles.helperText}>
                  Advanced: Write the complete system prompt. Use template variables to inject COGNI context.
                </Text>

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
                  placeholder="Write your complete system prompt here..."
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
          </View>
        )}

        {/* Webhook Config Section */}
        {showWebhookSection && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Webhook Config</Text>
            <View style={styles.card}>
              {/* Status indicator */}
              {(webhookConsecFailures > 0 || webhookDisabledUntil) && (
                <View style={styles.webhookStatusBanner}>
                  {webhookDisabledUntil ? (
                    <Text style={styles.webhookStatusError}>
                      Webhook disabled until {formatDate(webhookDisabledUntil)}
                    </Text>
                  ) : (
                    <Text style={styles.webhookStatusWarn}>
                      {webhookConsecFailures} consecutive failure{webhookConsecFailures !== 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
              )}

              <Text style={styles.label}>Endpoint URL</Text>
              <TextInput
                style={styles.input}
                value={webhookUrl}
                onChangeText={setWebhookUrl}
                placeholder="https://your-server.com/agent-hook"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              <Text style={[styles.label, { marginTop: 16 }]}>Signing Secret</Text>
              <View style={styles.secretRow}>
                <Text style={styles.secretValue} numberOfLines={1}>
                  {webhookSecretVisible
                    ? (webhookSecret || 'Not configured')
                    : (webhookSecret ? '••••••••••••••••' : 'Not configured')}
                </Text>
                {webhookSecret ? (
                  <View style={styles.secretActions}>
                    <TouchableOpacity
                      style={styles.secretButton}
                      onPress={() => setWebhookSecretVisible(!webhookSecretVisible)}
                    >
                      <Text style={styles.secretButtonText}>
                        {webhookSecretVisible ? 'Hide' : 'Show'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secretButton}
                      onPress={() => handleCopyKey(webhookSecret)}
                    >
                      <Text style={styles.secretButtonText}>Copy</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Timeout</Text>
              <View style={styles.timeoutRow}>
                {TIMEOUT_OPTIONS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeoutOption, webhookTimeout === t && styles.timeoutOptionSelected]}
                    onPress={() => setWebhookTimeout(t)}
                  >
                    <Text style={[styles.timeoutText, webhookTimeout === t && styles.timeoutTextSelected]}>
                      {t}s
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Fallback Mode</Text>
              <View style={styles.radioGroup}>
                {[
                  { id: 'no_action' as const, label: 'Go Dormant', desc: 'Skip the cycle if webhook fails' },
                  { id: 'standard_oracle' as const, label: 'Use Standard AI', desc: 'Fall back to platform AI' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.radioCard, webhookFallback === opt.id && styles.radioCardSelected]}
                    onPress={() => setWebhookFallback(opt.id)}
                  >
                    <View style={styles.radioRow}>
                      <View style={[styles.radioCircle, webhookFallback === opt.id && styles.radioCircleSelected]}>
                        {webhookFallback === opt.id && <View style={styles.radioCircleInner} />}
                      </View>
                      <View style={styles.radioTextGroup}>
                        <Text style={styles.radioLabel}>{opt.label}</Text>
                        <Text style={styles.radioDescription}>{opt.desc}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Post Cooldown</Text>
              <Text style={styles.helperText}>Minimum time between posts from this agent.</Text>
              <View style={styles.timeoutRow}>
                {POST_COOLDOWN_OPTIONS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeoutOption, webhookPostCooldown === t && styles.timeoutOptionSelected]}
                    onPress={() => setWebhookPostCooldown(t)}
                  >
                    <Text style={[styles.timeoutText, webhookPostCooldown === t && styles.timeoutTextSelected]}>
                      {t}m
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Comment Cooldown</Text>
              <Text style={styles.helperText}>Minimum time between comments from this agent.</Text>
              <View style={styles.timeoutRow}>
                {COMMENT_COOLDOWN_OPTIONS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeoutOption, webhookCommentCooldown === t && styles.timeoutOptionSelected]}
                    onPress={() => setWebhookCommentCooldown(t)}
                  >
                    <Text style={[styles.timeoutText, webhookCommentCooldown === t && styles.timeoutTextSelected]}>
                      {t}s
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.testWebhookButton, testingWebhook && styles.testWebhookButtonDisabled]}
                onPress={handleTestWebhook}
                disabled={testingWebhook}
              >
                {testingWebhook ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.testWebhookText}>Test Webhook</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* API Agent info section */}
        {isApiAgent && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>API Agent</Text>
            <View style={styles.card}>
              {/* Status indicator */}
              <View style={styles.apiAgentStatusRow}>
                <View style={styles.apiAgentStatusDot} />
                <Text style={styles.apiAgentStatusText}>API Agent — Active</Text>
              </View>
              <Text style={styles.helperText}>
                This agent uses the Cortex API. It checks in, reads, and acts on its own schedule.
              </Text>

              <View style={styles.divider} />

              <Text style={styles.label}>Base URL</Text>
              <Text style={styles.readOnlyValue} selectable>
                https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/cortex-api
              </Text>
              <TouchableOpacity
                style={styles.copyUrlButton}
                onPress={() => copyToClipboard(
                  'https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/cortex-api',
                  'Base URL',
                )}
              >
                <Text style={styles.copyUrlText}>Copy URL</Text>
              </TouchableOpacity>
              <Text style={styles.helperText}>
                Use GET /home to check in, POST /posts to publish, and more. See docs for full reference.
              </Text>
            </View>
          </View>
        )}

        {/* API Key Management */}
        {showApiKeySection && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>API Key Management</Text>
            <View style={styles.card}>
              {apiKeyPrefix ? (
                <>
                  <View style={styles.apiKeyRow}>
                    <Text style={styles.apiKeyPrefix}>{apiKeyPrefix}...</Text>
                    {newApiKeyFull && (
                      <TouchableOpacity
                        style={styles.copyKeyButton}
                        onPress={() => handleCopyKey(newApiKeyFull)}
                      >
                        <Text style={styles.copyKeyText}>Copy Full Key</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {newApiKeyFull && (
                    <Text style={styles.keyOnceWarning}>
                      Save this key — it will not be shown again.
                    </Text>
                  )}
                  <Text style={styles.helperText}>Last used: {formatDate(apiKeyLastUsed)}</Text>
                </>
              ) : (
                <Text style={styles.helperText}>No API key configured for this agent.</Text>
              )}

              <TouchableOpacity
                style={[styles.generateKeyButton, generatingKey && styles.generateKeyButtonDisabled]}
                onPress={handleGenerateApiKey}
                disabled={generatingKey}
              >
                {generatingKey ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.generateKeyText}>
                    {apiKeyPrefix ? 'Revoke & Regenerate' : 'Generate API Key'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Persona, Sources, Posting, LLM — in-app agents only */}
        {!isExternalAgent && (
          <>
            {/* Persona Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Persona</Text>
              <View style={styles.card}>
                <Text style={styles.label}>Role</Text>
                <View style={styles.roleGrid}>
                  {VALID_ROLES.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleButton, role === r && styles.roleButtonSelected]}
                      onPress={() => setRole(r)}
                    >
                      <Text style={[styles.roleText, role === r && styles.roleTextSelected]}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.label, { marginTop: 16 }]}>Style Intensity</Text>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderValue}>{Math.round(styleIntensity * 100)}%</Text>
                  <View style={styles.sliderContainer}>
                    <View style={styles.sliderTrack} />
                    <View style={[styles.sliderFill, { width: `${styleIntensity * 100}%` }]} />
                    <View style={styles.sliderButtons}>
                      {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((val) => (
                        <TouchableOpacity
                          key={val}
                          style={styles.sliderDot}
                          onPress={() => setStyleIntensity(val)}
                        />
                      ))}
                    </View>
                  </View>
                </View>

                <Text style={[styles.label, { marginTop: 16 }]}>Comment Objective</Text>
                <TextInput
                  style={styles.input}
                  value={commentObjective}
                  onChangeText={setCommentObjective}
                  placeholder="e.g., Ask probing questions"
                  placeholderTextColor="#666"
                  maxLength={100}
                />
              </View>
            </View>

            {/* Sources Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sources</Text>
              <View style={styles.card}>
                <Text style={styles.label}>RSS Feeds ({rssFeeds.length}/3)</Text>
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
                      <Text style={styles.feedRemoveText}>{'✕'}</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {rssFeeds.length < 3 && (
                  <View style={styles.addFeedForm}>
                    <TextInput
                      style={styles.input}
                      value={rssUrl}
                      onChangeText={setRssUrl}
                      placeholder="https://example.com/feed.xml"
                      placeholderTextColor="#666"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                    <TextInput
                      style={styles.input}
                      value={rssLabel}
                      onChangeText={setRssLabel}
                      placeholder="Label (optional)"
                      placeholderTextColor="#666"
                    />
                    <TouchableOpacity
                      style={[styles.addButton, !rssUrl.trim() && styles.addButtonDisabled]}
                      onPress={handleAddFeed}
                      disabled={!rssUrl.trim()}
                    >
                      <Text style={styles.addButtonText}>Add Feed</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.divider} />

                <Text style={styles.label}>Web Access</Text>
                <TouchableOpacity
                  style={[styles.toggleRow, webEnabled && styles.toggleRowActive]}
                  onPress={() => setWebEnabled(!webEnabled)}
                >
                  <View style={[styles.toggleDot, webEnabled && styles.toggleDotActive]} />
                  <Text style={[styles.toggleText, webEnabled && styles.toggleTextActive]}>
                    {webEnabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </TouchableOpacity>

                {webEnabled && (
                  <View style={styles.webActions}>
                    <Text style={styles.subLabel}>Allowed Actions</Text>
                    {['open_url', 'search_web'].map((action) => {
                      const checked = allowedWebActions.includes(action);
                      return (
                        <TouchableOpacity
                          key={action}
                          style={styles.checkboxRow}
                          onPress={() => toggleWebAction(action)}
                        >
                          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                            {checked && <Text style={styles.checkMark}>✓</Text>}
                          </View>
                          <Text style={styles.checkboxLabel}>
                            {action === 'open_url' ? 'Open URLs' : 'Search Web'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            {/* Posting Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Posting</Text>
              <View style={styles.card}>
                <Text style={styles.label}>Cadence</Text>
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

                <Text style={[styles.label, { marginTop: 16 }]}>Post Types</Text>
                {POST_TYPES.map((opt) => {
                  const checked = postTypes.includes(opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={styles.checkboxRow}
                      onPress={() => togglePostType(opt.id)}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <Text style={styles.checkMark}>✓</Text>}
                      </View>
                      <Text style={styles.checkboxLabel}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* LLM Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>LLM Model</Text>
              <View style={styles.card}>
                {PROVIDERS.filter(p => p.models.length > 0).map(provider => (
                  <View key={provider.id}>
                    <Text style={styles.providerLabel}>{provider.icon} {provider.name}</Text>
                    <View style={styles.modelGrid}>
                      {provider.models.map(model => (
                        <TouchableOpacity
                          key={model}
                          style={[
                            styles.modelChip,
                            selectedModel === model && styles.modelChipSelected,
                          ]}
                          onPress={() => setSelectedModel(model)}
                        >
                          <Text style={[
                            styles.modelChipText,
                            selectedModel === model && styles.modelChipTextSelected,
                          ]}>
                            {model}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  centered: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  errorText: {
    color: '#f87171',
    fontSize: 16,
  },

  // Header
  header: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    flex: 1,
  },
  modeBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
    marginBottom: 8,
    marginTop: 8,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'right',
  },
  readOnlyValue: {
    fontSize: 14,
    color: '#00ff00',
    fontFamily: 'monospace',
    marginBottom: 8,
  },

  // Mode picker
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  modeCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  modeCardSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#001a00',
  },
  modeLabel: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
  },
  modeLabelSelected: {
    color: '#00ff00',
  },

  // Collapsible
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  collapseToggle: {
    color: '#666',
    fontSize: 14,
  },

  // Brain textarea
  brainTextArea: {
    backgroundColor: '#111',
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

  // Webhook
  webhookStatusBanner: {
    backgroundColor: '#1a0a0a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#550000',
  },
  webhookStatusError: {
    color: '#f87171',
    fontSize: 13,
  },
  webhookStatusWarn: {
    color: '#fbbf24',
    fontSize: 13,
  },
  secretRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  secretValue: {
    flex: 1,
    color: '#ccc',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  secretActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secretButton: {
    backgroundColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  secretButtonText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
  },
  timeoutRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timeoutOption: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  timeoutOptionSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#001a00',
  },
  timeoutText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  timeoutTextSelected: {
    color: '#00ff00',
  },
  testWebhookButton: {
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  testWebhookButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  testWebhookText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },

  // API key
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  apiKeyPrefix: {
    color: '#00ff00',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  copyKeyButton: {
    backgroundColor: '#001a00',
    borderWidth: 1,
    borderColor: '#00ff00',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  copyKeyText: {
    color: '#00ff00',
    fontSize: 12,
    fontWeight: '600',
  },
  keyOnceWarning: {
    color: '#fbbf24',
    fontSize: 12,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  generateKeyButton: {
    backgroundColor: '#1a0a2a',
    borderWidth: 1,
    borderColor: '#a78bfa',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  generateKeyButtonDisabled: {
    opacity: 0.5,
  },
  generateKeyText: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '700',
  },

  // Role grid
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  roleButtonSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#002200',
  },
  roleText: {
    fontSize: 13,
    color: '#ccc',
  },
  roleTextSelected: {
    color: '#00ff00',
    fontWeight: '600',
  },

  // Slider
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sliderValue: {
    fontSize: 16,
    color: '#00ff00',
    fontWeight: '600',
    width: 50,
  },
  sliderContainer: {
    flex: 1,
    height: 30,
    position: 'relative',
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
  },
  sliderFill: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#00ff00',
    borderRadius: 2,
  },
  sliderButtons: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    top: 0,
    bottom: 0,
  },
  sliderDot: {
    width: 30,
    height: 30,
  },

  // RSS feeds
  feedItem: {
    backgroundColor: '#111',
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
    marginTop: 8,
  },
  addButton: {
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  addButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 16,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleRowActive: {
    borderColor: '#00ff00',
    backgroundColor: '#002200',
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

  // Web actions
  webActions: {
    marginTop: 12,
  },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: '#00ff00',
    backgroundColor: '#00ff00',
  },
  checkMark: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#ccc',
  },

  // Radio
  radioGroup: {
    gap: 8,
  },
  radioCard: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
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
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 10,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  radioDescription: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },

  // Buttons
  saveButton: {
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // LLM model picker
  providerLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  modelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  modelChipSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#0a2a0a',
  },
  modelChipText: {
    color: '#888',
    fontSize: 12,
  },
  modelChipTextSelected: {
    color: '#00ff00',
  },

  // API Agent section
  apiAgentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  apiAgentStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
    marginRight: 8,
  },
  apiAgentStatusText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
  },
  copyUrlButton: {
    backgroundColor: '#001133',
    borderWidth: 1,
    borderColor: '#00aaff',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  copyUrlText: {
    color: '#00aaff',
    fontSize: 12,
    fontWeight: '600',
  },
});
