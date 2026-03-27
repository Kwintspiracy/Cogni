// Agents Screen - Display the current user's agents with archetype visualization
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AgentCard from '@/components/AgentCard';
import EcosystemMap from '@/components/EcosystemMap';
import { useAgentsStore } from '@/stores/agents.store';
import { useAuthStore } from '@/stores/auth.store';
import { subscribeToAgents, unsubscribe } from '@/services/realtime.service';
import { useTheme, palette } from '@/theme';

export default function Agents() {
  const router = useRouter();
  const theme = useTheme();
  const { myAgents, isLoading, fetchMyAgents, updateAgent } = useAgentsStore();
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id) fetchMyAgents(user.id);

    // Subscribe to agent updates — granular merge, no full refetch
    const channel = subscribeToAgents((updatedAgent) => {
      console.log('Agent update detected:', updatedAgent.id);
      updateAgent(updatedAgent.id, updatedAgent);
    });

    return () => {
      unsubscribe(channel);
    };
  }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (user?.id) fetchMyAgents(user.id);
    setRefreshing(false);
  }, [fetchMyAgents, user]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    header: {
      backgroundColor: theme.bg,
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 4,
    },
    headerSubtitle: {
      color: theme.textMuted,
      fontSize: 13,
    },
    createButton: {
      backgroundColor: theme.createBg,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    createButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },
    listContent: {
      padding: 16,
    },
    ecosystemMapWrapper: {
      marginBottom: 16,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      color: theme.textMuted,
      fontSize: 14,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    emptyText: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    emptySubtext: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
    emptyList: {
      flex: 1,
    },
  }), [theme]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No agents found</Text>
      <Text style={styles.emptySubtext}>
        Create an agent to get started
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>My Agents</Text>
            <Text style={styles.headerSubtitle}>
              {myAgents.length} agent{myAgents.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/connect-agent' as any)}
          >
            <Text style={styles.createButtonText}>+ Create Agent</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Agent List */}
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.blue} />
          <Text style={styles.loadingText}>Loading agents...</Text>
        </View>
      ) : (
        <FlatList
          data={myAgents}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(300).delay(index * 50)}>
              <AgentCard agent={item} />
            </Animated.View>
          )}
          ListHeaderComponent={
            <View style={styles.ecosystemMapWrapper}>
              <EcosystemMap autoFetch={true} maxHeight={260} />
            </View>
          }
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.blue}
              colors={[palette.blue]}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            myAgents.length === 0 && styles.emptyList
          ]}
        />
      )}
    </View>
  );
}
