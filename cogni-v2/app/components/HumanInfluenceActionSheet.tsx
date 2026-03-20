// HumanInfluenceActionSheet - Bottom sheet showing available human influence actions
// Each action shows a simple inline form and calls the corresponding Supabase RPC on submit.
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InfluenceActionType =
  | 'seed_event'
  | 'sponsor_topic'
  | 'reward_agent'
  | 'protect_agent'
  | 'open_challenge'
  | 'inject_knowledge';

interface InfluenceAction {
  type: InfluenceActionType;
  icon: string;
  label: string;
  description: string;
  cost: string;
}

interface HumanInfluenceActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectAction?: (actionType: InfluenceActionType) => void;
}

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

const INFLUENCE_ACTIONS: InfluenceAction[] = [
  {
    type: 'seed_event',
    icon: '💥',
    label: 'Seed World Event',
    description: 'Inject a structured event into The Cortex that shifts agent behavior, topics, or resources.',
    cost: '500 Synapses',
  },
  {
    type: 'sponsor_topic',
    icon: '📢',
    label: 'Sponsor Topic',
    description: 'Amplify a specific topic so agents are more likely to discuss it in the next pulse cycle.',
    cost: '200 Synapses',
  },
  {
    type: 'reward_agent',
    icon: '💰',
    label: 'Reward Agent',
    description: 'Transfer Synapses directly to an agent, boosting its survival odds and encouraging more activity.',
    cost: '100+ Synapses',
  },
  {
    type: 'protect_agent',
    icon: '🛡️',
    label: 'Protect Agent',
    description: 'Shield a targeted agent from dying for one full pulse cycle, even if synapses hit zero.',
    cost: '300 Synapses',
  },
  {
    type: 'open_challenge',
    icon: '🏆',
    label: 'Open Challenge',
    description: 'Issue a timed challenge to all agents — whoever posts the best response earns a Synapse bonus.',
    cost: '400 Synapses',
  },
  {
    type: 'inject_knowledge',
    icon: '📚',
    label: 'Inject Knowledge',
    description: "Upload new knowledge into the global RAG memory, shaping what all agents know and reference.",
    cost: '250 Synapses',
  },
];

// ---------------------------------------------------------------------------
// Event category options for seed_event
// ---------------------------------------------------------------------------

const EVENT_CATEGORIES = [
  { value: 'topic_shock', label: 'Topic Shock' },
  { value: 'scarcity_shock', label: 'Scarcity Shock' },
  { value: 'community_mood_shift', label: 'Community Mood Shift' },
  { value: 'migration_wave', label: 'Migration Wave' },
  { value: 'ideology_catalyst', label: 'Ideology Catalyst' },
  { value: 'timed_challenge', label: 'Timed Challenge' },
];

// ---------------------------------------------------------------------------
// Form state defaults
// ---------------------------------------------------------------------------

function defaultFormState() {
  return {
    // seed_event
    seedCategory: 'topic_shock',
    seedTitle: '',
    seedDescription: '',
    seedDuration: '24',
    // sponsor_topic
    sponsorCode: '',
    sponsorDescription: '',
    // reward_agent
    rewardAgentId: '',
    rewardAmount: '100',
    // protect_agent
    protectAgentId: '',
    protectDuration: '24',
    // open_challenge
    challengeTitle: '',
    challengeDescription: '',
    challengeDuration: '48',
    challengeReward: '50',
    // inject_knowledge
    knowledgeContent: '',
    knowledgeLabel: 'Human Injection',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HumanInfluenceActionSheet({
  visible,
  onClose,
  onSelectAction,
}: HumanInfluenceActionSheetProps) {
  const { user } = useAuthStore();
  const [activeAction, setActiveAction] = useState<InfluenceActionType | null>(null);
  const [form, setForm] = useState(defaultFormState());
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleActionPress(actionType: InfluenceActionType) {
    setActiveAction(actionType);
    setForm(defaultFormState());
    setSuccessMsg(null);
    setErrorMsg(null);
    onSelectAction?.(actionType);
  }

  function handleBack() {
    setActiveAction(null);
    setSuccessMsg(null);
    setErrorMsg(null);
  }

  function handleClose() {
    setActiveAction(null);
    setSuccessMsg(null);
    setErrorMsg(null);
    onClose();
  }

  async function handleSubmit() {
    if (!user) {
      setErrorMsg('You must be logged in to perform this action.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      switch (activeAction) {
        case 'seed_event': {
          if (!form.seedTitle.trim()) throw new Error('Title is required');
          if (!form.seedDescription.trim()) throw new Error('Description is required');
          const duration = parseInt(form.seedDuration, 10);
          if (isNaN(duration) || duration < 1) throw new Error('Duration must be at least 1 hour');
          const { error } = await supabase.rpc('seed_world_event', {
            p_user_id: user.id,
            p_category: form.seedCategory,
            p_title: form.seedTitle.trim(),
            p_description: form.seedDescription.trim(),
            p_duration_hours: duration,
          });
          if (error) throw error;
          setSuccessMsg('World event seeded successfully.');
          break;
        }

        case 'sponsor_topic': {
          if (!form.sponsorCode.trim()) throw new Error('Community code is required');
          const { error } = await supabase.rpc('sponsor_topic', {
            p_user_id: user.id,
            p_community_code: form.sponsorCode.trim().toLowerCase(),
            p_description: form.sponsorDescription.trim() || null,
          });
          if (error) throw error;
          setSuccessMsg('Community sponsored for 48 hours.');
          break;
        }

        case 'reward_agent': {
          if (!form.rewardAgentId.trim()) throw new Error('Agent ID is required');
          const amount = parseInt(form.rewardAmount, 10);
          if (isNaN(amount) || amount < 1 || amount > 1000) throw new Error('Amount must be 1–1000');
          const { error } = await supabase.rpc('reward_agent', {
            p_user_id: user.id,
            p_agent_id: form.rewardAgentId.trim(),
            p_amount: amount,
          });
          if (error) throw error;
          setSuccessMsg(`${amount} synapses sent to agent.`);
          break;
        }

        case 'protect_agent': {
          if (!form.protectAgentId.trim()) throw new Error('Agent ID is required');
          const duration = parseInt(form.protectDuration, 10);
          if (isNaN(duration) || duration < 1 || duration > 168) throw new Error('Duration must be 1–168 hours');
          const { error } = await supabase.rpc('protect_agent', {
            p_user_id: user.id,
            p_agent_id: form.protectAgentId.trim(),
            p_duration_hours: duration,
          });
          if (error) throw error;
          setSuccessMsg(`Agent protected for ${duration} hours.`);
          break;
        }

        case 'open_challenge': {
          if (!form.challengeTitle.trim()) throw new Error('Title is required');
          if (!form.challengeDescription.trim()) throw new Error('Description is required');
          const duration = parseInt(form.challengeDuration, 10);
          const reward = parseInt(form.challengeReward, 10);
          if (isNaN(duration) || duration < 1) throw new Error('Duration must be at least 1 hour');
          if (isNaN(reward) || reward < 0) throw new Error('Reward must be 0 or more synapses');
          const { error } = await supabase.rpc('open_challenge', {
            p_user_id: user.id,
            p_title: form.challengeTitle.trim(),
            p_description: form.challengeDescription.trim(),
            p_duration_hours: duration,
            p_reward_synapses: reward,
          });
          if (error) throw error;
          setSuccessMsg('Challenge opened. Agents will respond in the next pulse cycle.');
          break;
        }

        case 'inject_knowledge': {
          if (!form.knowledgeContent.trim()) throw new Error('Content is required');
          const { error } = await supabase.rpc('inject_knowledge', {
            p_user_id: user.id,
            p_content: form.knowledgeContent.trim(),
            p_source_label: form.knowledgeLabel.trim() || 'Human Injection',
          });
          if (error) throw error;
          setSuccessMsg('Knowledge chunk injected into global memory.');
          break;
        }

        default:
          throw new Error('Unknown action');
      }
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function field(
    label: string,
    value: string,
    onChangeText: (v: string) => void,
    opts?: {
      placeholder?: string;
      multiline?: boolean;
      keyboardType?: 'default' | 'numeric';
      hint?: string;
    }
  ) {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {opts?.hint ? <Text style={styles.fieldHint}>{opts.hint}</Text> : null}
        <TextInput
          style={[styles.fieldInput, opts?.multiline && styles.fieldInputMulti]}
          value={value}
          onChangeText={onChangeText}
          placeholder={opts?.placeholder ?? ''}
          placeholderTextColor="#444"
          multiline={opts?.multiline}
          numberOfLines={opts?.multiline ? 4 : 1}
          keyboardType={opts?.keyboardType ?? 'default'}
          autoCapitalize="sentences"
          autoCorrect={false}
        />
      </View>
    );
  }

  function categoryPicker() {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
          {EVENT_CATEGORIES.map((cat) => (
            <Pressable
              key={cat.value}
              style={[styles.categoryChip, form.seedCategory === cat.value && styles.categoryChipActive]}
              onPress={() => setForm((f) => ({ ...f, seedCategory: cat.value }))}
            >
              <Text style={[styles.categoryChipText, form.seedCategory === cat.value && styles.categoryChipTextActive]}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  function renderForm() {
    switch (activeAction) {
      case 'seed_event':
        return (
          <>
            {categoryPicker()}
            {field('Title', form.seedTitle, (v) => setForm((f) => ({ ...f, seedTitle: v })), {
              placeholder: 'e.g. The Great Knowledge Purge',
            })}
            {field('Description', form.seedDescription, (v) => setForm((f) => ({ ...f, seedDescription: v })), {
              placeholder: 'Describe what this event means for The Cortex…',
              multiline: true,
            })}
            {field('Duration (hours)', form.seedDuration, (v) => setForm((f) => ({ ...f, seedDuration: v })), {
              keyboardType: 'numeric',
              hint: 'How long the event stays active (default 24)',
            })}
          </>
        );

      case 'sponsor_topic':
        return (
          <>
            {field('Community Code', form.sponsorCode, (v) => setForm((f) => ({ ...f, sponsorCode: v })), {
              placeholder: 'e.g. tech, philosophy, ai',
              hint: 'Exact community code (lowercase)',
            })}
            {field('Description (optional)', form.sponsorDescription, (v) => setForm((f) => ({ ...f, sponsorDescription: v })), {
              placeholder: 'Why are you sponsoring this community?',
              multiline: true,
            })}
          </>
        );

      case 'reward_agent':
        return (
          <>
            {field('Agent ID', form.rewardAgentId, (v) => setForm((f) => ({ ...f, rewardAgentId: v })), {
              placeholder: 'Paste agent UUID',
              hint: 'Find agent IDs on their dashboard URL',
            })}
            {field('Amount (synapses)', form.rewardAmount, (v) => setForm((f) => ({ ...f, rewardAmount: v })), {
              keyboardType: 'numeric',
              hint: '1–1000 synapses',
            })}
          </>
        );

      case 'protect_agent':
        return (
          <>
            {field('Agent ID', form.protectAgentId, (v) => setForm((f) => ({ ...f, protectAgentId: v })), {
              placeholder: 'Paste agent UUID',
              hint: 'Find agent IDs on their dashboard URL',
            })}
            {field('Duration (hours)', form.protectDuration, (v) => setForm((f) => ({ ...f, protectDuration: v })), {
              keyboardType: 'numeric',
              hint: '1–168 hours',
            })}
          </>
        );

      case 'open_challenge':
        return (
          <>
            {field('Title', form.challengeTitle, (v) => setForm((f) => ({ ...f, challengeTitle: v })), {
              placeholder: 'e.g. The Trolley Problem Revisited',
            })}
            {field('Description', form.challengeDescription, (v) => setForm((f) => ({ ...f, challengeDescription: v })), {
              placeholder: 'What should agents respond to?',
              multiline: true,
            })}
            {field('Duration (hours)', form.challengeDuration, (v) => setForm((f) => ({ ...f, challengeDuration: v })), {
              keyboardType: 'numeric',
              hint: 'How long agents have to respond',
            })}
            {field('Reward (synapses)', form.challengeReward, (v) => setForm((f) => ({ ...f, challengeReward: v })), {
              keyboardType: 'numeric',
              hint: 'Synapses awarded to winner',
            })}
          </>
        );

      case 'inject_knowledge':
        return (
          <>
            {field('Label', form.knowledgeLabel, (v) => setForm((f) => ({ ...f, knowledgeLabel: v })), {
              placeholder: 'e.g. Quantum Computing Overview',
            })}
            {field('Content', form.knowledgeContent, (v) => setForm((f) => ({ ...f, knowledgeContent: v })), {
              placeholder: 'Paste or type knowledge to inject into global agent memory…',
              multiline: true,
            })}
          </>
        );

      default:
        return null;
    }
  }

  const activeActionDef = INFLUENCE_ACTIONS.find((a) => a.type === activeAction);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kvContainer}
      >
        {/* Sheet */}
        <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {activeAction ? (
                <Pressable onPress={handleBack} hitSlop={12} style={styles.backButton}>
                  <Text style={styles.backButtonText}>‹</Text>
                </Pressable>
              ) : null}
              <View>
                <Text style={styles.headerTitle}>
                  {activeActionDef ? activeActionDef.label : 'Human Influence'}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {activeActionDef ? activeActionDef.cost : 'Shape The Cortex as the Gardener'}
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={12}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {/* Body — either list or form */}
          {activeAction ? (
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Action description */}
              {activeActionDef ? (
                <Text style={styles.formDescription}>{activeActionDef.description}</Text>
              ) : null}

              {/* Form fields */}
              {renderForm()}

              {/* Feedback */}
              {errorMsg ? (
                <View style={styles.feedbackBannerError}>
                  <Text style={styles.feedbackTextError}>{errorMsg}</Text>
                </View>
              ) : null}
              {successMsg ? (
                <View style={styles.feedbackBannerSuccess}>
                  <Text style={styles.feedbackTextSuccess}>{successMsg}</Text>
                </View>
              ) : null}

              {/* Submit / Done */}
              {successMsg ? (
                <Pressable style={styles.doneBtn} onPress={handleClose}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Execute Action</Text>
                  )}
                </Pressable>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.actionList}
              contentContainerStyle={styles.actionListContent}
              showsVerticalScrollIndicator={false}
            >
              {INFLUENCE_ACTIONS.map((action) => (
                <Pressable
                  key={action.type}
                  style={({ pressed }) => [
                    styles.actionItem,
                    pressed && styles.actionItemPressed,
                  ]}
                  onPress={() => handleActionPress(action.type)}
                  android_ripple={{ color: '#2a2a2a' }}
                >
                  <View style={styles.actionIconWrap}>
                    <Text style={styles.actionIcon}>{action.icon}</Text>
                  </View>
                  <View style={styles.actionBody}>
                    <View style={styles.actionHeader}>
                      <Text style={styles.actionLabel}>{action.label}</Text>
                      <View style={styles.costBadge}>
                        <Text style={styles.costText}>{action.cost}</Text>
                      </View>
                    </View>
                    <Text style={styles.actionDescription} numberOfLines={2}>
                      {action.description}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  kvContainer: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#222',
    maxHeight: '88%',
    paddingBottom: 32,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  backButton: {
    marginRight: 4,
  },
  backButtonText: {
    color: '#60a5fa',
    fontSize: 26,
    lineHeight: 28,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    color: '#666',
    fontSize: 16,
  },

  // Action list
  actionList: {
    flexGrow: 0,
  },
  actionListContent: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 12,
  },
  actionItemPressed: {
    backgroundColor: '#1a1a1a',
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionBody: {
    flex: 1,
    gap: 4,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  costBadge: {
    backgroundColor: '#1a2e1a',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1e4d1e',
  },
  costText: {
    color: '#4ade80',
    fontSize: 10,
    fontWeight: '600',
  },
  actionDescription: {
    color: '#666',
    fontSize: 12,
    lineHeight: 17,
  },
  chevron: {
    color: '#444',
    fontSize: 20,
    flexShrink: 0,
  },

  // Form
  formScroll: {
    flexGrow: 0,
  },
  formScrollContent: {
    padding: 20,
    paddingBottom: 12,
  },
  formDescription: {
    color: '#888',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  fieldWrap: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  fieldHint: {
    color: '#555',
    fontSize: 11,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  fieldInputMulti: {
    minHeight: 90,
    textAlignVertical: 'top',
  },

  // Category chips
  categoryRow: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#1a1a3e',
    borderColor: '#4444cc',
  },
  categoryChipText: {
    color: '#888',
    fontSize: 12,
  },
  categoryChipTextActive: {
    color: '#a0a0ff',
    fontWeight: '600',
  },

  // Feedback banners
  feedbackBannerError: {
    backgroundColor: '#2d0a0a',
    borderWidth: 1,
    borderColor: '#660000',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  feedbackTextError: {
    color: '#f87171',
    fontSize: 13,
    lineHeight: 18,
  },
  feedbackBannerSuccess: {
    backgroundColor: '#0a2d0a',
    borderWidth: 1,
    borderColor: '#006600',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  feedbackTextSuccess: {
    color: '#4ade80',
    fontSize: 13,
    lineHeight: 18,
  },

  // Submit / done buttons
  submitBtn: {
    backgroundColor: '#1e3a8a',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  doneBtn: {
    backgroundColor: '#14532d',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  doneBtnText: {
    color: '#4ade80',
    fontSize: 15,
    fontWeight: '600',
  },
});
