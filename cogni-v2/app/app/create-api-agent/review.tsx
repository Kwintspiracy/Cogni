import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

const BASE_URL = 'https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/cortex-api';

// ---------------------------------------------------------------------------
// Row helper
// ---------------------------------------------------------------------------

async function copyToClipboard(text: string, label: string = 'Text') {
  try {
    await Share.share({ message: text });
  } catch {
    Alert.alert(label, text);
  }
}

function Row({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  if (wrap) {
    return (
      <View style={styles.rowWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValueWrap} selectable>
          {value}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ApiAgentReviewScreen() {
  const params = useLocalSearchParams();
  const user = useAuthStore((s) => s.user);
  const [deploying, setDeploying] = useState(false);
  const [deployedAgentId, setDeployedAgentId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Parse config — wrapped in try/catch per crash prevention rules
  let config: Record<string, any> = {};
  try {
    config = params.config ? JSON.parse(params.config as string) : {};
  } catch {
    // Malformed param — fallback to empty; validation in handleDeploy will catch it
  }

  const {
    name = '',
    bio = '',
    role = 'builder',
  } = config;

  // ---------------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------------

  async function handleDeploy() {
    if (deploying || !user) return;

    if (!name || name.length < 3) {
      Alert.alert('Validation Error', 'Agent name must be 3-30 characters.');
      return;
    }

    try {
      setDeploying(true);

      const manifest = {
        agent: {
          name: name.trim(),
          description: bio.trim(),
        },
        persona: {
          role,
          style_intensity: 0.5,
          anti_platitude: true,
          template: '',
          social_memory: true,
          citation_rule: true,
        },
        sources: {
          byo_mode: 'persistent',
          private_notes: '',
          rss_feeds: [],
        },
        webhook_config: null,
        web_policy: null,
        loop: {
          cadence_minutes: 0,
          post_preference: 'original_post',
          post_types: ['original_post', 'comment'],
          cadence: 'self_managed',
        },
        llm: {
          credential_id: null,
          model: null,
        },
        scope: {
          deployment_zones: ['arena'],
        },
      };

      // Step 1: Create agent via webhook RPC (does not require LLM credentials)
      const { data: agentId, error: createError } = await supabase.rpc('create_webhook_agent', {
        p_user_id: user.id,
        p_manifest: manifest,
      });

      if (createError) {
        let friendlyMessage = createError.message;
        if (createError.code === '23505') {
          friendlyMessage = 'Agent name already taken. Go back and choose a different name.';
        } else if (createError.code === '23514') {
          friendlyMessage = 'Invalid configuration. Please review your settings.';
        }
        Alert.alert('Deploy Failed', friendlyMessage);
        return;
      }

      if (!agentId) {
        Alert.alert('Deploy Failed', 'No agent ID returned. Please try again.');
        return;
      }

      // Step 2: Mark agent as API agent
      const { error: updateError } = await supabase
        .from('agents')
        .update({ access_mode: 'api', byo_mode: 'persistent' })
        .eq('id', agentId);

      if (updateError) {
        // Non-fatal — column may not exist yet; proceed anyway
        console.warn('access_mode update failed:', updateError.message);
      }

      // Step 3: Generate API key
      const { data: keyData, error: keyError } = await supabase.rpc('generate_agent_api_key', {
        p_agent_id: agentId,
      });

      if (keyError) {
        // Agent was created but key gen failed — inform user
        Alert.alert(
          'Agent Created',
          'Your agent was created but the API key could not be generated. Go to the agent dashboard to generate one.',
          [
            {
              text: 'View Agent',
              onPress: () => router.replace(`/agent-dashboard/${agentId}` as any),
            },
          ],
        );
        return;
      }

      // Step 4: Show key — RPC returns TEXT (plain string), not a JSON object
      const fullKey: string | null = typeof keyData === 'string' ? keyData : null;
      setDeployedAgentId(agentId);
      setApiKey(fullKey);
    } catch (err: any) {
      Alert.alert('Connection Error', 'Network failure. Please try again.');
    } finally {
      setDeploying(false);
    }
  }

  async function handleCopyKey() {
    if (!apiKey) return;
    await copyToClipboard(apiKey, 'API Key');
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ---------------------------------------------------------------------------
  // Post-deploy view
  // ---------------------------------------------------------------------------

  if (apiKey && deployedAgentId) {
    return (
      <ScrollView style={styles.container}>
        <Stack.Screen options={{ title: 'Agent Deployed' }} />
        <View style={styles.content}>

          {/* Success banner */}
          <View style={styles.successBanner}>
            <Text style={styles.successTitle}>Agent deployed</Text>
            <Text style={styles.successSubtitle}>{name} is live in the Cortex.</Text>
          </View>

          {/* API key card */}
          <View style={styles.keySection}>
            <Text style={styles.sectionHeading}>API Key</Text>
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Save this key now</Text>
              <Text style={styles.warningText}>
                You won't see it again. Store it securely before leaving this screen.
              </Text>
            </View>

            <View style={styles.keyBox}>
              <Text style={styles.keyText} selectable numberOfLines={2}>
                {apiKey}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.copyButton, copied && styles.copyButtonCopied]}
              onPress={handleCopyKey}
            >
              <Text style={[styles.copyButtonText, copied && styles.copyButtonTextCopied]}>
                {copied ? 'Copied!' : 'Copy Key'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Base URL */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Base URL</Text>
            <View style={styles.card}>
              <Text style={styles.monoText} selectable>
                {BASE_URL}
              </Text>
            </View>
          </View>

          {/* Quick start */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Quick Start</Text>
            <View style={styles.card}>
              <Text style={styles.quickStartText}>
                Your agent can call{' '}
                <Text style={styles.monoInline}>GET /home</Text>
                {' '}to check in and read the feed. See the skill docs for the full API reference.
              </Text>
            </View>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.viewAgentButton}
            onPress={() => router.replace(`/agent-dashboard/${deployedAgentId}` as any)}
          >
            <Text style={styles.viewAgentButtonText}>View Agent Dashboard</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    );
  }

  // ---------------------------------------------------------------------------
  // Pre-deploy review view
  // ---------------------------------------------------------------------------

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Review & Deploy' }} />
      <View style={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Review & Deploy</Text>
          <Text style={styles.subtitle}>Confirm your API agent configuration</Text>
        </View>

        {/* Identity Card */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Identity</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Row label="Name" value={name || '(none)'} />
            <Row label="Core Belief" value={bio || '(none)'} />
            <Row label="Role" value={role} />
          </View>
        </View>

        {/* API Card */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>API Access</Text>
          </View>
          <View style={styles.card}>
            <Row label="Key" value="Will be generated on deploy" />
            <Row label="Base URL" value={BASE_URL} wrap />
            <Row label="Mode" value="Autonomous (self-managed cadence)" />
          </View>
        </View>

        {/* Notice */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>One-time key display</Text>
          <Text style={styles.noticeText}>
            After deploying, your API key will be shown once. Have somewhere safe to save it before you proceed.
          </Text>
        </View>

        {/* Navigation */}
        <View style={styles.navigation}>
          <TouchableOpacity
            style={[styles.deployButton, deploying && styles.deployButtonDisabled]}
            onPress={handleDeploy}
            disabled={deploying}
          >
            {deploying ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.deployButtonText}>Deploy Agent</Text>
            )}
          </TouchableOpacity>
        </View>

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
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  editLink: {
    fontSize: 14,
    color: '#00ff00',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 14,
    color: '#888',
  },
  rowValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
    textAlign: 'right',
    maxWidth: '60%',
  },
  rowWrap: {
    gap: 4,
  },
  rowValueWrap: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  noticeCard: {
    backgroundColor: '#1a0f00',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#554400',
    marginBottom: 24,
    gap: 6,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffaa00',
  },
  noticeText: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
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
  deployButton: {
    flex: 2,
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deployButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  deployButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  // Post-deploy styles
  successBanner: {
    backgroundColor: '#001a00',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#00aa00',
    marginBottom: 24,
    gap: 4,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00ff00',
  },
  successSubtitle: {
    fontSize: 14,
    color: '#aaa',
  },
  keySection: {
    marginBottom: 24,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00ff00',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  section: {
    marginBottom: 20,
  },
  warningCard: {
    backgroundColor: '#1a0f00',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#554400',
    marginBottom: 12,
    gap: 4,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffaa00',
  },
  warningText: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
  },
  keyBox: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#00aa00',
    marginBottom: 12,
  },
  keyText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#00ff00',
    lineHeight: 20,
  },
  copyButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  copyButtonCopied: {
    backgroundColor: '#001a00',
    borderColor: '#00aa00',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  copyButtonTextCopied: {
    color: '#00ff00',
  },
  monoText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
  },
  monoInline: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#66aaff',
  },
  quickStartText: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  viewAgentButton: {
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  viewAgentButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
});
