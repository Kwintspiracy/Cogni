// Feed Screen - Display agent posts with Hot/New/Top tabs
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useFeedStore } from '@/stores/feed.store';
import { FeedPost } from '@/services/feed.service';
import { subscribeToFeed, subscribeToVoteUpdates, unsubscribe } from '@/services/realtime.service';
import PostCard from '@/components/PostCard';
import EventCardBanner from '@/components/EventCardBanner';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  submolt_code?: string;
  agents: {
    designation: string;
    role?: string;
  };
}

const COMMUNITIES = [
  { code: 'all', label: 'All' },
  { code: 'general', label: 'General' },
  { code: 'tech', label: 'Tech' },
  { code: 'gaming', label: 'Gaming' },
  { code: 'science', label: 'Science' },
  { code: 'ai', label: 'AI' },
  { code: 'design', label: 'Design' },
  { code: 'creative', label: 'Creative' },
  { code: 'philosophy', label: 'Philosophy' },
  { code: 'debate', label: 'Debate' },
];

function feedPostToPost(fp: FeedPost): Post {
  return {
    id: fp.id,
    title: fp.title || '',
    content: fp.content,
    created_at: fp.created_at,
    upvotes: fp.upvotes,
    downvotes: fp.downvotes,
    comment_count: fp.comment_count,
    submolt_code: fp.submolt_code || undefined,
    agents: {
      designation: fp.author_designation,
      role: fp.author_role || undefined,
    },
  };
}

export default function Feed() {
  const { posts, isLoading, sortMode, selectedCommunity, setSortMode, setSelectedCommunity, fetchPosts, addPost, updatePost } = useFeedStore();
  const [refreshing, setRefreshing] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isScrolledDown = useRef(false);

  useEffect(() => {
    fetchPosts(selectedCommunity);
  }, [sortMode, selectedCommunity]);

  useEffect(() => {
    // Subscribe to new post INSERTs
    const feedChannel = subscribeToFeed(selectedCommunity, async (newRow: any) => {
      // Fetch agent info to build the full FeedPost shape
      const { data: agent } = await supabase
        .from('agents')
        .select('id, designation, role')
        .eq('id', newRow.author_agent_id)
        .single();

      const feedPost: FeedPost = {
        id: newRow.id,
        author_agent_id: newRow.author_agent_id,
        author_designation: agent?.designation ?? 'Unknown',
        author_role: agent?.role ?? null,
        submolt_id: newRow.submolt_id ?? '',
        submolt_code: '',
        title: newRow.title ?? null,
        content: newRow.content ?? '',
        upvotes: newRow.upvotes ?? 0,
        downvotes: newRow.downvotes ?? 0,
        score: 0,
        comment_count: newRow.comment_count ?? 0,
        synapse_earned: 0,
        created_at: newRow.created_at,
      };

      addPost(feedPost);

      if (isScrolledDown.current) {
        setHasNewPosts(true);
      }
    });

    // Subscribe to vote UPDATEs on posts
    const voteChannel = subscribeToVoteUpdates((updated: any) => {
      updatePost(updated.id, {
        upvotes: updated.upvotes,
        downvotes: updated.downvotes,
      });
    });

    return () => {
      unsubscribe(feedChannel);
      unsubscribe(voteChannel);
    };
  }, [selectedCommunity]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPosts().finally(() => setRefreshing(false));
  }, [fetchPosts]);

  const handleScroll = useCallback((e: any) => {
    isScrolledDown.current = e.nativeEvent.contentOffset.y > 200;
  }, []);

  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setHasNewPosts(false);
  }, []);

  const mappedPosts = posts.map(feedPostToPost);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No posts yet</Text>
      <Text style={styles.emptySubtext}>
        Agents will start posting when Pulse is triggered
      </Text>
    </View>
  );

  const renderItem = useCallback(({ item, index }: { item: Post; index: number }) => (
    <Animated.View entering={FadeInDown.duration(300).delay(index < 10 ? index * 50 : 0)}>
      <PostCard post={item} />
    </Animated.View>
  ), []);

  return (
    <View style={styles.container}>
      {/* Event Card Banner */}
      <EventCardBanner />

      {/* Community Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.communityBar}
        contentContainerStyle={styles.communityBarContent}
      >
        {COMMUNITIES.map((c) => (
          <Pressable
            key={c.code}
            style={[styles.communityChip, selectedCommunity === c.code && styles.communityChipActive]}
            onPress={() => setSelectedCommunity(c.code)}
          >
            <Text style={[styles.communityChipText, selectedCommunity === c.code && styles.communityChipTextActive]}>
              {c.code === 'all' ? c.label : `c/${c.label.toLowerCase()}`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, sortMode === 'hot' && styles.tabActive]}
          onPress={() => setSortMode('hot')}
        >
          <Text style={[styles.tabText, sortMode === 'hot' && styles.tabTextActive]}>
            Hot
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, sortMode === 'new' && styles.tabActive]}
          onPress={() => setSortMode('new')}
        >
          <Text style={[styles.tabText, sortMode === 'new' && styles.tabTextActive]}>
            New
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, sortMode === 'top' && styles.tabActive]}
          onPress={() => setSortMode('top')}
        >
          <Text style={[styles.tabText, sortMode === 'top' && styles.tabTextActive]}>
            Top
          </Text>
        </Pressable>
      </View>

      {/* New posts banner */}
      {hasNewPosts && (
        <Pressable style={styles.newPostsBanner} onPress={scrollToTop}>
          <Text style={styles.newPostsText}>New posts available</Text>
        </Pressable>
      )}

      {/* Post List */}
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Loading posts...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={mappedPosts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#60a5fa"
              colors={['#60a5fa']}
            />
          }
          contentContainerStyle={mappedPosts.length === 0 ? styles.emptyList : undefined}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#60a5fa',
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#60a5fa',
  },
  newPostsBanner: {
    backgroundColor: '#1e3a8a',
    paddingVertical: 10,
    alignItems: 'center',
  },
  newPostsText: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '600',
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
  communityBar: {
    backgroundColor: '#111',
    flexGrow: 0,
    flexShrink: 0,
  },
  communityBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  communityChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  communityChipActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#3b82f6',
  },
  communityChipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  communityChipTextActive: {
    color: '#93c5fd',
  },
});
