// VoteButtons Component - Upvote/Downvote with synapse transfers
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

interface VoteButtonsProps {
  itemId: string;
  itemType: 'post' | 'comment';
  upvotes: number;
  downvotes: number;
  onVoteChange: () => void;
}

export default function VoteButtons({
  itemId,
  itemType,
  upvotes,
  downvotes,
  onVoteChange
}: VoteButtonsProps) {
  const [voting, setVoting] = useState(false);
  const [optimisticUpvotes, setOptimisticUpvotes] = useState(upvotes);
  const [optimisticDownvotes, setOptimisticDownvotes] = useState(downvotes);
  const user = useAuthStore((s) => s.user);

  // Sync optimistic state when props change (e.g. from realtime updates)
  useEffect(() => {
    setOptimisticUpvotes(upvotes);
    setOptimisticDownvotes(downvotes);
  }, [upvotes, downvotes]);

  const netVotes = optimisticUpvotes - optimisticDownvotes;

  async function handleVote(direction: 1 | -1) {
    if (voting || !user) return;

    try {
      setVoting(true);

      // Optimistic update
      if (direction === 1) {
        setOptimisticUpvotes(prev => prev + 1);
      } else {
        setOptimisticDownvotes(prev => prev + 1);
      }

      // Call appropriate RPC with correct parameter names
      if (itemType === 'post') {
        const { data, error: rpcError } = await supabase.rpc('vote_on_post', {
          p_user_id: user.id,
          p_post_id: itemId,
          p_direction: direction,
        });
        if (rpcError) throw rpcError;
      } else {
        const { data, error: rpcError } = await supabase.rpc('vote_on_comment', {
          p_user_id: user.id,
          p_comment_id: itemId,
          p_direction: direction,
        });
        if (rpcError) throw rpcError;
      }

    } catch (err: any) {
      // Revert optimistic update
      if (direction === 1) {
        setOptimisticUpvotes(prev => prev - 1);
      } else {
        setOptimisticDownvotes(prev => prev - 1);
      }
      const msg = err?.message ?? '';
      if (msg.includes('already voted')) {
        Alert.alert('Already Voted', 'You have already voted on this item');
      } else if (msg.includes('insufficient synapses')) {
        Alert.alert('Insufficient Synapses', 'You need synapses to vote');
      } else {
        Alert.alert('Error', msg || 'Failed to register vote');
      }
    } finally {
      setVoting(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Upvote Button */}
      <Pressable
        style={[styles.button, styles.upvoteButton]}
        onPress={() => handleVote(1)}
        disabled={voting}
      >
        <Text style={styles.arrow}>▲</Text>
      </Pressable>

      {/* Vote Count */}
      <Text style={[
        styles.voteCount,
        netVotes > 0 && styles.votePositive,
        netVotes < 0 && styles.voteNegative
      ]}>
        {netVotes > 0 ? '+' : ''}{netVotes}
      </Text>

      {/* Downvote Button */}
      <Pressable
        style={[styles.button, styles.downvoteButton]}
        onPress={() => handleVote(-1)}
        disabled={voting}
      >
        <Text style={styles.arrow}>▼</Text>
      </Pressable>

      {/* Synapse Cost Indicator */}
      <Text style={styles.costIndicator}>
        {itemType === 'post' ? '10⚡' : '5⚡'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  upvoteButton: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  downvoteButton: {
    borderColor: '#f87171',
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
  },
  arrow: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  voteCount: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  votePositive: {
    color: '#4ade80',
  },
  voteNegative: {
    color: '#f87171',
  },
  costIndicator: {
    color: '#666',
    fontSize: 11,
    marginLeft: 4,
  },
});
