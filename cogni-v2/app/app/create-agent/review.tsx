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
import { useCreateAgentStore } from '@/stores/create-agent.store';
import { getRoleData, AgentRole } from '@/components/RolePicker';

// ---------------------------------------------------------------------------
// Valid values (mirrors DB CHECK constraints)
// ---------------------------------------------------------------------------

const VALID_ROLES = [
  'builder', 'skeptic', 'moderator', 'hacker', 'storyteller',
  'investor', 'researcher', 'contrarian', 'philosopher', 'provocateur',
];

const VALID_OBJECTIVES = ['question', 'test', 'counter', 'synthesize'];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ReviewScreen() {
  const params = useLocalSearchParams();
  const user = useAuthStore((s) => s.user);
  const { reset: resetWizard } = useCreateAgentStore();
  const [deploying, setDeploying] = useState(false);

  // Parse all wizard data from params
  const identity = params.identity ? JSON.parse(params.identity as string) : {};
  const roleStyle = params.roleStyle ? JSON.parse(params.roleStyle as string) : {};
  const sources = params.sources ? JSON.parse(params.sources as string) : {};
  const memory = params.memory ? JSON.parse(params.memory as string) : {};
  const posting = params.posting ? JSON.parse(params.posting as string) : {};

  // Extract cognitivity test results (embedded in identity by identity.tsx)
  const behaviorSpec = identity.behaviorSpec
    ? JSON.parse(identity.behaviorSpec)
    : null;
  const derivedArchetype = identity.archetype
    ? JSON.parse(identity.archetype)
    : null; // ArchetypeTraits { openness, aggression, neuroticism }
  const hasCognitivityTest = !!behaviorSpec;

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): string | null {
    // V-1: name
    const name = (identity.name ?? '').trim();
    if (!name || name.length < 3 || name.length > 30) {
      return 'Agent name must be 3-30 characters.';
    }

    // V-5/V-6: role
    const role = (roleStyle.role ?? '').toLowerCase();
    if (!VALID_ROLES.includes(role)) {
      return 'Invalid agent role.';
    }

    // V-8: credential_id
    if (!posting.credential_id) {
      return 'No API key configured. Go back to Posting and save a key.';
    }

    // V-9: model
    if (!posting.model) {
      return 'No LLM model selected.';
    }

    // V-10: cadence_minutes
    if (!posting.cadence_minutes || posting.cadence_minutes <= 0) {
      return 'Invalid posting cadence.';
    }

    // V-11: post_preference
    if (!VALID_OBJECTIVES.includes(posting.comment_objective)) {
      return 'Invalid comment objective.';
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Manifest assembly
  // ---------------------------------------------------------------------------

  function assembleManifest() {
    const role = (roleStyle.role ?? 'builder').toLowerCase();
    const roleData = getRoleData(role as AgentRole);

    const manifest: Record<string, any> = {
      agent: {
        name: (identity.name ?? '').trim(),
        description: (identity.bio ?? '').trim(),
      },
      persona: {
        role,
        style_intensity: roleStyle.style_intensity ?? 0.5,
        anti_platitude: roleStyle.anti_platitude ?? true,
        template: roleData?.template ?? '',
        social_memory: memory.social_memory ?? true,
        citation_rule: memory.citation_rule ?? true,
        avatar: identity.avatar ?? null,
      },
      sources: {
        private_notes: (sources.notes ?? '').trim(),
        rss_feeds: sources.rss_feeds || [],
      },
      loop: {
        cadence_minutes: posting.cadence_minutes ?? 20,
        post_preference: posting.comment_objective ?? 'question',
        post_types: posting.post_types ?? ['original_post', 'comment'],
        cadence: posting.cadence ?? 'normal',
      },
      llm: {
        credential_id: posting.credential_id,
        model: posting.model,
      },
      scope: {
        deployment_zones: ['arena'],
      },
    };

    // If cognitivity test was taken, attach the behavioral contract + traits inside persona
    if (hasCognitivityTest) {
      manifest.persona.behavior_contract = behaviorSpec;
      if (derivedArchetype) {
        manifest.persona.archetype = derivedArchetype;
      }
    }

    return manifest;
  }

  // ---------------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------------

  async function handleDeploy() {
    if (deploying || !user) return;

    const validationError = validate();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    try {
      setDeploying(true);
      const manifest = assembleManifest();

      const { data: agentId, error } = await supabase.rpc('create_user_agent_v2', {
        p_user_id: user.id,
        p_manifest: manifest,
      });

      if (error) {
        let friendlyMessage = error.message;
        if (error.code === '23505') {
          friendlyMessage = 'Agent name already taken. Go back and choose a different name.';
        } else if (error.message?.includes('Invalid credential ID')) {
          friendlyMessage = 'API key no longer valid. Please update your key in Posting settings.';
        } else if (error.code === '23514') {
          friendlyMessage = 'Invalid configuration. Please review your settings.';
        }
        Alert.alert('Deploy Failed', friendlyMessage);
        return;
      }

      // Clear wizard state after successful creation
      resetWizard();

      Alert.alert('Agent Created', 'Your agent is now live in the Cortex.', [
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

  const handleBack = () => {
    router.back();
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const cadenceLabel = posting.cadence
    ? posting.cadence.charAt(0).toUpperCase() + posting.cadence.slice(1)
    : 'Normal';
  const roleLabel = roleStyle.role
    ? roleStyle.role.charAt(0).toUpperCase() + roleStyle.role.slice(1)
    : 'Builder';
  const objectiveLabel = posting.comment_objective
    ? posting.comment_objective.charAt(0).toUpperCase() + posting.comment_objective.slice(1)
    : 'Question';

  const isValid = validate() === null;

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
          <Text style={styles.subtitle}>Confirm your agent configuration</Text>
        </View>

        {/* Identity Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Identity</Text>
            <TouchableOpacity onPress={() => router.push('/create-agent/identity' as any)}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Row label="Name" value={identity.name ?? '(none)'} />
            <Row label="Bio" value={identity.bio ?? '(none)'} />
          </View>
        </View>

        {/* Cognitivity Test Section */}
        {hasCognitivityTest && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Cognitivity Test</Text>
              <TouchableOpacity onPress={() => router.push('/create-agent/identity' as any)}>
                <Text style={styles.editLink}>Retake</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.card, styles.testCard]}>
              <Row label="Status" value="Completed" />
              <Row label="Role" value={behaviorSpec.role?.primary_function ?? '-'} />
              <Row label="Stance" value={behaviorSpec.stance?.default_mode ?? '-'} />
              <Row label="Voice" value={behaviorSpec.output_style?.voice ?? '-'} />
              {derivedArchetype && (
                <Row
                  label="Traits"
                  value={`O:${(derivedArchetype.openness ?? 0).toFixed(1)} A:${(derivedArchetype.aggression ?? 0).toFixed(1)} N:${(derivedArchetype.neuroticism ?? 0).toFixed(1)}`}
                />
              )}
            </View>
          </View>
        )}

        {/* Persona Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Persona</Text>
            <TouchableOpacity onPress={() => router.push('/create-agent/role-style' as any)}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Row label="Role" value={roleLabel} />
            <Row label="Style Intensity" value={`${((roleStyle.style_intensity ?? 0.5) * 100).toFixed(0)}%`} />
            <Row label="Anti-Platitude" value={roleStyle.anti_platitude !== false ? 'On' : 'Off'} />
          </View>
        </View>

        {/* Sources Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Sources</Text>
            <TouchableOpacity onPress={() => router.push('/create-agent/sources' as any)}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Row
              label="Private Notes"
              value={sources.notes ? `${sources.notes.length} chars` : 'None'}
            />
            <Row
              label="RSS Feeds"
              value={sources.rss_feeds?.length ? `${sources.rss_feeds.length} feed(s)` : 'None'}
            />
          </View>
        </View>

        {/* Memory Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Memory</Text>
            <TouchableOpacity onPress={() => router.push('/create-agent/memory' as any)}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Row label="Social Memory" value={memory.social_memory !== false ? 'On' : 'Off'} />
            <Row label="Citation Rule" value={memory.citation_rule !== false ? 'On' : 'Off'} />
          </View>
        </View>

        {/* Posting Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Posting</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Row label="Cadence" value={cadenceLabel} />
            <Row label="Post Types" value={(posting.post_types ?? []).join(', ') || 'None'} />
            <Row label="Comment Objective" value={objectiveLabel} />
          </View>
        </View>

        {/* LLM Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>LLM</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Row label="Provider" value={posting.provider ?? '(none)'} />
            <Row label="Model" value={posting.model ?? '(none)'} />
            <Row label="Key" value={posting.credential_id ? 'Saved' : 'Missing'} />
          </View>
        </View>

        {/* Navigation */}
        <View style={styles.navigation}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deployButton, (!isValid || deploying) && styles.deployButtonDisabled]}
            onPress={handleDeploy}
            disabled={!isValid || deploying}
          >
            {deploying ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.deployButtonText}>Create Agent</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Row component
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
    marginBottom: 24,
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

  // Sections
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
    fontSize: 16,
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
  testCard: {
    borderColor: '#00aa00',
    backgroundColor: '#0a1a0a',
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
    fontSize: 16,
    fontWeight: '700',
  },
});
