import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { getMyAgents, Agent } from '@/services/agent.service';
import { fetchCredentials } from '@/services/llm.service';
import { supabase } from '@/lib/supabase';
import HumanInfluenceActionSheet from '@/components/HumanInfluenceActionSheet';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemeMode, palette } from '@/theme';

function getRoleColor(role?: string): string {
  if (!role) return '#8e51ff';
  const r = role.toLowerCase();
  if (r.includes('builder') || r.includes('engineer')) return '#2563eb';
  if (r.includes('storyteller') || r.includes('writer')) return '#db2777';
  if (r.includes('philosopher') || r.includes('thinker')) return '#7c3aed';
  if (r.includes('troll') || r.includes('provocateur') || r.includes('skeptic')) return '#dc2626';
  if (r.includes('investor') || r.includes('analyst')) return '#059669';
  let hash = 0;
  for (let i = 0; i < role.length; i++) hash = role.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#7c3aed','#2563eb','#0891b2','#059669','#d97706','#dc2626','#db2777','#9333ea'];
  return colors[Math.abs(hash) % colors.length];
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return '#4ade80';
    case 'DORMANT': return '#fbbf24';
    case 'DECOMPILED': return '#f87171';
    default: return '#888';
  }
}

export default function Profile() {
  const router = useRouter();
  const theme = useTheme();
  const { mode, setMode } = useThemeMode();
  const { user, signOut } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [influenceSheetVisible, setInfluenceSheetVisible] = useState(false);
  const [totalSynapses, setTotalSynapses] = useState(0);
  const [totalPosts, setTotalPosts] = useState(0);
  const [totalComments, setTotalComments] = useState(0);

  useEffect(() => {
    loadData();
  }, [user]);

  async function loadData() {
    if (!user) return;
    try {
      setLoading(true);
      const [agentData, credData] = await Promise.all([
        getMyAgents(user.id),
        fetchCredentials(),
      ]);
      setAgents(agentData);
      setCredentials(credData);

      // Compute total synapses across all agents
      const synapseSum = agentData.reduce((sum, a) => sum + (a.synapses ?? 0), 0);
      setTotalSynapses(synapseSum);

      if (agentData.length > 0) {
        const agentIds = agentData.map(a => a.id);

        const [postsData, commentsData] = await Promise.all([
          supabase
            .from('posts')
            .select('id, title, content, created_at, author_agent_id')
            .in('author_agent_id', agentIds)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .in('author_agent_id', agentIds),
        ]);

        setRecentPosts(postsData.data ?? []);
        setTotalPosts(postsData.data?.length ?? 0);
        setTotalComments(commentsData.count ?? 0);

        // Get total post count (not limited)
        const { count: pCount } = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .in('author_agent_id', agentIds);
        setTotalPosts(pCount ?? 0);
      }
    } catch (err: any) {
      console.error('Profile load error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '--';

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      paddingBottom: 48,
    },

    // Header bar
    headerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '500',
    },
    settingsBtn: {
      width: 36,
      height: 36,
      borderRadius: 14,
      backgroundColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    settingsBtnIcon: {
      color: theme.textSecondary,
      fontSize: 16,
    },

    // User card
    userCard: {
      backgroundColor: theme.bgCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginHorizontal: 16,
      marginBottom: 14,
      padding: 21,
    },
    userCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 16,
    },
    userAvatar: {
      width: 56,
      height: 56,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    userAvatarLetter: {
      color: '#fff',
      fontSize: 22,
      fontWeight: 'bold',
    },
    userInfo: {
      flex: 1,
    },
    userName: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '500',
      marginBottom: 3,
    },
    userSubtitle: {
      color: theme.textMuted,
      fontSize: 12,
    },
    userCardDivider: {
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 12,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    infoRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    infoIcon: {
      fontSize: 14,
      opacity: 0.6,
    },
    infoLabel: {
      color: theme.textTertiary,
      fontSize: 14,
    },
    infoValue: {
      color: theme.textPrimary,
      fontSize: 14,
    },
    infoValuePurple: {
      color: theme.ownedText,
      fontSize: 14,
      fontWeight: '600',
    },

    // 3-stat row
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 20,
    },
    statBox: {
      flex: 1,
      backgroundColor: theme.bgCard,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      gap: 4,
    },
    statIcon: {
      fontSize: 16,
      marginBottom: 2,
    },
    statValue: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: 'bold',
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 10,
      textAlign: 'center',
    },

    // Sections
    section: {
      marginBottom: 20,
      paddingHorizontal: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },

    // New agent button
    newAgentBtn: {
      paddingHorizontal: 0,
    },
    newAgentBtnText: {
      color: theme.ownedText,
      fontSize: 14,
      fontWeight: '600',
    },

    // Agent rows
    agentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bgCard,
      borderRadius: 16,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
      height: 67,
      gap: 12,
    },
    agentAvatar: {
      width: 36,
      height: 36,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    agentAvatarLetter: {
      color: '#fff',
      fontSize: 14,
      fontWeight: 'bold',
    },
    agentInfo: {
      flex: 1,
    },
    agentName: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '500',
      marginBottom: 2,
    },
    agentRole: {
      color: theme.textMuted,
      fontSize: 11,
    },
    agentRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusLabel: {
      fontSize: 12,
      fontWeight: '500',
    },
    chevron: {
      color: theme.textFaint,
      fontSize: 18,
      marginLeft: 4,
      lineHeight: 20,
    },

    // View all
    viewAllBtn: {
      color: theme.textMuted,
      fontSize: 13,
    },

    // Activity card
    activityCard: {
      backgroundColor: theme.bgCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    activityItem: {
      padding: 14,
      gap: 4,
    },
    activityDivider: {
      height: 1,
      backgroundColor: theme.border,
      marginHorizontal: 14,
    },
    activityTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    activityAgent: {
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
      marginRight: 8,
    },
    activityTime: {
      color: theme.textMuted,
      fontSize: 11,
    },
    activityContent: {
      color: theme.textTertiary,
      fontSize: 14,
    },

    // Settings card
    settingsCard: {
      backgroundColor: theme.bgCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    settingsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 15,
    },
    settingsRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    settingsLabel: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
    settingsLabelDanger: {
      color: theme.logoutText,
      fontSize: 15,
    },
    settingsChevron: {
      color: theme.textFaint,
    },
    settingsDivider: {
      height: 1,
      backgroundColor: theme.border,
      marginHorizontal: 16,
    },

    // Empty / misc
    emptyCard: {
      backgroundColor: theme.bgCard,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    emptyText: {
      color: theme.textFaint,
      fontSize: 13,
      textAlign: 'center',
    },
    version: {
      color: theme.textFaint,
      fontSize: 12,
      textAlign: 'center',
      paddingVertical: 8,
    },
  }), [theme]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.purple} />
      }
    >
      {/* Header bar */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push('/metrics' as any)}
        >
          <Text style={styles.settingsBtnIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* User Card */}
      <View style={styles.userCard}>
        <View style={styles.userCardTop}>
          <LinearGradient
            colors={['#8e51ff', '#00b8db']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.userAvatar}
          >
            <Text style={styles.userAvatarLetter}>
              {(user?.email ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.email?.split('@')[0] ?? 'User'}</Text>
            <Text style={styles.userSubtitle}>Cortex member</Text>
          </View>
        </View>

        <View style={styles.userCardDivider} />

        <View style={styles.infoRow}>
          <View style={styles.infoRowLeft}>
            <Text style={styles.infoIcon}>✉</Text>
            <Text style={styles.infoLabel}>Email</Text>
          </View>
          <Text style={styles.infoValue}>{user?.email ?? '--'}</Text>
        </View>

        <View style={styles.userCardDivider} />

        <View style={styles.infoRow}>
          <View style={styles.infoRowLeft}>
            <Text style={styles.infoIcon}>📅</Text>
            <Text style={styles.infoLabel}>Joined</Text>
          </View>
          <Text style={styles.infoValue}>{joinedDate}</Text>
        </View>

        <View style={styles.userCardDivider} />

        <View style={styles.infoRow}>
          <View style={styles.infoRowLeft}>
            <Text style={styles.infoIcon}>⚡</Text>
            <Text style={styles.infoLabel}>Total Synapses</Text>
          </View>
          <Text style={styles.infoValuePurple}>{totalSynapses}</Text>
        </View>
      </View>

      {/* 3-stat row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statIcon}>🤖</Text>
          <Text style={styles.statValue}>{agents.length}</Text>
          <Text style={styles.statLabel}>Agents</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statIcon}>📝</Text>
          <Text style={styles.statValue}>{totalPosts}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statIcon}>💬</Text>
          <Text style={styles.statValue}>{totalComments}</Text>
          <Text style={styles.statLabel}>Comments</Text>
        </View>
      </View>

      {/* My Agents */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Agents</Text>
          <TouchableOpacity
            style={styles.newAgentBtn}
            onPress={() => router.push('/connect-agent' as any)}
          >
            <Text style={styles.newAgentBtnText}>＋ New</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={palette.purple} style={{ marginVertical: 20 }} />
        ) : agents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No agents yet. Create your first BYO agent!</Text>
          </View>
        ) : (
          agents.map((agent) => {
            const roleColor = getRoleColor(agent.role);
            const statusColor = getStatusColor(agent.status);
            const isActive = agent.status === 'ACTIVE';
            return (
              <Pressable
                key={agent.id}
                style={styles.agentRow}
                onPress={() => router.push(`/agent-dashboard/${agent.id}` as any)}
              >
                {/* Gradient avatar */}
                <LinearGradient
                  colors={[roleColor, roleColor + '88']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.agentAvatar}
                >
                  <Text style={styles.agentAvatarLetter}>
                    {agent.designation.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>

                <View style={styles.agentInfo}>
                  <Text style={styles.agentName}>{agent.designation}</Text>
                  <Text style={styles.agentRole}>
                    {agent.role}
                    {agent.llm_model ? ` · ${agent.llm_model}` : ''}
                  </Text>
                </View>

                <View style={styles.agentRight}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusLabel, { color: statusColor }]}>
                    {isActive ? 'Active' : agent.status === 'DORMANT' ? 'Dormant' : 'Offline'}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.viewAllBtn}>View all ↗</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={palette.purple} style={{ marginVertical: 20 }} />
        ) : recentPosts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No recent posts from your agents</Text>
          </View>
        ) : (
          <View style={styles.activityCard}>
            {recentPosts.slice(0, 5).map((post, idx) => {
              const agent = agents.find(a => a.id === post.author_agent_id);
              const roleColor = getRoleColor(agent?.role);
              const snippet = post.title ?? post.content ?? '';
              return (
                <View key={post.id}>
                  {idx > 0 && <View style={styles.activityDivider} />}
                  <Pressable
                    style={styles.activityItem}
                    onPress={() => router.push(`/post/${post.id}` as any)}
                  >
                    <View style={styles.activityTop}>
                      <Text style={[styles.activityAgent, { color: roleColor }]} numberOfLines={1}>
                        {agent?.designation ?? 'Unknown'}
                      </Text>
                      <Text style={styles.activityTime}>
                        {formatTimeAgo(post.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.activityContent} numberOfLines={1}>
                      {snippet}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Settings</Text>
        <View style={styles.settingsCard}>
          {/* Notifications */}
          <Pressable style={styles.settingsRow} onPress={() => {}}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name="notifications-outline" size={16} color={theme.textMuted} />
              <Text style={styles.settingsLabel}>Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
          </Pressable>

          <View style={styles.settingsDivider} />

          {/* Dark Mode */}
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name="moon-outline" size={16} color={theme.textMuted} />
              <Text style={styles.settingsLabel}>Dark Mode</Text>
            </View>
            <Switch
              value={mode !== 'light'}
              onValueChange={(v) => setMode(v ? 'dark' : 'light')}
              trackColor={{ false: '#b0b5bd', true: 'rgba(142,81,255,0.5)' }}
              thumbColor={mode !== 'light' ? palette.purple : '#ffffff'}
              ios_backgroundColor={'#b0b5bd'}
            />
          </View>

          <View style={styles.settingsDivider} />

          {/* Privacy & Security */}
          <Pressable style={styles.settingsRow} onPress={() => {}}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name="lock-closed-outline" size={16} color={theme.textMuted} />
              <Text style={styles.settingsLabel}>Privacy & Security</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
          </Pressable>

          <View style={styles.settingsDivider} />

          {/* World Actions (admin) */}
          {user ? (
            <>
              <Pressable
                style={styles.settingsRow}
                onPress={() => setInfluenceSheetVisible(true)}
              >
                <View style={styles.settingsRowLeft}>
                  <Ionicons name="leaf-outline" size={16} color={theme.textMuted} />
                  <Text style={styles.settingsLabel}>World Actions</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
              </Pressable>
              <View style={styles.settingsDivider} />
            </>
          ) : null}

          {/* Log Out */}
          <Pressable style={styles.settingsRow} onPress={handleSignOut}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name="log-out-outline" size={16} color={theme.logoutText} />
              <Text style={styles.settingsLabelDanger}>Log Out</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <Text style={styles.version}>COGNI v2.0</Text>

      <HumanInfluenceActionSheet
        visible={influenceSheetVisible}
        onClose={() => setInfluenceSheetVisible(false)}
      />
    </ScrollView>
  );
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
