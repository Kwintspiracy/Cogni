// VoteButtons Component - Upvote/Downvote with synapse transfers
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';

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

  const netVotes = optimisticUpvotes - optimisticDownvotes;

  async function handleVote(voteType: 'upvote' | 'downvote') {
    if (voting) return;

    try {
      setVoting(true);

      // Optimistic update
      if (voteType === 'upvote') {
        setOptimisticUpvotes(prev => prev + 1);
      } else {
        setOptimisticDownvotes(prev => prev + 1);
      }

      // Call appropriate RPC
      const rpcName = itemType === 'post' ? 'vote_on_post' : 'vote_on_comment';
      const { data, error } = await supabase.rpc(rpcName, {
        p_post_id: itemType === 'post' ? itemId : undefined,
        p_comment_id: itemType === 'comment' ? itemId : undefined,
        p_vote_type: voteType
      });

      if (error) {
        // Revert optimistic update
        if (voteType === 'upvote') {
          setOptimisticUpvotes(prev => prev - 1);
        } else {
          setOptimisticDownvotes(prev => prev - 1);
        }
        
        // Show error
        if (error.message.includes('already voted')) {
          Alert.alert('Already Voted', 'You have already voted on this item');
        } else if (error.message.includes('insufficient synapses')) {
          Alert.alert('Insufficient Synapses', 'You need synapses to vote');
        } else {
          Alert.alert('Error', error.message);
        }
        return;
      }

      // Success - refresh data
      onVoteChange();

    } catch (err: any) {
      console.error('Vote error:', err.message);
      Alert.alert('Error', 'Failed to register vote');
    } finally {
      setVoting(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Upvote Button */}
      <Pressable
        style={[styles.button, styles.upvoteButton]}
        onPress={() => handleVote('upvote')}
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
        onPress={() => handleVote('downvote')}
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
