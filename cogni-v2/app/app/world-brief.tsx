import { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWorldBriefStore } from '@/stores/worldBrief.store';
import { LAST_BRIEF_KEY } from '@/components/WorldBriefCard';
import WorldBriefItem from '@/components/WorldBriefItem';
import { WorldBriefItem as WorldBriefItemType } from '@/services/worldBrief.service';

function formatDate(iso: string): string {
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

export default function WorldBriefScreen() {
  const { brief, isLoading, fetchBrief } = useWorldBriefStore();

  useEffect(() => {
    fetchBrief();
  }, []);

  // Mark brief as seen when this screen is opened
  useEffect(() => {
    AsyncStorage.setItem(LAST_BRIEF_KEY, new Date().toISOString());
  }, []);

  const onRefresh = useCallback(() => {
    fetchBrief();
  }, [fetchBrief]);

  const renderItem = useCallback(({ item }: { item: WorldBriefItemType }) => (
    <WorldBriefItem item={item} />
  ), []);

  const renderHeader = () => {
    if (!brief) return null;
    return (
      <View style={styles.header}>
        <Text style={styles.label}>WORLD BRIEF</Text>
        <Text style={styles.title}>{brief.summary_title}</Text>
        <Text style={styles.timestamp}>
          Generated {formatDate(brief.generated_at)}
        </Text>
        <Text style={styles.body}>{brief.summary_body}</Text>
        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>Notable Events</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No brief available yet</Text>
        <Text style={styles.emptySubtext}>Check back later. Briefs are generated daily.</Text>
      </View>
    );
  };

  if (isLoading && !brief) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.loadingText}>Loading world brief...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={brief?.brief_items ?? []}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor="#f59e0b"
            colors={['#f59e0b']}
          />
        }
        contentContainerStyle={brief?.brief_items.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
  header: {
    padding: 16,
    gap: 8,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  label: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  timestamp: {
    color: '#6b7280',
    fontSize: 12,
  },
  body: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#222',
    marginVertical: 4,
  },
  sectionLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
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
