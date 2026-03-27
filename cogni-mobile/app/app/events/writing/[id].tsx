// Writing Event Detail Screen - Draft-centric view of a Literary Forge writing event
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTheme, palette } from '@/theme';
import { useWritingEventStore } from '@/stores/writingEvent.store';
import { subscribeToFragments } from '@/services/writingEvent.service';
import { WritingFragment } from '@/services/writingEvent.service';
import FragmentCard from '@/components/FragmentCard';
import ChapterRevealModal from '@/components/ChapterRevealModal';

const LITERARY_COLOR = '#f59e0b';

const PHASES = ['drafting', 'revision', 'polish_canonize'];
const PHASE_LABELS: Record<string, string> = {
  drafting: 'Draft',
  revision: 'Revise',
  polish_canonize: 'Polish & Canon',
};

const TABS = [
  { key: 'draft', label: 'Draft' },
  { key: 'critiques', label: 'Critiques' },
  { key: 'history', label: 'History' },
] as const;

type TabKey = typeof TABS[number]['key'];

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  minor: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6' },
  moderate: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
  major: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: '#ef4444' },
};

function useCountdown(endsAt?: string): string | null {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!endsAt) return;

    function update() {
      const end = new Date(endsAt!).getTime();
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        setRemaining('Ended');
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);

      if (days > 0) {
        setRemaining(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setRemaining(`${hours}h ${minutes}m`);
      } else {
        setRemaining(`${minutes}m`);
      }
    }

    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [endsAt]);

  return remaining;
}

function getDraftLabel(fragmentType: string): string {
  if (fragmentType === 'polish') return 'Final Polish';
  if (fragmentType === 'revision') return 'Revision';
  return 'Draft';
}

function parseCritiqueContent(content: string): { text: string; severity: string } {
  try {
    const parsed = JSON.parse(content);
    return {
      text: parsed.critique ?? content,
      severity: parsed.severity ?? 'moderate',
    };
  } catch {
    return { text: content, severity: 'moderate' };
  }
}

function CritiqueCard({ fragment, theme }: { fragment: WritingFragment; theme: ReturnType<typeof useTheme> }) {
  const { text, severity } = parseCritiqueContent(fragment.content);
  const severityStyle = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.minor;

  return (
    <View style={{
      backgroundColor: theme.bgCard,
      borderRadius: 8,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 14 }}>🔍</Text>
          {fragment.author_designation ? (
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {fragment.author_designation}
            </Text>
          ) : null}
          {fragment.author_role ? (
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>({fragment.author_role})</Text>
          ) : null}
        </View>
        <View style={{
          paddingHorizontal: 7,
          paddingVertical: 3,
          borderRadius: 4,
          borderWidth: 1,
          backgroundColor: severityStyle.bg,
          borderColor: severityStyle.border,
        }}>
          <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: severityStyle.text }}>
            {severity}
          </Text>
        </View>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>
        {text}
      </Text>
    </View>
  );
}

function HistoryTimelineItem({
  fragment,
  theme,
  isLast,
}: {
  fragment: WritingFragment;
  theme: ReturnType<typeof useTheme>;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = getDraftLabel(fragment.fragment_type);
  const preview = fragment.content.length > 180
    ? fragment.content.slice(0, 180) + '...'
    : fragment.content;

  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {/* Timeline spine */}
      <View style={{ alignItems: 'center', width: 20 }}>
        <View style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: LITERARY_COLOR,
          marginTop: 2,
        }} />
        {!isLast && (
          <View style={{ width: 2, flex: 1, backgroundColor: theme.border, marginTop: 4 }} />
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Text style={{ color: LITERARY_COLOR, fontSize: 12, fontWeight: '700' }}>{label}</Text>
          {fragment.author_designation ? (
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>by {fragment.author_designation}</Text>
          ) : null}
        </View>
        <View style={{
          backgroundColor: theme.bgCard,
          borderRadius: 8,
          padding: 12,
          borderWidth: 1,
          borderColor: theme.border,
        }}>
          <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 20, fontStyle: 'italic' }}>
            "{expanded ? fragment.content : preview}"
          </Text>
          {fragment.content.length > 180 && (
            <Pressable onPress={() => setExpanded((v) => !v)} style={{ marginTop: 6 }}>
              <Text style={{ color: LITERARY_COLOR, fontSize: 12, fontWeight: '600' }}>
                {expanded ? 'Show less' : 'View full'}
              </Text>
            </Pressable>
          )}
        </View>
        <Text style={{ color: theme.textFaint, fontSize: 10, marginTop: 4 }}>
          {new Date(fragment.created_at).toLocaleString()}
        </Text>
      </View>
    </View>
  );
}

export default function WritingEventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const {
    currentEvent,
    fragments,
    isLoadingEvent,
    isLoadingFragments,
    fetchEventDetail,
    fetchFragments,
    updateFragment,
  } = useWritingEventStore();

  const [activeTab, setActiveTab] = useState<TabKey>('draft');
  const [refreshing, setRefreshing] = useState(false);
  const [chapterModalVisible, setChapterModalVisible] = useState(false);

  const countdown = useCountdown(currentEvent?.phase_ends_at);
  const currentPhaseIndex = PHASES.indexOf(currentEvent?.current_phase ?? '');

  const showChapterButton =
    currentEvent?.current_phase === 'polish_canonize' ||
    currentEvent?.world_event_status === 'ended';

  // Load data on mount
  useEffect(() => {
    if (!id) return;
    fetchEventDetail(id);
    fetchFragments(id);
  }, [id]);

  // Realtime subscription
  useEffect(() => {
    if (!id) return;
    const channel = subscribeToFragments(id, (payload: any) => {
      if (payload.new) {
        updateFragment(payload.new.id, payload.new);
      }
    });
    return () => {
      channel.unsubscribe();
    };
  }, [id]);

  const onRefresh = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    await Promise.all([fetchEventDetail(id), fetchFragments(id)]);
    setRefreshing(false);
  }, [id]);

  // Derived fragment lists
  const latestDraftFragment = useMemo(() => {
    const draftTypes = ['draft', 'revision', 'polish'];
    const draftFragments = fragments
      .filter((f) => draftTypes.includes(f.fragment_type))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return draftFragments[0] ?? null;
  }, [fragments]);

  const critiqueFragments = useMemo(
    () => fragments.filter((f) => f.fragment_type === 'critique'),
    [fragments]
  );

  const historyFragments = useMemo(
    () => [...fragments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [fragments]
  );

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Header card
    headerCard: {
      backgroundColor: theme.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      padding: 16,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    categoryIcon: {
      fontSize: 16,
    },
    categoryLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: LITERARY_COLOR,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: 'bold',
      lineHeight: 26,
      marginBottom: 8,
    },
    premise: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 10,
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 6,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      backgroundColor: 'rgba(245,158,11,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.25)',
    },
    badgeText: {
      color: LITERARY_COLOR,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    // Phase progress
    phaseSection: {
      backgroundColor: theme.bgCard,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    phaseBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    phaseDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
    },
    phaseConnector: {
      height: 2,
      flex: 1,
    },
    phaseLabelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    phaseLabel: {
      fontSize: 11,
      fontWeight: '500',
    },
    countdownText: {
      color: LITERARY_COLOR,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'right',
    },
    // Tab switcher
    tabBar: {
      flexDirection: 'row',
      backgroundColor: theme.bg,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: LITERARY_COLOR,
    },
    tabText: {
      color: theme.tabInactive,
      fontSize: 13,
      fontWeight: '600',
    },
    tabTextActive: {
      color: LITERARY_COLOR,
    },
    // Content padding
    listContent: {
      padding: 16,
      paddingBottom: 40,
    },
    emptyContainer: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
    // Draft view
    draftCard: {
      backgroundColor: theme.bgCard,
      borderRadius: 8,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    draftLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    draftLabel: {
      color: LITERARY_COLOR,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    draftAuthor: {
      color: theme.textMuted,
      fontSize: 12,
    },
    draftText: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 24,
    },
    // Chapter button
    chapterButton: {
      marginTop: 8,
      marginBottom: 16,
      marginHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 8,
      backgroundColor: 'rgba(245,158,11,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.35)',
      alignItems: 'center',
    },
    chapterButtonText: {
      color: LITERARY_COLOR,
      fontSize: 14,
      fontWeight: '700',
    },
  }), [theme]);

  if (isLoadingEvent && !currentEvent) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Literary Forge' }} />
        <ActivityIndicator size="large" color={palette.amber} />
      </View>
    );
  }

  // Tab content renderers
  function renderDraftTab() {
    if (!latestDraftFragment) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 24, marginBottom: 8 }}>📝</Text>
          <Text style={styles.emptyText}>Awaiting draft from Story Architect...</Text>
        </View>
      );
    }

    return (
      <View style={styles.draftCard}>
        <View style={styles.draftLabelRow}>
          <Text style={styles.draftLabel}>{getDraftLabel(latestDraftFragment.fragment_type)}</Text>
          {latestDraftFragment.author_designation ? (
            <Text style={styles.draftAuthor}>by {latestDraftFragment.author_designation}</Text>
          ) : null}
        </View>
        <Text style={styles.draftText}>{latestDraftFragment.content}</Text>
      </View>
    );
  }

  function renderCritiquesTab() {
    if (critiqueFragments.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 24, marginBottom: 8 }}>🔍</Text>
          <Text style={styles.emptyText}>No critiques yet. Council members will review the draft.</Text>
        </View>
      );
    }

    return (
      <>
        {critiqueFragments.map((f) => (
          <CritiqueCard key={f.id} fragment={f} theme={theme} />
        ))}
      </>
    );
  }

  function renderHistoryTab() {
    if (historyFragments.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 24, marginBottom: 8 }}>📜</Text>
          <Text style={styles.emptyText}>No history yet. The story will unfold here.</Text>
        </View>
      );
    }

    return (
      <View style={{ paddingTop: 4 }}>
        {historyFragments.map((f, index) => (
          <HistoryTimelineItem
            key={f.id}
            fragment={f}
            theme={theme}
            isLast={index === historyFragments.length - 1}
          />
        ))}
      </View>
    );
  }

  const ListHeader = () => (
    <View>
      {/* Header card */}
      {currentEvent && (
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.categoryIcon}>📖</Text>
            <Text style={styles.categoryLabel}>Literary Forge · Chapter {currentEvent.chapter_number}</Text>
          </View>
          <Text style={styles.title}>"{currentEvent.world_event_title}"</Text>
          {currentEvent.premise ? (
            <Text style={styles.premise} numberOfLines={3}>{currentEvent.premise}</Text>
          ) : null}
          <View style={styles.badgeRow}>
            {currentEvent.genre ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{currentEvent.genre}</Text>
              </View>
            ) : null}
            {currentEvent.tone ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{currentEvent.tone}</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* Phase progress */}
      {currentEvent && (
        <View style={styles.phaseSection}>
          <View style={styles.phaseBar}>
            {PHASES.map((phase, index) => {
              const isCompleted = index < currentPhaseIndex;
              const isCurrent = index === currentPhaseIndex;
              const isFuture = index > currentPhaseIndex;
              const dotColor = isFuture ? theme.border : LITERARY_COLOR;
              const dotBg = isCurrent || isCompleted ? LITERARY_COLOR : 'transparent';
              const lineColor = isCompleted ? LITERARY_COLOR : theme.border;

              return (
                <View
                  key={phase}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flex: index < PHASES.length - 1 ? 1 : 0,
                  }}
                >
                  <View
                    style={[
                      styles.phaseDot,
                      { borderColor: dotColor, backgroundColor: dotBg },
                    ]}
                  />
                  {index < PHASES.length - 1 && (
                    <View style={[styles.phaseConnector, { backgroundColor: lineColor }]} />
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.phaseLabelsRow}>
            {PHASES.map((phase, index) => {
              const isCurrent = index === currentPhaseIndex;
              const isFuture = index > currentPhaseIndex;
              return (
                <Text
                  key={phase}
                  style={[
                    styles.phaseLabel,
                    {
                      color: isFuture
                        ? theme.textFaint
                        : isCurrent
                        ? LITERARY_COLOR
                        : theme.textMuted,
                      fontWeight: isCurrent ? '700' : '500',
                    },
                  ]}
                >
                  {PHASE_LABELS[phase]}
                </Text>
              );
            })}
          </View>
          {countdown && (
            <Text style={styles.countdownText}>{countdown} remaining</Text>
          )}
        </View>
      )}

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Chapter reveal button */}
      {showChapterButton && currentEvent && (
        <Pressable style={styles.chapterButton} onPress={() => setChapterModalVisible(true)}>
          <Text style={styles.chapterButtonText}>View Assembled Chapter</Text>
        </Pressable>
      )}
    </View>
  );

  // Tab body content (rendered as a single item in FlatList for scroll integration)
  const TabBody = () => (
    <View style={styles.listContent}>
      {activeTab === 'draft' && renderDraftTab()}
      {activeTab === 'critiques' && renderCritiquesTab()}
      {activeTab === 'history' && renderHistoryTab()}
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: currentEvent?.world_event_title ?? 'Literary Forge' }} />

      <FlatList
        data={[{ key: 'body' }]}
        keyExtractor={(item) => item.key}
        renderItem={() => <TabBody />}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.amber}
            colors={[palette.amber]}
          />
        }
      />

      {/* Chapter reveal modal */}
      {currentEvent && (
        <ChapterRevealModal
          visible={chapterModalVisible}
          onClose={() => setChapterModalVisible(false)}
          event={currentEvent}
        />
      )}
    </View>
  );
}
