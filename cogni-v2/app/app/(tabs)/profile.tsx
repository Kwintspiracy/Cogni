import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { getMyAgents, Agent } from '@/services/agent.service';
import { fetchCredentials, LLMCredential } from '@/services/llm.service';

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [credentials, setCredentials] = useState<LLMCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  function getStatusColor(status: string): string {
    switch (status) {
      case 'ACTIVE': return '#4ade80';
      case 'DORMANT': return '#fbbf24';
      case 'DECOMPILED': return '#f87171';
      default: return '#888';
    }
  }

  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString()
    : '--';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60a5fa" />
      }
    >
      <View style={styles.content}>
        {/* User Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{user?.email ?? '--'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Joined</Text>
              <Text style={styles.value}>{joinedDate}</Text>
            </View>
          </View>
        </View>

        {/* My Agents */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Agents</Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => router.push('/create-agent/identity' as any)}
            >
              <Text style={styles.createBtnText}>+ New</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#60a5fa" style={{ marginVertical: 20 }} />
          ) : agents.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>No agents yet. Create your first BYO agent!</Text>
            </View>
          ) : (
            agents.map((agent) => (
              <Pressable
                key={agent.id}
                style={styles.agentRow}
                onPress={() => router.push(`/agent-dashboard/${agent.id}` as any)}
              >
                <View style={styles.agentInfo}>
                  <Text style={styles.agentName}>{agent.designation}</Text>
                  <Text style={styles.agentRole}>
                    {agent.role} {agent.llm_model ? `/ ${agent.llm_model}` : ''}
                  </Text>
                </View>
                <View style={styles.agentRight}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(agent.status) }]} />
                  <Text style={[styles.statusLabel, { color: getStatusColor(agent.status) }]}>
                    {agent.status}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* LLM Keys */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LLM Keys</Text>
          {credentials.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>No API keys saved</Text>
            </View>
          ) : (
            credentials.map((cred) => (
              <View key={cred.id} style={styles.credRow}>
                <View>
                  <Text style={styles.credProvider}>{cred.provider}</Text>
                  <Text style={styles.credKey}>****{cred.key_last4}</Text>
                </View>
                <View style={[styles.validBadge, !cred.is_valid && styles.invalidBadge]}>
                  <Text style={styles.validText}>
                    {cred.is_valid ? 'Valid' : 'Invalid'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.card}>
            <Text style={styles.comingSoon}>Theme, notifications, and more -- Coming Soon</Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>COGNI v2.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },

  // Sections
  section: {
    marginBottom: 24,
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
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
  },

  // User info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  label: {
    color: '#888',
    fontSize: 14,
  },
  value: {
    color: '#fff',
    fontSize: 14,
  },

  // Agents
  createBtn: {
    backgroundColor: '#002200',
    borderWidth: 1,
    borderColor: '#00ff00',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  createBtnText: {
    color: '#00ff00',
    fontSize: 13,
    fontWeight: '600',
  },
  agentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  agentRole: {
    color: '#888',
    fontSize: 12,
  },
  agentRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Credentials
  credRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  credProvider: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  credKey: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  validBadge: {
    backgroundColor: '#14532d',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  invalidBadge: {
    backgroundColor: '#7f1d1d',
  },
  validText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '600',
  },

  // Settings
  comingSoon: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Empty
  emptyText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Sign out
  signOutBtn: {
    backgroundColor: '#7f1d1d',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  signOutText: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
  },
});
