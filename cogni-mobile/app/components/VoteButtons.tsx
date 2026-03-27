// VoteButtons Component - Upvote/Downvote with synapse transfers
import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { useTheme } from '@/theme';

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
  const theme = useTheme();

  useEffect(() => {
    setOptimisticUpvotes(upvotes);
    setOptimisticDownvotes(downvotes);
  }, [upvotes, downvotes]);

  const netVotes = optimisticUpvotes - optimisticDownvotes;
  const isComment = itemType === 'comment';

  async function handleVote(direction: 1 | -1) {
    if (voting || !user) return;
    try {
      setVoting(true);
      if (direction === 1) {
        setOptimisticUpvotes(prev => prev + 1);
      } else {
        setOptimisticDownvotes(prev => prev + 1);
      }
      if (itemType === 'post') {
        const { error: rpcError } = await supabase.rpc('vote_on_post', {
          p_user_id: user.id,
          p_post_id: itemId,
          p_direction: direction,
        });
        if (rpcError) throw rpcError;
      } else {
        const { error: rpcError } = await supabase.rpc('vote_on_comment', {
          p_user_id: user.id,
          p_comment_id: itemId,
          p_direction: direction,
        });
        if (rpcError) throw rpcError;
      }
    } catch (err: any) {
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

  const pillHeight = isComment ? 32 : 36;
  const touchSize = isComment ? 32 : 36;
  const iconSize = isComment ? 16 : 18;

  const styles = useMemo(() => StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bgElevated,
      height: pillHeight,
      borderRadius: 9999,
      paddingHorizontal: 2,
    },
    touch: {
      width: touchSize,
      height: touchSize,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    voteCount: {
      color: theme.voteNeutral,
      fontSize: isComment ? 12 : 14,
      fontWeight: '600',
      textAlign: 'center',
      minWidth: isComment ? 18 : 20,
    },
    votePositive: {
      color: theme.votePositive,
    },
    voteNegative: {
      color: theme.voteNegative,
    },
  }), [theme, pillHeight, touchSize]);

  return (
    <View style={styles.pill}>
      <Pressable
        style={styles.touch}
        onPress={() => handleVote(1)}
        disabled={voting}
      >
        <Ionicons name="arrow-up" size={iconSize} color={theme.voteNeutral} />
      </Pressable>

      <Text style={[
        styles.voteCount,
        netVotes > 0 && styles.votePositive,
        netVotes < 0 && styles.voteNegative,
      ]}>
        {netVotes}
      </Text>

      <Pressable
        style={styles.touch}
        onPress={() => handleVote(-1)}
        disabled={voting}
      >
        <Ionicons name="arrow-down" size={iconSize} color={theme.voteNeutral} />
      </Pressable>
    </View>
  );
}
