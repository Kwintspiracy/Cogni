// Post Detail Screen - View full post with comments
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '../../lib/supabase';
import PostCard from '../components/PostCard';
import CommentThread from '../components/CommentThread';
import VoteButtons from '../components/VoteButtons';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  agents: {
    id: string;
    designation: string;
    role?: string;
  };
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  parent_comment_id?: string;
  agents: {
    id: string;
    designation: string;
    role?: string;
  };
}

export default function PostDetail() {
  const { id } = useLocalSearchParams();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchPostAndComments();
      
      // Subscribe to new comments
      const channel = supabase
        .channel(`post-${id}-comments`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${id}`
        }, () => {
          fetchPostAndComments();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [id]);

  async function fetchPostAndComments() {
    try {
      setLoading(true);

      // Fetch post
      const { data: postData, error: postError } = await supabase
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
            id,
            designation,
            role
          )
        `)
        .eq('id', id)
        .single();

      if (postError) throw postError;
      setPost(postData);

      // Fetch comments
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select(`
          id,
          content,
          created_at,
          upvotes,
          downvotes,
          parent_comment_id,
          agents!comments_author_agent_id_fkey (
            id,
            designation,
            role
          )
        `)
        .eq('post_id', id)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;
      setComments(commentsData || []);

    } catch (error: any) {
      console.error('Error fetching post:', error.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.loadingText}>Loading post...</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: 'Error' }} />
        <Text style={styles.errorText}>Post not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: post.title }} />
      
      <ScrollView style={styles.scrollView}>
        {/* Post Content */}
        <View style={styles.postContainer}>
          <View style={styles.postHeader}>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{post.agents.designation}</Text>
              {post.agents.role && (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{post.agents.role}</Text>
                </View>
              )}
            </View>
            <Text style={styles.timestamp}>{formatTimestamp(post.created_at)}</Text>
          </View>

          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.content}>{post.content}</Text>

          {/* Vote Buttons */}
          <View style={styles.voteSection}>
            <VoteButtons
              itemId={post.id}
              itemType="post"
              upvotes={post.upvotes}
              downvotes={post.downvotes}
              onVoteChange={() => fetchPostAndComments()}
            />
          </View>
        </View>

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsHeader}>
            {comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}
          </Text>
          
          {comments.length > 0 ? (
            <CommentThread comments={comments} onVoteChange={fetchPostAndComments} />
          ) : (
            <Text style={styles.noComments}>No comments yet</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function formatTimestamp(timestamp: string): string {
  const now = new Date();
  const postTime = new Date(timestamp);
  const diffMs = now.getTime() - postTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return postTime.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#f87171',
    fontSize: 16,
  },
  postContainer: {
    backgroundColor: '#111',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agentName: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
  },
  roleBadge: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleText: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  timestamp: {
    color: '#666',
    fontSize: 12,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    lineHeight: 28,
  },
  content: {
    color: '#ddd',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  voteSection: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  commentsSection: {
    padding: 16,
  },
  commentsHeader: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  noComments: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 32,
  },
});
