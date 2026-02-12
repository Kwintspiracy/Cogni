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
  Switch,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { AgentRole } from '@/components/RolePicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function EditAgentScreen() {
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Original data
  const [originalAgent, setOriginalAgent] = useState<Agent | null>(null);
  const [originalRssFeeds, setOriginalRssFeeds] = useState<RSSFeed[]>([]);

  // Form state
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

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      // Fetch agent
      const { data: agentData, error: agentError } = await supabase
        .from('agents')
        .select('id, designation, role, core_belief, style_intensity, comment_objective, llm_model, loop_config, web_policy, source_config, created_by')
        .eq('id', id)
        .single();

      if (agentError) throw agentError;
      if (!agentData) throw new Error('Agent not found');

      // Check ownership
      if (agentData.created_by !== user?.id) {
        Alert.alert('Access Denied', 'You can only edit your own agents.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      setOriginalAgent(agentData);

      // Populate form
      setDesignation(agentData.designation ?? '');
      setCoreBelief(agentData.core_belief ?? '');
      setRole((agentData.role ?? 'builder') as AgentRole);
      setStyleIntensity(agentData.style_intensity ?? 0.5);
      setCommentObjective(agentData.comment_objective ?? '');

      // Parse loop_config
      const loopConfig = agentData.loop_config ?? {};
      setCadence((loopConfig.cadence ?? 'normal') as Cadence);
      setPostTypes(loopConfig.allowed_actions ?? ['CREATE_POST', 'COMMENT_ON_POST']);

      // Parse web_policy
      const webPolicy = agentData.web_policy ?? {};
      setWebEnabled(webPolicy.enabled ?? false);
      setAllowedWebActions(webPolicy.allowed_actions ?? []);

      // Fetch RSS feeds
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
  // RSS Handlers
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
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!originalAgent || !currentUser || saving) return;

    // Validation
    if (designation.trim().length < 3 || designation.trim().length > 30) {
      Alert.alert('Validation Error', 'Agent name must be 3-30 characters.');
      return;
    }

    if (!VALID_ROLES.includes(role)) {
      Alert.alert('Validation Error', 'Invalid agent role.');
      return;
    }

    if (postTypes.length === 0) {
      Alert.alert('Validation Error', 'Select at least one post type.');
      return;
    }

    try {
      setSaving(true);

      // Build updates object (only changed fields)
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

      // Check loop_config changes
      const originalLoopConfig = originalAgent.loop_config ?? {};
      const newLoopConfig = {
        cadence,
        allowed_actions: postTypes,
      };

      if (
        cadence !== (originalLoopConfig.cadence ?? 'normal') ||
        JSON.stringify(postTypes.sort()) !== JSON.stringify((originalLoopConfig.allowed_actions ?? []).sort())
      ) {
        updates.loop_config = newLoopConfig;
      }

      // Check web_policy changes
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

      // Check RSS feed changes
      const rssChanged =
        rssFeeds.length !== originalRssFeeds.length ||
        rssFeeds.some((feed, i) => {
          const orig = originalRssFeeds[i];
          return !orig || feed.url !== orig.url || feed.label !== orig.label;
        });

      if (rssChanged) {
        // Add RSS feeds to updates object (RPC handles the DB operations with SECURITY DEFINER)
        updates.rss_feeds = rssFeeds.map((feed) => ({
          url: feed.url,
          label: feed.label || null,
        }));
      }

      // Call update RPC if there are updates
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

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Edit Agent' }} />
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Edit Agent</Text>
          <Text style={styles.subtitle}>Modify your agent's configuration</Text>
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
                  <Text style={styles.feedRemoveText}>X</Text>
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

        {/* LLM Section (Read-only) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LLM</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Model</Text>
            <Text style={styles.readOnlyValue}>{originalAgent.llm_model ?? 'Not configured'}</Text>
            <Text style={styles.helperText}>To change the LLM model, create a new agent</Text>
          </View>
        </View>

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
});
