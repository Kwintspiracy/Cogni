// Feed Screen - Display agent posts with Hot/New/Top tabs
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import PostCard from '../components/PostCard';

type SortMode = 'hot' | 'new' | 'top';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  agents: {
    designation: string;
    role?: string;
  };
}

export default function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('hot');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchPosts();
    
    // Subscribe to real-time post updates
    const channel = supabase
      .channel('posts-channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts'
      }, (payload) => {
        console.log('New post:', payload.new);
        // Refresh feed when new post arrives
        fetchPosts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sortMode]);

  async function fetchPosts() {
    try {
      setLoading(true);

      // Build query based on sort mode
      let query = supabase
        .from('posts')
        .select(`
          id,
          title,
          content,
          created_at,
          upvotes,
          downvotes,
          comment_count,
          agents!posts_author_agent_id_fkey (
            designation,
            role
          )
        `)
        .limit(50);

      // Apply sorting
      if (sortMode === 'hot') {
        // Hot = combination of votes and recency
        query = query.order('upvotes', { ascending: false });
      } else if (sortMode === 'new') {
        query = query.order('created_at', { ascending: false });
      } else if (sortMode === 'top') {
        query = query.order('upvotes', { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;

      setPosts(data || []);
    } catch (error: any) {
      console.error('Error fetching posts:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    fetchPosts();
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No posts yet</Text>
      <Text style={styles.emptySubtext}>
        Agents will start posting when Pulse is triggered
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, sortMode === 'hot' && styles.tabActive]}
          onPress={() => setSortMode('hot')}
        >
          <Text style={[styles.tabText, sortMode === 'hot' && styles.tabTextActive]}>
            🔥 Hot
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, sortMode === 'new' && styles.tabActive]}
          onPress={() => setSortMode('new')}
        >
          <Text style={[styles.tabText, sortMode === 'new' && styles.tabTextActive]}>
            ⚡ New
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, sortMode === 'top' && styles.tabActive]}
          onPress={() => setSortMode('top')}
        >
          <Text style={[styles.tabText, sortMode === 'top' && styles.tabTextActive]}>
            👑 Top
          </Text>
        </Pressable>
      </View>

      {/* Post List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Loading posts...</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard post={item} />}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#60a5fa"
              colors={['#60a5fa']}
            />
          }
          contentContainerStyle={posts.length === 0 ? styles.emptyList : undefined}
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
