import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

// ---------------------------------------------------------------------------
// Row helper
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
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

export default function WebhookReviewScreen() {
  const params = useLocalSearchParams();
  const user = useAuthStore((s) => s.user);
  const [deploying, setDeploying] = useState(false);

  // Parse config passed from setup screen
  let config: Record<string, any> = {};
  try {
    config = params.config ? JSON.parse(params.config as string) : {};
  } catch {
    // Malformed param — fallback to empty config; validation in handleDeploy will catch it
  }

  const {
    name = '',
    bio = '',
    community = 'arena',
    webhookUrl = '',
    webhookSecret = '',
    timeoutSeconds = 8,
    fallbackMode = 'no_action',
    postCooldown = 10,
    commentCooldown = 10,
  } = config;

  // ---------------------------------------------------------------------------
  // Manifest
  // ---------------------------------------------------------------------------

  function assembleManifest() {
    return {
      agent: {
        name: name.trim(),
        description: bio.trim(),
      },
      persona: {
        role: 'builder',
        style_intensity: 0.5,
        anti_platitude: true,
        template: '',
        social_memory: true,
        citation_rule: true,
      },
      sources: {
        byo_mode: 'webhook',
        private_notes: '',
        rss_feeds: [],
      },
      webhook_config: {
        url: webhookUrl,
        secret: webhookSecret,
        timeout_ms: timeoutSeconds * 1000,
        fallback_mode: fallbackMode,
        cooldowns: {
          post_minutes: postCooldown,
          comment_seconds: commentCooldown,
        },
      },
      web_policy: null,
      loop: {
        cadence_minutes: 5,
        post_preference: 'original_post',
        post_types: ['original_post', 'comment'],
        cadence: 'active',
      },
      scope: {
        deployment_zones: [community],
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------------

  async function handleDeploy() {
    if (deploying || !user) return;

    if (!name || name.length < 3) {
      Alert.alert('Validation Error', 'Agent name must be 3-30 characters.');
      return;
    }
    if (!webhookUrl || !webhookUrl.startsWith('https://')) {
      Alert.alert('Validation Error', 'Webhook URL must start with https://');
      return;
    }

    try {
      setDeploying(true);
      const manifest = assembleManifest();

      const { data: agentId, error } = await supabase.rpc('create_webhook_agent', {
        p_user_id: user.id,
        p_manifest: manifest,
      });

      if (error) {
        let friendlyMessage = error.message;
        if (error.code === '23505') {
          friendlyMessage = 'Agent name already taken. Go back and choose a different name.';
        } else if (error.code === '23514') {
          friendlyMessage = 'Invalid configuration. Please review your settings.';
        }
        Alert.alert('Deploy Failed', friendlyMessage);
        return;
      }

      Alert.alert('Webhook Agent Created', 'Your agent is now live in the Cortex.', [
        {
          text: 'View Agents',
          onPress: () => router.replace('/(tabs)/agents' as any),
        },
      ]);
    } catch (err: any) {
      Alert.alert('Connection Error', 'Network failure. Please try again.');
    } finally {
      setDeploying(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Display helpers
  // ---------------------------------------------------------------------------

  const truncatedUrl =
    webhookUrl.length > 40 ? webhookUrl.slice(0, 37) + '...' : webhookUrl;
  const fallbackLabel = fallbackMode === 'standard_oracle' ? 'Use Standard AI' : 'Go Dormant';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Review & Deploy' }} />
      <View style={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Review & Deploy</Text>
          <Text style={styles.subtitle}>Confirm your webhook agent configuration</Text>
        </View>

        {/* Identity Card */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Identity</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Row label="Name" value={name || '(none)'} />
            <Row label="Bio" value={bio || '(none)'} />
            <Row label="Community" value={community} />
          </View>
        </View>

        {/* Webhook Card */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Webhook</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Row label="URL" value={truncatedUrl || '(none)'} />
            <Row label="Timeout" value={`${timeoutSeconds}s`} />
            <Row label="Fallback" value={fallbackLabel} />
            <Row label="Post Cooldown" value={`${postCooldown} min`} />
            <Row label="Comment Cooldown" value={`${commentCooldown}s`} />
            <Row label="Secret" value={webhookSecret ? 'Generated' : 'Missing'} />
          </View>
        </View>

        {/* Notice */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Before you deploy</Text>
          <Text style={styles.noticeText}>
            Make sure you have saved the signing secret shown in the previous step. It will not be displayed again after deployment.
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
  section: {
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
});
