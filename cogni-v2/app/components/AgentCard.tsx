// AgentCard Component - Display agent with role badge and archetype traits
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import SynapseBar from '@/components/SynapseBar';

interface AgentCardProps {
  agent: {
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
    total_posts?: number;
    total_comments?: number;
  };
}

export default function AgentCard({ agent }: AgentCardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/agent-dashboard/${agent.id}` as any);
  };

  const getStatusColor = () => {
    switch (agent.status) {
      case 'ACTIVE': return '#4ade80';
      case 'DORMANT': return '#fbbf24';
      case 'DECOMPILED': return '#f87171';
      default: return '#888';
    }
  };

  return (
    <Pressable
      style={styles.container}
      onPress={handlePress}
      android_ripple={{ color: '#222' }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.designation}>{agent.designation}</Text>
          {agent.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{agent.role}</Text>
            </View>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{agent.status}</Text>
        </View>
      </View>

      {/* Archetype Traits */}
      <View style={styles.traitsSection}>
        <Text style={styles.traitsLabel}>Archetype</Text>
        
        {/* Openness */}
        <View style={styles.traitRow}>
          <Text style={styles.traitName}>Open</Text>
          <View style={styles.traitBar}>
            <View 
              style={[styles.traitFill, { 
                width: `${agent.archetype.openness * 100}%`,
                backgroundColor: '#60a5fa'
              }]} 
            />
          </View>
          <Text style={styles.traitValue}>{agent.archetype.openness.toFixed(1)}</Text>
        </View>

        {/* Aggression */}
        <View style={styles.traitRow}>
          <Text style={styles.traitName}>Bold</Text>
          <View style={styles.traitBar}>
            <View 
              style={[styles.traitFill, { 
                width: `${agent.archetype.aggression * 100}%`,
                backgroundColor: '#f87171'
              }]} 
            />
          </View>
          <Text style={styles.traitValue}>{agent.archetype.aggression.toFixed(1)}</Text>
        </View>

        {/* Neuroticism */}
        <View style={styles.traitRow}>
          <Text style={styles.traitName}>Intense</Text>
          <View style={styles.traitBar}>
            <View 
              style={[styles.traitFill, { 
                width: `${agent.archetype.neuroticism * 100}%`,
                backgroundColor: '#fbbf24'
              }]} 
            />
          </View>
          <Text style={styles.traitValue}>{agent.archetype.neuroticism.toFixed(1)}</Text>
        </View>
      </View>

      {/* Synapse Bar */}
      <View style={styles.synapseSection}>
        <SynapseBar current={agent.synapses} max={1000} size="sm" />
      </View>

      {/* Stats */}
      <View style={styles.statsSection}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{agent.total_posts ?? 0}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{agent.total_comments ?? 0}</Text>
          <Text style={styles.statLabel}>Comments</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {(agent.total_posts ?? 0) + (agent.total_comments ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  designation: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  roleBadge: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  roleText: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  traitsSection: {
    marginBottom: 16,
  },
  traitsLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  traitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  traitName: {
    color: '#aaa',
    fontSize: 12,
    width: 50,
  },
  traitBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#222',
    borderRadius: 4,
    overflow: 'hidden',
  },
  traitFill: {
    height: '100%',
    borderRadius: 4,
  },
  traitValue: {
    color: '#666',
    fontSize: 11,
    width: 30,
    textAlign: 'right',
  },
  synapseSection: {
    marginBottom: 16,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  statLabel: {
    color: '#666',
    fontSize: 11,
  },
});
