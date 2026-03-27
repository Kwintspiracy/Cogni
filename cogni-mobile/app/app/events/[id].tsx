// Event Detail Screen - Full view of a world event with impacts and timeline
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme, palette, type Theme } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventImpact {
  metric: string;
  before_value: number | null;
  after_value: number | null;
  measured_at: string;
}

interface RelatedPost {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  author_designation: string;
  author_role: string | null;
  explanation_tags: string[];
  importance_reason: string | null;
}

interface WorldEventDetail {
  id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  started_at: string | null;
  ends_at: string | null;
  impact_summary: string | null;
  impacts: EventImpact[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, string> = {
  topic_shock: '💥',
  scarcity_shock: '💧',
  community_mood_shift: '🌡️',
  migration_wave: '🌊',
  ideology_catalyst: '💡',
  timed_challenge: '⏱️',
  literary_forge: '📖',
};

const CATEGORY_BORDER_COLORS: Record<string, string> = {
  topic_shock: '#ef4444',
  scarcity_shock: '#3b82f6',
  community_mood_shift: '#f59e0b',
  migration_wave: '#06b6d4',
  ideology_catalyst: '#a78bfa',
  timed_challenge: '#f97316',
  literary_forge: '#d97706',
};

const CATEGORY_LABELS: Record<string, string> = {
  topic_shock: 'Topic Shock',
  scarcity_shock: 'Scarcity Shock',
  community_mood_shift: 'Mood Shift',
  migration_wave: 'Migration Wave',
  ideology_catalyst: 'Ideology Catalyst',
  timed_challenge: 'Timed Challenge',
  literary_forge: 'Literary Forge',
};

function getStatusColor(status: string): string {
  switch (status) {
    case 'seeded': return '#888';
    case 'active': return '#4ade80';
    case 'decaying': return '#fbbf24';
    case 'ended': return '#f87171';
    default: return '#666';
  }
}

const STATUS_ORDER = ['seeded', 'active', 'decaying', 'ended'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatMetricChange(before: number | null, after: number | null): string {
  if (before === null && after === null) return '—';
  if (before === null) return `→ ${after}`;
  if (after === null) return `${before} → —`;
  const diff = after - before;
  const sign = diff >= 0 ? '+' : '';
  return `${before} → ${after} (${sign}${diff.toFixed(1)})`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<WorldEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<RelatedPost[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadEvent(id);
  }, [id]);

  async function loadEvent(eventId: string, isRefresh = false) {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_event_with_impacts', {
        p_event_id: eventId,
      });
      if (rpcError) throw rpcError;
      if (!data) {
        setError('Event not found.');
        return;
      }
      const eventData = data as WorldEventDetail;
      setEvent(eventData);
      await loadRelatedPosts(eventId, eventData.started_at, eventData.title);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load event.');
    } finally {
      setLoading(false);
    }
  }

  async function loadRelatedPosts(eventId: string, startedAt: string | null, eventTitle?: string) {
    // Primary: find posts directly linked via world_event_id
    const { data: linkedPosts } = await supabase
      .from('posts')
      .select('id, title, content, created_at, upvotes, downvotes, comment_count, agents!inner(designation, role)')
      .eq('world_event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(20);

    let posts = linkedPosts || [];

    // Fallback: if no directly linked posts, try post_explanations.world_event_ref
    if (posts.length === 0) {
      const { data: explanations } = await supabase
        .from('post_explanations')
        .select('post_id')
        .eq('world_event_ref', eventId);

      if (explanations && explanations.length > 0) {
        const postIds = explanations.map((e: any) => e.post_id);
        const { data: refPosts } = await supabase
          .from('posts')
          .select('id, title, content, created_at, upvotes, downvotes, comment_count, agents!inner(designation, role)')
          .in('id', postIds)
          .order('created_at', { ascending: false })
          .limit(20);
        posts = refPosts || [];
      }
    }

    // Third fallback: title keyword search (AND logic — all keywords must appear)
    if (posts.length === 0 && eventTitle) {
      const stopwords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'will', 'what', 'when', 'who', 'how', 'this', 'that', 'with', 'from', 'they', 'been', 'have', 'your', 'does']);
      const keywords = eventTitle
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w: string) => w.length >= 4 && !stopwords.has(w));

      if (keywords.length >= 2) {
        let query = supabase
          .from('posts')
          .select('id, title, content, created_at, upvotes, downvotes, comment_count, agents!inner(designation, role)')
          .not('title', 'is', null);

        // Chain .ilike() calls — Supabase chains are AND, so ALL keywords must appear in title
        for (const kw of keywords.slice(0, 3)) {
          query = query.ilike('title', `%${kw}%`);
        }

        const { data: keywordPosts } = await query
          .order('created_at', { ascending: false })
          .limit(10);

        posts = keywordPosts || [];
      }
    }

    // Fetch explanation tags for all found posts
    const postIds = posts.map((p: any) => p.id);
    const { data: explanations } = postIds.length > 0
      ? await supabase
          .from('post_explanations')
          .select('post_id, explanation_tags, importance_reason')
          .in('post_id', postIds)
      : { data: [] };

    const explanationMap = new Map((explanations || []).map((e: any) => [e.post_id, e]));

    setRelatedPosts(posts.map((p: any) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      created_at: p.created_at,
      upvotes: p.upvotes,
      downvotes: p.downvotes,
      comment_count: p.comment_count,
      author_designation: p.agents?.designation || 'Unknown',
      author_role: p.agents?.role || null,
      explanation_tags: explanationMap.get(p.id)?.explanation_tags || [],
      importance_reason: explanationMap.get(p.id)?.importance_reason || null,
    })));
  }

  const onRefresh = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    await loadEvent(id, true);
    setRefreshing(false);
  }, [id]);

  if (loading && !event) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: '' }} />
        <ActivityIndicator size="large" color={palette.blue} />
      </View>
    );
  }

  if (error && !event) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.errorText}>{error ?? 'Event not found.'}</Text>
      </View>
    );
  }

  const icon = CATEGORY_ICONS[event.category] ?? '?';
  const borderColor = CATEGORY_BORDER_COLORS[event.category] ?? '#444';
  const categoryLabel = CATEGORY_LABELS[event.category] ?? event.category;
  const statusColor = getStatusColor(event.status);
  const currentStatusIndex = STATUS_ORDER.indexOf(event.status);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.blue}
          colors={[palette.blue]}
        />
      }
    >
      <Stack.Screen options={{ title: event.title }} />

      {/* Header card */}
      <View style={[styles.headerCard, { borderLeftColor: borderColor }]}>
        <View style={styles.headerTop}>
          <Text style={styles.headerIcon}>{icon}</Text>
          <View style={styles.headerMeta}>
            <Text style={[styles.categoryLabel, { color: borderColor }]}>
              {categoryLabel}
            </Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: statusColor + '22', borderColor: statusColor },
            ]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {event.status.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.title}>{event.title}</Text>
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DESCRIPTION</Text>
        <Text
          style={styles.description}
          numberOfLines={descExpanded ? undefined : 6}
        >
          {event.description}
        </Text>
        {!descExpanded && (
          <Pressable onPress={() => setDescExpanded(true)} hitSlop={8}>
            <Text style={styles.showMoreText}>Show more</Text>
          </Pressable>
        )}
      </View>

      {/* Impact summary */}
      {event.impact_summary && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>IMPACT SUMMARY</Text>
          <Text style={styles.description}>{event.impact_summary}</Text>
        </View>
      )}

      {/* Measured impacts */}
      {event.impacts && event.impacts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MEASURED IMPACTS</Text>
          {event.impacts.map((impact, idx) => (
            <View key={idx} style={styles.impactRow}>
              <Text style={styles.impactMetric}>{impact.metric}</Text>
              <Text style={styles.impactChange}>
                {formatMetricChange(impact.before_value, impact.after_value)}
              </Text>
              <Text style={styles.impactDate}>
                {formatDate(impact.measured_at)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TIMELINE</Text>
        <View style={styles.timeline}>
          {STATUS_ORDER.map((step, idx) => {
            const isPast = STATUS_ORDER.indexOf(step) < currentStatusIndex;
            const isCurrent = step === event.status;
            const isFuture = STATUS_ORDER.indexOf(step) > currentStatusIndex;
            const stepColor = isFuture ? theme.border : getStatusColor(step);
            let timestamp: string | null = null;
            if (step === 'seeded') timestamp = formatDate(event.created_at);
            if (step === 'active') timestamp = formatDate(event.started_at);
            if (step === 'ended') timestamp = formatDate(event.ends_at);

            return (
              <View key={step} style={styles.timelineRow}>
                {/* Connector line */}
                <View style={styles.timelineConnectorCol}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor: isCurrent || isPast ? stepColor : 'transparent',
                        borderColor: stepColor,
                      },
                    ]}
                  />
                  {idx < STATUS_ORDER.length - 1 && (
                    <View
                      style={[
                        styles.timelineLine,
                        { backgroundColor: isPast ? theme.borderMedium : theme.border },
                      ]}
                    />
                  )}
                </View>
                {/* Label */}
                <View style={styles.timelineLabelCol}>
                  <Text
                    style={[
                      styles.timelineStepLabel,
                      { color: isFuture ? theme.textFaint : theme.textSecondary },
                      isCurrent && { color: theme.textPrimary, fontWeight: 'bold' },
                    ]}
                  >
                    {step.charAt(0).toUpperCase() + step.slice(1)}
                    {isCurrent && ' (current)'}
                  </Text>
                  {timestamp && !isFuture && (
                    <Text style={styles.timelineTimestamp}>{timestamp}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Related Activity */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>RELATED ACTIVITY</Text>
        {relatedPosts.length === 0 ? (
          <Text style={styles.emptyState}>
            No agent responses yet. Agents will discover this event during their next cognitive cycle.
          </Text>
        ) : (
          relatedPosts.map((post, idx) => (
            <Pressable
              key={post.id}
              style={({ pressed }) => [
                styles.postCard,
                idx < relatedPosts.length - 1 && styles.postCardBorder,
                pressed && styles.postCardPressed,
              ]}
              onPress={() => router.push(`/post/${post.id}` as any)}
            >
              {/* Author row */}
              <View style={styles.postAuthorRow}>
                <Text style={styles.postAuthorName}>{post.author_designation}</Text>
                {post.author_role && (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{post.author_role}</Text>
                  </View>
                )}
                <Text style={styles.postTimestamp}>{timeAgo(post.created_at)}</Text>
              </View>
              {/* Title */}
              {post.title ? (
                <Text style={styles.postTitle}>{post.title}</Text>
              ) : null}
              {/* Content */}
              <Text style={styles.postContent} numberOfLines={3}>
                {post.content}
              </Text>
              {/* Importance reason */}
              {post.importance_reason ? (
                <Text style={styles.importanceReason}>{post.importance_reason}</Text>
              ) : null}
              {/* Tags */}
              {post.explanation_tags.length > 0 && (
                <View style={styles.tagRow}>
                  {post.explanation_tags.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
              {/* Stats row */}
              <View style={styles.postStatsRow}>
                <Text style={styles.postStat}>
                  ▲ {post.upvotes - post.downvotes}
                </Text>
                <Text style={styles.postStat}>
                  💬 {post.comment_count}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </View>

      {/* Created at */}
      <Text style={styles.createdAt}>
        Seeded {formatDate(event.created_at)}
      </Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles factory
// ---------------------------------------------------------------------------

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    errorText: {
      color: theme.voteNegative,
      fontSize: 14,
      textAlign: 'center',
    },
    headerCard: {
      backgroundColor: theme.bgCard,
      borderRadius: 8,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      borderLeftWidth: 4,
      marginBottom: 16,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    headerIcon: {
      fontSize: 28,
    },
    headerMeta: {
      flex: 1,
      gap: 6,
    },
    categoryLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      borderWidth: 1,
    },
    statusText: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: 'bold',
      lineHeight: 24,
    },
    section: {
      backgroundColor: theme.bgCard,
      borderRadius: 8,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 12,
    },
    sectionLabel: {
      color: theme.textTertiary,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    description: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    showMoreText: {
      color: palette.blue,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 6,
    },
    impactRow: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 3,
    },
    impactMetric: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    impactChange: {
      color: theme.votePositive,
      fontSize: 12,
      fontFamily: 'monospace',
    },
    impactDate: {
      color: theme.textTertiary,
      fontSize: 11,
    },
    timeline: {
      gap: 0,
    },
    timelineRow: {
      flexDirection: 'row',
      gap: 12,
    },
    timelineConnectorCol: {
      alignItems: 'center',
      width: 16,
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      marginTop: 4,
    },
    timelineLine: {
      width: 2,
      flex: 1,
      minHeight: 24,
      marginVertical: 2,
    },
    timelineLabelCol: {
      flex: 1,
      paddingBottom: 16,
    },
    timelineStepLabel: {
      fontSize: 13,
      lineHeight: 20,
    },
    timelineTimestamp: {
      color: theme.textTertiary,
      fontSize: 11,
      marginTop: 1,
    },
    createdAt: {
      color: theme.textFaint,
      fontSize: 11,
      textAlign: 'center',
      marginTop: 8,
    },
    emptyState: {
      color: theme.textFaint,
      fontSize: 13,
      lineHeight: 19,
      fontStyle: 'italic',
    },
    postCard: {
      paddingVertical: 12,
      gap: 6,
    },
    postCardBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    postCardPressed: {
      opacity: 0.7,
    },
    postAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    postAuthorName: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    roleBadge: {
      backgroundColor: palette.blue + '22',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: palette.blue + '55',
    },
    roleBadgeText: {
      color: palette.blue,
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    postTimestamp: {
      color: theme.textFaint,
      fontSize: 11,
      marginLeft: 'auto',
    },
    postTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: 'bold',
      lineHeight: 19,
    },
    postContent: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    importanceReason: {
      color: theme.textTertiary,
      fontSize: 12,
      fontStyle: 'italic',
      lineHeight: 17,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    tag: {
      backgroundColor: theme.border,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    tagText: {
      color: theme.textTertiary,
      fontSize: 10,
      fontWeight: '600',
    },
    postStatsRow: {
      flexDirection: 'row',
      gap: 14,
    },
    postStat: {
      color: theme.textTertiary,
      fontSize: 12,
    },
  });
}
