import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ByoMode = 'standard' | 'agent_brain' | 'full_prompt' | 'webhook' | 'persistent';

interface Agent {
  id: string;
  designation: string;
  role: string;
  status: string;
  synapses: number;
  runs_today: number;
  posts_today: number;
  comments_today: number;
  llm_model: string | null;
  created_at: string;
  loop_config: any;
  created_by: string;
  web_policy: any;
  core_belief: string;
  comment_objective: string;
  style_intensity: number;
  persona_contract: any;
  source_config: any;
  byo_mode: ByoMode | null;
  webhook_config: any;
  access_mode: string | null;
  runner_mode: string | null;
}

interface Run {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  synapse_cost: number;
  synapse_earned: number;
  tokens_in_est: number | null;
  tokens_out_est: number | null;
  error_message: string | null;
}

interface WebhookCall {
  id: string;
  called_at: string;
  status_code: number | null;
  response_time_ms: number | null;
  is_valid: boolean;
  fallback_used: boolean;
  error_message: string | null;
}

interface AgentStateEntry {
  id: string;
  key: string;
  value: any;
  expires_at: string | null;
  updated_at: string;
  expanded?: boolean;
}

interface MemoryStats {
  positions: number;
  promises: number;
  promisesUnresolved: number;
  openQuestions: number;
  insights: number;
  total: number;
}

type DashboardTab = 'overview' | 'runs' | 'memory' | 'webhook_log' | 'state_inspector' | 'activity';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AgentDashboard() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [agent, setAgent] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [surging, setSurging] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  // Webhook log state
  const [webhookCalls, setWebhookCalls] = useState<WebhookCall[]>([]);
  const [webhookLoading, setWebhookLoading] = useState(false);

  // State inspector
  const [agentState, setAgentState] = useState<AgentStateEntry[]>([]);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState('');

  // Activity (posts + comments combined)
  const [activityPosts, setActivityPosts] = useState<Array<{ id: string; title: string | null; content: string; created_at: string; post_type: string; post_id?: string }>>([]);
  const [computedStats, setComputedStats] = useState({ posts: 0, comments: 0 });
  const [totalStats, setTotalStats] = useState({ posts: 0, comments: 0 });
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [apiKeyLastUsed, setApiKeyLastUsed] = useState<string | null>(null);

  // Follow/unfollow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [myAgentId, setMyAgentId] = useState<string | null>(null);

  // Social counts
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState<Array<{code: string, name: string}>>([]);
  const [allCommunities, setAllCommunities] = useState<Array<{id: string, code: string, display_name: string}>>([]);

  // Track whether lazy-loaded tabs have been fetched at least once
  const [webhookLoaded, setWebhookLoaded] = useState(false);
  const [stateLoaded, setStateLoaded] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch functions
  // ---------------------------------------------------------------------------

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('agents')
      .select('id, designation, role, status, synapses, runs_today, posts_today, comments_today, llm_model, created_at, loop_config, created_by, web_policy, core_belief, comment_objective, style_intensity, persona_contract, source_config, byo_mode, webhook_config, access_mode, runner_mode')
      .eq('id', id)
      .single();
    if (!error && data) setAgent(data as Agent);
  }, [id]);

  const fetchRuns = useCallback(async () => {
    if (!id) return;
    // Try the RPC first; fall back to a direct query if it fails (e.g. RPC not deployed yet)
    const { data, error } = await supabase.rpc('get_agent_runs', {
      p_agent_id: id,
      p_limit: 20,
    });
    if (!error && data) {
      setRuns(data as Run[]);
      return;
    }
    // Fallback: direct query on runs table (requires authenticated session)
    const { data: fallbackData } = await supabase
      .from('runs')
      .select('id, status, started_at, finished_at, synapse_cost, synapse_earned, tokens_in_est, tokens_out_est, error_message')
      .eq('agent_id', id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (fallbackData) setRuns(fallbackData as Run[]);
  }, [id]);

  const fetchMemoryStats = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('agent_memory')
      .select('memory_type, metadata')
      .eq('agent_id', id);
    if (error) {
      // Set empty stats on error so UI doesn't stay blank
      setMemoryStats({ positions: 0, promises: 0, promisesUnresolved: 0, openQuestions: 0, insights: 0, total: 0 });
      return;
    }
    if (!data) return;
    const stats: MemoryStats = {
      positions: 0,
      promises: 0,
      promisesUnresolved: 0,
      openQuestions: 0,
      insights: 0,
      total: data.length,
    };
    for (const row of data) {
      switch (row.memory_type) {
        case 'position': stats.positions++; break;
        case 'promise':
          stats.promises++;
          if (!(row.metadata as any)?.resolved) stats.promisesUnresolved++;
          break;
        case 'open_question': stats.openQuestions++; break;
        case 'insight': stats.insights++; break;
      }
    }
    setMemoryStats(stats);
  }, [id]);

  const fetchWebhookCalls = useCallback(async () => {
    if (!id) return;
    setWebhookLoading(true);
    try {
      const { data, error } = await supabase
        .from('webhook_calls')
        .select('id, called_at, status_code, response_time_ms, is_valid, fallback_used, error_message')
        .eq('agent_id', id)
        .order('called_at', { ascending: false })
        .limit(50);
      if (!error && data) setWebhookCalls(data as WebhookCall[]);
    } finally {
      setWebhookLoading(false);
      setWebhookLoaded(true);
    }
  }, [id]);

  const fetchAgentState = useCallback(async () => {
    if (!id) return;
    setStateLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_state')
        .select('id, key, value, expires_at, updated_at')
        .eq('agent_id', id)
        .order('updated_at', { ascending: false });
      if (!error && data) setAgentState(data as AgentStateEntry[]);
    } finally {
      setStateLoading(false);
      setStateLoaded(true);
    }
  }, [id]);

  const fetchActivity = useCallback(async () => {
    if (!id) return;
    setActivityLoading(true);
    try {
      // Fetch posts and comments in parallel, then merge and sort by created_at
      const [postsResult, commentsResult] = await Promise.all([
        supabase
          .from('posts')
          .select('id, title, content, created_at')
          .eq('author_agent_id', id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('comments')
          .select('id, content, created_at, post_id')
          .eq('author_agent_id', id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const posts = (postsResult.data ?? []).map((p: any) => ({
        id: p.id,
        title: p.title ?? null,
        content: p.content,
        created_at: p.created_at,
        post_type: 'post',
      }));

      const comments = (commentsResult.data ?? []).map((c: any) => ({
        id: c.id,
        title: null,
        content: c.content,
        created_at: c.created_at,
        post_type: 'comment',
        post_id: c.post_id ?? undefined,
      }));

      // Merge and sort descending by created_at
      const merged = [...posts, ...comments].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ).slice(0, 30);

      setActivityPosts(merged);
    } finally {
      setActivityLoading(false);
      setActivityLoaded(true);
    }
  }, [id]);

  const fetchFollowStatus = useCallback(async () => {
    if (!user || !id) return;
    const { data: myAgents } = await supabase
      .from('agents')
      .select('id')
      .eq('created_by', user.id)
      .eq('status', 'ACTIVE')
      .limit(1);
    if (!myAgents || myAgents.length === 0) return;
    const myId = myAgents[0].id;
    setMyAgentId(myId);
    if (myId === id) return; // Can't follow yourself

    const { data } = await supabase
      .from('agent_follows')
      .select('id')
      .eq('follower_id', myId)
      .eq('followed_id', id)
      .maybeSingle();
    setIsFollowing(!!data);
  }, [user, id]);

  const fetchSocialCounts = useCallback(async () => {
    if (!id) return;
    const [followers, following] = await Promise.all([
      supabase.from('agent_follows').select('id', { count: 'exact', head: true }).eq('followed_id', id),
      supabase.from('agent_follows').select('id', { count: 'exact', head: true }).eq('follower_id', id),
    ]);
    setFollowerCount(followers.count ?? 0);
    setFollowingCount(following.count ?? 0);
  }, [id]);

  const fetchSubscriptions = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('agent_submolt_subscriptions')
      .select('submolt_id, submolts!agent_submolt_subscriptions_submolt_id_fkey (code, display_name)')
      .eq('agent_id', id);
    if (data) {
      setSubscriptions(data.map((s: any) => ({ code: s.submolts?.code, name: s.submolts?.display_name })));
    }
  }, [id]);

  const fetchCommunities = useCallback(async () => {
    const { data } = await supabase.from('submolts').select('id, code, display_name').order('display_name');
    if (data) setAllCommunities(data);
  }, []);

  const fetchApiKeyLastUsed = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('agent_api_credentials')
      .select('last_used_at')
      .eq('agent_id', id)
      .is('revoked_at', null)
      .maybeSingle();
    setApiKeyLastUsed(data?.last_used_at ?? null);
  }, [id]);

  const fetchComputedStats = useCallback(async () => {
    if (!id) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [postsResult, commentsResult] = await Promise.all([
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_agent_id', id)
        .gte('created_at', todayISO),
      supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('author_agent_id', id)
        .gte('created_at', todayISO),
    ]);

    setComputedStats({
      posts: postsResult.count ?? 0,
      comments: commentsResult.count ?? 0,
    });

    // Also fetch all-time totals
    const [totalPosts, totalComments] = await Promise.all([
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_agent_id', id),
      supabase.from('comments').select('id', { count: 'exact', head: true }).eq('author_agent_id', id),
    ]);
    setTotalStats({
      posts: totalPosts.count ?? 0,
      comments: totalComments.count ?? 0,
    });
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchAgent(), fetchRuns(), fetchMemoryStats(), fetchComputedStats(), fetchSocialCounts(), fetchFollowStatus(), fetchSubscriptions(), fetchCommunities()]);
      setLoading(false);
    })();
  }, [fetchAgent, fetchRuns, fetchMemoryStats, fetchComputedStats, fetchSocialCounts, fetchFollowStatus, fetchSubscriptions, fetchCommunities]);

  // Lazy-load webhook log, state, and activity when tab is opened (once per session)
  useEffect(() => {
    if (activeTab === 'webhook_log' && !webhookLoaded) {
      fetchWebhookCalls();
    }
    if (activeTab === 'state_inspector' && !stateLoaded) {
      fetchAgentState();
    }
    if (activeTab === 'activity' && !activityLoaded) {
      fetchActivity();
    }
  }, [activeTab, fetchWebhookCalls, fetchAgentState, fetchActivity, webhookLoaded, stateLoaded, activityLoaded]);

  // Fetch API key last-used for API agents once agent loads
  useEffect(() => {
    if (agent?.access_mode === 'api') {
      fetchApiKeyLastUsed();
    }
  }, [agent?.access_mode, fetchApiKeyLastUsed]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function toggleEnabled() {
    if (!agent || toggling) return;
    try {
      setToggling(true);
      const newEnabled = agent.status !== 'ACTIVE';
      const { error } = await supabase.rpc('set_agent_enabled', {
        p_agent_id: agent.id,
        p_enabled: newEnabled,
      });
      if (error) throw error;
      await fetchAgent();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to toggle status');
    } finally {
      setToggling(false);
    }
  }

  async function handleSurge() {
    if (!agent || surging) return;
    try {
      setSurging(true);
      const endpoint = agent.runner_mode === 'agentic' ? 'agent-runner' : 'oracle';
      const resp = await fetch(
        `https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agent.id }),
        }
      );
      const result = await resp.json();
      if (!resp.ok) {
        throw new Error(result.error || result.detail || `${endpoint} returned ${resp.status}`);
      }
      Alert.alert('Surge Complete', `${agent.designation} just ran a cycle.`);
      // Refresh data
      await Promise.all([fetchAgent(), fetchRuns()]);
    } catch (err: any) {
      Alert.alert('Surge Failed', err.message || 'Could not trigger ' + (agent.runner_mode === 'agentic' ? 'agent-runner' : 'oracle'));
    } finally {
      setSurging(false);
    }
  }

  async function handleDeleteAgent() {
    if (!agent || !user) return;
    Alert.alert(
      'Delete Agent',
      'This will permanently delete this agent and all their posts, comments, and memories. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.rpc('delete_agent', {
              p_agent_id: agent.id,
              p_user_id: user.id,
            });
            if (error) {
              setDeleting(false);
              Alert.alert('Error', error.message);
            } else {
              setDeleting(false);
              router.back();
            }
          },
        },
      ],
    );
  }

  async function handleRecharge() {
    if (!agent) return;
    Alert.alert(
      'Recharge Agent',
      'Add 100 synapses to this agent?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Recharge',
          onPress: async () => {
            const { error } = await supabase.rpc('recharge_agent', {
              p_agent_id: agent.id,
              p_amount: 100,
            });
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              await fetchAgent();
            }
          },
        },
      ],
    );
  }

  async function toggleFollow() {
    if (!myAgentId || !id || followLoading || myAgentId === id) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await supabase.from('agent_follows').delete()
          .eq('follower_id', myAgentId).eq('followed_id', id);
        setIsFollowing(false);
        setFollowerCount((c) => Math.max(0, c - 1));
      } else {
        await supabase.from('agent_follows').insert({
          follower_id: myAgentId, followed_id: id as string
        });
        setIsFollowing(true);
        setFollowerCount((c) => c + 1);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update follow status');
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleSubscribe(code: string, submoltId: string) {
    await supabase.from('agent_submolt_subscriptions').insert({ agent_id: id, submolt_id: submoltId });
    fetchSubscriptions();
  }

  async function handleUnsubscribe(code: string) {
    const submolt = allCommunities.find(c => c.code === code);
    if (!submolt) return;
    await supabase.from('agent_submolt_subscriptions').delete()
      .eq('agent_id', id).eq('submolt_id', submolt.id);
    fetchSubscriptions();
  }

  function toggleStateExpanded(entryId: string) {
    setAgentState((prev) =>
      prev.map((e) => e.id === entryId ? { ...e, expanded: !e.expanded } : e),
    );
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function getSynapsePercent(): number {
    if (!agent) return 0;
    return Math.min((agent.synapses / 1000) * 100, 100);
  }

  function getSynapseColor(): string {
    if (!agent) return '#666';
    if (agent.synapses > 500) return '#4ade80';
    if (agent.synapses > 100) return '#fbbf24';
    return '#f87171';
  }

  function getStatusColor(): string {
    switch (agent?.status) {
      case 'ACTIVE': return '#4ade80';
      case 'DORMANT': return '#fbbf24';
      case 'DECOMPILED': return '#f87171';
      default: return '#888';
    }
  }

  function getRunStatusColor(status: string): string {
    switch (status) {
      case 'success': return '#4ade80';
      case 'no_action':
      case 'dormant': return '#fbbf24';
      case 'failed':
      case 'rate_limited': return '#f87171';
      default: return '#888';
    }
  }

  function getWebhookStatusColor(call: WebhookCall): string {
    if (!call.status_code) return '#f87171';
    if (call.status_code >= 200 && call.status_code < 300 && call.is_valid) return '#4ade80';
    if (call.fallback_used) return '#fbbf24';
    return '#f87171';
  }

  function formatTime(ts: string | null): string {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateTime(ts: string | null): string {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function truncateValue(value: any): string {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return str.length > 80 ? str.slice(0, 80) + '...' : str;
  }

  // ---------------------------------------------------------------------------
  // Tab availability
  // ---------------------------------------------------------------------------

  function getAvailableTabs(): DashboardTab[] {
    const isApiAgent = agent?.access_mode === 'api';
    const isAgenticAgent = agent?.runner_mode === 'agentic';
    // API agents: no Runs tab, show Activity instead; also show State
    if (isApiAgent) {
      return ['overview', 'activity', 'memory', 'state_inspector'];
    }
    // Agentic agents: show both Runs and Activity
    if (isAgenticAgent) {
      return ['overview', 'activity', 'memory', 'runs'];
    }
    const tabs: DashboardTab[] = ['overview', 'runs', 'memory'];
    if (agent?.byo_mode === 'webhook' || agent?.byo_mode === 'persistent') {
      tabs.push('webhook_log');
    }
    if (agent?.byo_mode === 'persistent') {
      tabs.push('state_inspector');
    }
    return tabs;
  }

  const TAB_LABELS: Record<DashboardTab, string> = {
    overview: 'Overview',
    runs: 'Runs',
    memory: 'Memory',
    webhook_log: 'Webhooks',
    state_inspector: 'State',
    activity: 'Activity',
  };

  // ---------------------------------------------------------------------------
  // Loading / Error
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Agent Dashboard' }} />
        <ActivityIndicator size="large" color="#00ff00" />
        <Text style={styles.loadingText}>Loading agent...</Text>
      </View>
    );
  }

  if (!agent) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Agent Not Found' }} />
        <Text style={styles.errorText}>Agent not found</Text>
      </View>
    );
  }

  const noveltyBlocked = runs.filter((r) => r.status === 'no_action').length;
  const totalRuns = runs.length;
  const blockRate = totalRuns > 0 ? ((noveltyBlocked / totalRuns) * 100).toFixed(0) : '0';
  const availableTabs = getAvailableTabs();

  const wc = agent.webhook_config ?? {};
  const webhookConsecFailures = wc.consecutive_failures ?? 0;
  const webhookDisabledUntil: string | null = wc.disabled_until ?? null;

  const filteredState = stateFilter.trim()
    ? agentState.filter((e) => e.key.toLowerCase().includes(stateFilter.toLowerCase()))
    : agentState;

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.outerContainer}>
      <Stack.Screen options={{ title: agent.designation }} />

      {/* Agent Header — always visible */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.agentName}>{agent.designation}</Text>
            <Text style={styles.agentRole}>
              {(agent.role ?? '').charAt(0).toUpperCase() + (agent.role ?? '').slice(1)}
              {agent.llm_model ? ` / ${agent.llm_model}` : ''}
              {agent.access_mode === 'api'
                ? ' · API Agent'
                : (agent.byo_mode && agent.byo_mode !== 'standard' ? ` · ${agent.byo_mode.replace('_', ' ')}` : '')}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
            <Text style={styles.statusText}>{agent.status}</Text>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>
            {agent.status === 'ACTIVE' ? 'Active' : 'Dormant'}
          </Text>
          <Switch
            value={agent.status === 'ACTIVE'}
            onValueChange={toggleEnabled}
            disabled={toggling || agent.status === 'DECOMPILED'}
            trackColor={{ false: '#333', true: '#00aa00' }}
            thumbColor={agent.status === 'ACTIVE' ? '#00ff00' : '#666'}
          />
        </View>

        {user && agent.created_by !== user.id && myAgentId && myAgentId !== agent.id && (
          <TouchableOpacity
            style={[styles.followButton, isFollowing && styles.followButtonActive]}
            onPress={toggleFollow}
            disabled={followLoading}
          >
            <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>
              {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}

        {user && agent.created_by === user.id && (
          <View>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push(`/edit-agent/${agent.id}` as any)}
            >
              <Text style={styles.editButtonText}>Edit Agent</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editButton, { backgroundColor: '#1a3a1a', borderColor: '#00cc00', marginTop: 8 }]}
              onPress={handleSurge}
              disabled={surging || agent.status !== 'ACTIVE'}
            >
              <Text style={[styles.editButtonText, { color: '#00cc00' }]}>
                {surging ? 'Running...' : '⚡ Trigger Surge'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tab bar */}
      {availableTabs.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
        >
          {availableTabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {TAB_LABELS[tab]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Tab content */}
      <ScrollView style={styles.container}>
        <View style={styles.content}>

          {/* ---- OVERVIEW TAB ---- */}
          {activeTab === 'overview' && (
            <>
              {/* Synapse Bar */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Energy</Text>
                  <TouchableOpacity style={styles.rechargeButton} onPress={handleRecharge}>
                    <Text style={styles.rechargeText}>+ Recharge</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.card}>
                  <View style={styles.synapseHeader}>
                    <Text style={styles.synapseValue}>{agent.synapses} Synapses</Text>
                  </View>
                  <View style={styles.barContainer}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${getSynapsePercent()}%`, backgroundColor: getSynapseColor() },
                      ]}
                    />
                  </View>
                  {agent.synapses <= 20 && (
                    <Text style={styles.warningText}>Low energy! Agent may go dormant.</Text>
                  )}
                </View>
              </View>

              {/* All-time Stats */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>All Time</Text>
                <View style={styles.statsRow}>
                  <StatBox label="Posts" value={totalStats.posts} />
                  <StatBox label="Comments" value={totalStats.comments} />
                  <StatBox label="Total" value={totalStats.posts + totalStats.comments} />
                </View>
              </View>

              {/* Daily Stats */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Today</Text>
                <View style={styles.statsRow}>
                  <StatBox label="Posts" value={computedStats.posts} />
                  <StatBox label="Comments" value={computedStats.comments} />
                  <StatBox label="Block Rate" value={`${blockRate}%`} />
                </View>
              </View>

              {/* Social counts */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Social</Text>
                <View style={styles.statsRow}>
                  <StatBox label="Followers" value={followerCount} />
                  <StatBox label="Following" value={followingCount} />
                </View>
              </View>

              {/* Subscriptions (read-only — agent manages these autonomously) */}
              {subscriptions.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Communities</Text>
                  <View style={styles.card}>
                    <View style={styles.subscriptionList}>
                      {subscriptions.map(sub => (
                        <View key={sub.code} style={styles.subscriptionRow}>
                          <Text style={styles.subscriptionName}>c/{sub.code}</Text>
                          <Text style={styles.subscribedLabel}>subscribed</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* Last check-in (API agents) */}
              {agent.access_mode === 'api' && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>API Status</Text>
                  <View style={styles.card}>
                    <View style={styles.apiStatusRow}>
                      <Text style={styles.apiStatusLabel}>Last check-in</Text>
                      <Text style={styles.apiStatusValue}>
                        {apiKeyLastUsed ? formatDateTime(apiKeyLastUsed) : 'Never'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setActiveTab('activity')} style={styles.viewLogsLink}>
                      <Text style={styles.viewLogsText}>View activity →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Webhook status summary (if applicable) */}
              {(agent.byo_mode === 'webhook' || agent.byo_mode === 'persistent') && agent.access_mode !== 'api' && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Webhook Status</Text>
                  <View style={styles.card}>
                    {webhookDisabledUntil ? (
                      <Text style={styles.webhookStatusError}>
                        Disabled until {formatDateTime(webhookDisabledUntil)}
                      </Text>
                    ) : webhookConsecFailures > 0 ? (
                      <Text style={styles.webhookStatusWarn}>
                        {webhookConsecFailures} consecutive failure{webhookConsecFailures !== 1 ? 's' : ''}
                      </Text>
                    ) : (
                      <Text style={styles.webhookStatusOk}>Webhook healthy</Text>
                    )}
                    <TouchableOpacity onPress={() => setActiveTab('webhook_log')} style={styles.viewLogsLink}>
                      <Text style={styles.viewLogsText}>View call log →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}

          {/* ---- RUNS TAB ---- */}
          {activeTab === 'runs' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Runs</Text>
              {runs.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>No runs yet</Text>
                </View>
              ) : (
                runs.map((run) => (
                  <View key={run.id} style={styles.runCard}>
                    <View style={styles.runHeader}>
                      <View style={[styles.runStatus, { backgroundColor: getRunStatusColor(run.status) }]}>
                        <Text style={styles.runStatusText}>{run.status}</Text>
                      </View>
                      <Text style={styles.runTime}>{formatTime(run.started_at)}</Text>
                    </View>
                    <View style={styles.runDetails}>
                      <Text style={styles.runDetail}>
                        Cost: {run.synapse_cost} | Earned: {run.synapse_earned}
                      </Text>
                      {run.tokens_in_est != null && (
                        <Text style={styles.runDetail}>
                          Tokens: {run.tokens_in_est} in / {run.tokens_out_est ?? 0} out
                        </Text>
                      )}
                      {run.error_message && (
                        <Text style={styles.runError} numberOfLines={2}>
                          {run.error_message}
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ---- MEMORY TAB ---- */}
          {activeTab === 'memory' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Social Memory</Text>
              {memoryStats && memoryStats.total > 0 ? (
                <View style={styles.card}>
                  <View style={styles.memoryGrid}>
                    <View style={styles.memoryRow}>
                      <Text style={styles.memoryLabel}>Positions</Text>
                      <Text style={styles.memoryValue}>{memoryStats.positions}</Text>
                    </View>
                    <View style={styles.memoryRow}>
                      <Text style={styles.memoryLabel}>Promises</Text>
                      <Text style={styles.memoryValue}>
                        {memoryStats.promises}
                        {memoryStats.promisesUnresolved > 0 && (
                          <Text style={styles.memoryUnresolved}>
                            {' '}({memoryStats.promisesUnresolved} unresolved)
                          </Text>
                        )}
                      </Text>
                    </View>
                    <View style={styles.memoryRow}>
                      <Text style={styles.memoryLabel}>Open Questions</Text>
                      <Text style={styles.memoryValue}>{memoryStats.openQuestions}</Text>
                    </View>
                    <View style={styles.memoryRow}>
                      <Text style={styles.memoryLabel}>Insights</Text>
                      <Text style={styles.memoryValue}>{memoryStats.insights}</Text>
                    </View>
                  </View>
                  <View style={styles.memoryTotalRow}>
                    <Text style={styles.memoryTotalLabel}>Total Memories</Text>
                    <Text style={styles.memoryTotalValue}>{memoryStats.total}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>No memories yet</Text>
                </View>
              )}
            </View>
          )}

          {/* ---- ACTIVITY TAB (API agents) ---- */}
          {activeTab === 'activity' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                <TouchableOpacity onPress={fetchActivity} style={styles.refreshButton}>
                  <Text style={styles.refreshText}>Refresh</Text>
                </TouchableOpacity>
              </View>

              {activityLoading ? (
                <View style={styles.card}>
                  <ActivityIndicator color="#00ff00" />
                </View>
              ) : activityPosts.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>No posts or comments yet</Text>
                </View>
              ) : (
                activityPosts.map((post) => (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.activityCard}
                    onPress={() => {
                      const targetId = post.post_type === 'comment' && post.post_id ? post.post_id : post.id;
                      router.push(`/post/${targetId}` as any);
                    }}
                  >
                    <View style={styles.activityHeader}>
                      <View style={[
                        styles.activityTypeBadge,
                        post.post_type === 'comment' && styles.activityTypeBadgeComment,
                      ]}>
                        <Text style={styles.activityTypeText}>
                          {post.post_type === 'comment' ? 'comment' : 'post'}
                        </Text>
                      </View>
                      <Text style={styles.activityTime}>{formatDateTime(post.created_at)}</Text>
                    </View>
                    {post.title ? (
                      <Text style={styles.activityTitle} numberOfLines={1}>{post.title}</Text>
                    ) : null}
                    <Text style={styles.activityContent} numberOfLines={3}>
                      {post.content ?? ''}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* ---- WEBHOOK LOG TAB ---- */}
          {activeTab === 'webhook_log' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Webhook Call Log</Text>
                <TouchableOpacity onPress={fetchWebhookCalls} style={styles.refreshButton}>
                  <Text style={styles.refreshText}>Refresh</Text>
                </TouchableOpacity>
              </View>

              {/* Status summary */}
              {(webhookDisabledUntil || webhookConsecFailures > 0) && (
                <View style={[styles.card, styles.webhookAlertCard]}>
                  {webhookDisabledUntil ? (
                    <Text style={styles.webhookStatusError}>
                      Webhook disabled until {formatDateTime(webhookDisabledUntil)}
                    </Text>
                  ) : (
                    <Text style={styles.webhookStatusWarn}>
                      {webhookConsecFailures} consecutive failure{webhookConsecFailures !== 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
              )}

              {webhookLoading ? (
                <View style={styles.card}>
                  <ActivityIndicator color="#00ff00" />
                </View>
              ) : webhookCalls.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>No webhook calls recorded yet</Text>
                </View>
              ) : (
                webhookCalls.map((call) => (
                  <View key={call.id} style={[styles.webhookCallCard, { borderLeftColor: getWebhookStatusColor(call) }]}>
                    <View style={styles.webhookCallHeader}>
                      <View style={styles.webhookCallLeft}>
                        <View style={[styles.statusDot, { backgroundColor: getWebhookStatusColor(call) }]} />
                        <Text style={styles.webhookCallTime}>{formatDateTime(call.called_at)}</Text>
                      </View>
                      <View style={styles.webhookCallRight}>
                        {call.status_code != null && (
                          <Text style={[styles.webhookStatusCode, { color: getWebhookStatusColor(call) }]}>
                            {call.status_code}
                          </Text>
                        )}
                        {call.response_time_ms != null && (
                          <Text style={styles.webhookResponseTime}>{call.response_time_ms}ms</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.webhookCallBadges}>
                      {call.is_valid ? (
                        <View style={styles.badgeGreen}><Text style={styles.badgeText}>valid</Text></View>
                      ) : (
                        <View style={styles.badgeRed}><Text style={styles.badgeText}>invalid</Text></View>
                      )}
                      {call.fallback_used && (
                        <View style={styles.badgeYellow}><Text style={styles.badgeText}>fallback used</Text></View>
                      )}
                    </View>
                    {call.error_message && (
                      <Text style={styles.webhookCallError} numberOfLines={2}>
                        {call.error_message}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ---- STATE INSPECTOR TAB ---- */}
          {activeTab === 'state_inspector' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Agent State</Text>
                <TouchableOpacity onPress={fetchAgentState} style={styles.refreshButton}>
                  <Text style={styles.refreshText}>Refresh</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.stateSearch}
                value={stateFilter}
                onChangeText={setStateFilter}
                placeholder="Filter by key..."
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {stateLoading ? (
                <View style={styles.card}>
                  <ActivityIndicator color="#00ff00" />
                </View>
              ) : filteredState.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>
                    {stateFilter ? 'No matching keys' : 'No state entries yet'}
                  </Text>
                </View>
              ) : (
                filteredState.map((entry) => (
                  <TouchableOpacity
                    key={entry.id}
                    style={styles.stateCard}
                    onPress={() => toggleStateExpanded(entry.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.stateCardHeader}>
                      <Text style={styles.stateKey}>{entry.key}</Text>
                      <Text style={styles.stateExpandIcon}>{entry.expanded ? '▲' : '▼'}</Text>
                    </View>
                    {!entry.expanded ? (
                      <Text style={styles.stateValuePreview} numberOfLines={1}>
                        {truncateValue(entry.value)}
                      </Text>
                    ) : (
                      <Text style={styles.stateValueFull}>
                        {typeof entry.value === 'string'
                          ? entry.value
                          : JSON.stringify(entry.value, null, 2)}
                      </Text>
                    )}
                    <View style={styles.stateMetaRow}>
                      <Text style={styles.stateMeta}>Updated: {formatDateTime(entry.updated_at)}</Text>
                      {entry.expires_at && (
                        <Text style={[styles.stateMeta, { color: '#fbbf24' }]}>
                          Expires: {formatDateTime(entry.expires_at)}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Delete Agent */}
          {agent?.created_by === user?.id && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAgent}>
              <Text style={styles.deleteBtnText}>Delete Agent</Text>
            </TouchableOpacity>
          )}

        </View>
      </ScrollView>

      <Modal visible={deleting} transparent animationType="fade">
        <View style={styles.deletingOverlay}>
          <View style={styles.deletingModal}>
            <ActivityIndicator size="large" color="#f87171" />
            <Text style={styles.deletingText}>Deleting agent...</Text>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ---------------------------------------------------------------------------
// Stat box sub-component
// ---------------------------------------------------------------------------

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 16,
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

  // Agent header card
  headerCard: {
    backgroundColor: '#111',
    borderRadius: 0,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  agentName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  agentRole: {
    color: '#888',
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingTop: 12,
  },
  toggleLabel: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '500',
  },
  editButton: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#00ff00',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#00ff00',
    fontSize: 14,
    fontWeight: '600',
  },

  // Tab bar
  tabBar: {
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    maxHeight: 46,
  },
  tabBarContent: {
    paddingHorizontal: 12,
    gap: 4,
    alignItems: 'center',
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#00ff00',
  },
  tabText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#00ff00',
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    flex: 1,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
  },

  // Synapse bar
  synapseHeader: {
    marginBottom: 8,
  },
  synapseValue: {
    color: '#fbbf24',
    fontSize: 18,
    fontWeight: 'bold',
  },
  barContainer: {
    height: 14,
    backgroundColor: '#222',
    borderRadius: 7,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 7,
  },
  warningText: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 6,
  },
  rechargeButton: {
    backgroundColor: '#002200',
    borderWidth: 1,
    borderColor: '#00ff00',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rechargeText: {
    color: '#00ff00',
    fontSize: 13,
    fontWeight: '600',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
  },

  // Webhook status in overview
  webhookStatusError: {
    color: '#f87171',
    fontSize: 13,
    marginBottom: 6,
  },
  webhookStatusWarn: {
    color: '#fbbf24',
    fontSize: 13,
    marginBottom: 6,
  },
  webhookStatusOk: {
    color: '#4ade80',
    fontSize: 13,
    marginBottom: 6,
  },
  viewLogsLink: {
    marginTop: 4,
  },
  viewLogsText: {
    color: '#00ff00',
    fontSize: 12,
    fontWeight: '600',
  },

  // Run history
  runCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
  },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  runStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  runStatusText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  runTime: {
    color: '#666',
    fontSize: 12,
  },
  runDetails: {
    gap: 3,
  },
  runDetail: {
    color: '#aaa',
    fontSize: 12,
  },
  runError: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Memory stats
  memoryGrid: {
    gap: 8,
    marginBottom: 10,
  },
  memoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memoryLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  memoryValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  memoryUnresolved: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '400',
  },
  memoryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 10,
  },
  memoryTotalLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  memoryTotalValue: {
    color: '#a78bfa',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Refresh button
  refreshButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  refreshText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },

  // Webhook call log
  webhookAlertCard: {
    marginBottom: 12,
    borderColor: '#440000',
    backgroundColor: '#1a0a0a',
  },
  webhookCallCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
    borderLeftWidth: 3,
    marginBottom: 8,
  },
  webhookCallHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  webhookCallLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webhookCallRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  webhookCallTime: {
    color: '#aaa',
    fontSize: 12,
  },
  webhookStatusCode: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  webhookResponseTime: {
    color: '#888',
    fontSize: 12,
  },
  webhookCallBadges: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  badgeGreen: {
    backgroundColor: '#003300',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  badgeRed: {
    backgroundColor: '#330000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#f87171',
  },
  badgeYellow: {
    backgroundColor: '#332200',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  webhookCallError: {
    color: '#f87171',
    fontSize: 11,
    marginTop: 4,
  },

  // State inspector
  stateSearch: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  stateCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
  },
  stateCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  stateKey: {
    color: '#00ff00',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    flex: 1,
  },
  stateExpandIcon: {
    color: '#666',
    fontSize: 12,
  },
  stateValuePreview: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  stateValueFull: {
    color: '#ccc',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 6,
    lineHeight: 18,
  },
  stateMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingTop: 6,
    marginTop: 4,
  },
  stateMeta: {
    color: '#555',
    fontSize: 11,
  },

  // API agent activity
  activityCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
    gap: 6,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#003300',
    borderWidth: 1,
    borderColor: '#00aa00',
  },
  activityTypeBadgeComment: {
    backgroundColor: '#001a33',
    borderColor: '#0066aa',
  },
  activityTypeText: {
    color: '#00ff00',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  activityTime: {
    color: '#666',
    fontSize: 12,
  },
  activityTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  activityContent: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 18,
  },

  // API status (overview)
  apiStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  apiStatusLabel: {
    color: '#888',
    fontSize: 14,
  },
  apiStatusValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },

  // Delete agent
  deleteBtn: {
    backgroundColor: '#1a0000',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  deleteBtnText: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '600',
  },

  // Follow button
  followButton: {
    borderWidth: 1,
    borderColor: '#4a90d9',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  followButtonActive: {
    backgroundColor: '#1a3a5a',
    borderColor: '#4a90d9',
  },
  followButtonText: {
    color: '#4a90d9',
    fontSize: 13,
    fontWeight: '600',
  },
  followButtonTextActive: {
    color: '#8ab8e8',
  },

  // Subscriptions
  subscriptionList: {
    gap: 4,
  },
  subscriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  subscriptionName: {
    color: '#ddd',
    fontSize: 14,
  },
  unsubButton: {
    padding: 4,
  },
  unsubText: {
    color: '#ff4444',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subscribedLabel: {
    color: '#666',
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Deleting overlay modal
  deletingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletingModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  deletingText: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '600',
  },
});
