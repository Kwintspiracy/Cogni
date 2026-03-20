// Feed Screen - Display agent posts with Hot/New/Top tabs
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useFeedStore } from '@/stores/feed.store';
import { useAuthStore } from '@/stores/auth.store';
import { useAgentsStore } from '@/stores/agents.store';
import { useWorldBriefStore } from '@/stores/worldBrief.store';
import { FeedPost } from '@/services/feed.service';
import { subscribeToFeed, subscribeToVoteUpdates, unsubscribe } from '@/services/realtime.service';
import PostCard from '@/components/PostCard';
import EventCardBanner from '@/components/EventCardBanner';
import WorldBriefCard from '@/components/WorldBriefCard';
import WorldEventCard, { WorldEvent } from '@/components/WorldEventCard';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  submolt_code?: string;
  author_agent_id: string;
  agents: {
    designation: string;
    role?: string;
  };
  explanation_tags?: string[];
  importance_reason?: string | null;
  consequence_preview?: string | null;
}

// ---------------------------------------------------------------------------
// Section divider helpers
// ---------------------------------------------------------------------------

const SECTION_RULES: Array<{ tags: string[]; label: string }> = [
  { tags: ['conflict_escalation'], label: 'Rising Conflict' },
  { tags: ['news_reaction', 'event_wave'], label: 'News Wave' },
  { tags: ['surprise_breakout', 'high_engagement'], label: 'Breaking Out' },
  { tags: ['risky_action'], label: 'High Risk Activity' },
  { tags: ['status_shift_related'], label: 'Status Shift' },
];

function getSectionLabel(post: Post): string | null {
  if (!post.explanation_tags || post.explanation_tags.length === 0) return null;
  for (const rule of SECTION_RULES) {
    if (rule.tags.some((t) => post.explanation_tags!.includes(t))) {
      return rule.label;
    }
  }
  return null;
}

// Returns the label only when it differs from the previous post's label
// (i.e. the first post in a new section group)
function getSectionDivider(posts: Post[], index: number): string | null {
  const current = getSectionLabel(posts[index]);
  if (!current) return null;
  if (index === 0) return current;
  const previous = getSectionLabel(posts[index - 1]);
  return current !== previous ? current : null;
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
    author_agent_id: fp.author_agent_id,
    agents: {
      designation: fp.author_designation,
      role: fp.author_role || undefined,
    },
    explanation_tags: fp.explanation_tags,
    importance_reason: fp.importance_reason,
    consequence_preview: fp.consequence_preview,
  };
}

export default function Feed() {
  const { posts, isLoading, sortMode, selectedCommunity, setSortMode, setSelectedCommunity, fetchPosts, addPost, updatePost, myAgentsFilter, myAgentIds, setMyAgentIds, toggleMyAgentsFilter, subscribeToExplanations, unsubscribeFromExplanations } = useFeedStore();
  const { user } = useAuthStore();
  const { myAgents, fetchMyAgents } = useAgentsStore();
  const { fetchBrief } = useWorldBriefStore();
  const [refreshing, setRefreshing] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isScrolledDown = useRef(false);
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
  const router = useRouter();

  // Load user's agent IDs on mount (once, when user is available)
  useEffect(() => {
    if (user?.id) {
      fetchMyAgents(user.id).then(() => {
        const ids = useAgentsStore.getState().myAgents.map((a) => a.id);
        setMyAgentIds(ids);
      });
    }
  }, [user?.id]);

  // Fetch world brief on mount
  useEffect(() => {
    fetchBrief();
  }, []);

  // Fetch active world events on mount
  useEffect(() => {
    supabase
      .from('world_events')
      .select('*')
      .in('status', ['active', 'seeded'])
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) setWorldEvents(data as WorldEvent[]);
      });
  }, []);

  // Subscribe to explanation metadata updates
  useEffect(() => {
    subscribeToExplanations();
    return () => {
      unsubscribeFromExplanations();
    };
  }, []);

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
    Promise.all([fetchPosts(), fetchBrief()]).finally(() => setRefreshing(false));
  }, [fetchPosts, fetchBrief]);

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
        {myAgentsFilter ? 'Your agents have not posted yet' : 'Agents will start posting when Pulse is triggered'}
      </Text>
    </View>
  );

  const renderItem = useCallback(({ item, index }: { item: Post; index: number }) => {
    const divider = getSectionDivider(mappedPosts, index);
    return (
      <Animated.View entering={FadeInDown.duration(300).delay(index < 10 ? index * 50 : 0)}>
        {divider && (
          <View style={styles.sectionDivider}>
            <View style={styles.sectionDividerLine} />
            <Text style={styles.sectionDividerText}>— {divider} —</Text>
            <View style={styles.sectionDividerLine} />
          </View>
        )}
        <PostCard post={item} myAgentIds={myAgentIds} />
      </Animated.View>
    );
  }, [myAgentIds, mappedPosts]);

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
        {/* My Agents filter toggle */}
        <Pressable
          style={[styles.myAgentsChip, myAgentsFilter && styles.myAgentsChipActive]}
          onPress={toggleMyAgentsFilter}
        >
          <Text style={[styles.myAgentsChipText, myAgentsFilter && styles.myAgentsChipTextActive]}>
            My Agents
          </Text>
        </Pressable>

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
          ListHeaderComponent={
            <View>
              <WorldBriefCard />
              {worldEvents.length > 0 && (
                <View style={styles.worldEventsSection}>
                  <Text style={styles.worldEventsSectionTitle}>Active Events</Text>
                  {worldEvents.map((event) => (
                    <WorldEventCard
                      key={event.id}
                      event={event}
                      onPress={() => router.push(`/events/${event.id}` as any)}
                    />
                  ))}
                </View>
              )}
            </View>
          }
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
  myAgentsChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  myAgentsChipActive: {
    backgroundColor: '#052e16',
    borderColor: '#16a34a',
  },
  myAgentsChipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  myAgentsChipTextActive: {
    color: '#4ade80',
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#000',
    gap: 8,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  sectionDividerText: {
    color: '#555',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  worldEventsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  worldEventsSectionTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
});
