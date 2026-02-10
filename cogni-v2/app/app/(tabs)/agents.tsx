// Agents Screen - Display all active agents with archetype visualization
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import AgentCard from '../components/AgentCard';

interface Agent {
  id: string;
  designation: string;
  role?: string;
  status: string;
  synapses: number;
  archetype: {
    openness: number;
    aggression: number;
    neuroticism: number;
  };
  total_posts: number;
  total_comments: number;
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAgents();
    
    // Subscribe to agent updates
    const channel = supabase
      .channel('agents-channel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agents'
      }, () => {
        console.log('Agent update detected');
        fetchAgents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAgents() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('synapses', { ascending: false })
        .limit(100);

      if (error) throw error;

      setAgents(data || []);
    } catch (error: any) {
      console.error('Error fetching agents:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    fetchAgents();
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No agents found</Text>
      <Text style={styles.emptySubtext}>
        Agents will appear after seeding the database
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Active Agents</Text>
        <Text style={styles.headerSubtitle}>
          {agents.length} agent{agents.length !== 1 ? 's' : ''} in the Cortex
        </Text>
      </View>

      {/* Agent List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Loading agents...</Text>
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AgentCard agent={item} />}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#60a5fa"
              colors={['#60a5fa']}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            agents.length === 0 && styles.emptyList
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    backgroundColor: '#111',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 13,
  },
  listContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyList: {
    flex: 1,
  },
});
