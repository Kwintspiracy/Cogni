import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';

export default function SourcesScreen() {
  const params = useLocalSearchParams();
  const [notes, setNotes] = useState('');
  const [rssFeeds, setRssFeeds] = useState<{ url: string; label: string }[]>([]);
  const [rssUrl, setRssUrl] = useState('');
  const [rssLabel, setRssLabel] = useState('');
  const [webEnabled, setWebEnabled] = useState(false);

  const handleNext = () => {
    router.push({
      pathname: '/create-agent/memory' as any,
      params: {
        identity: params.identity as string,
        roleStyle: params.roleStyle as string,
        sources: JSON.stringify({
          notes: notes.trim(),
          rss_feeds: rssFeeds,
          web_access: webEnabled,
        }),
      },
    });
  };

  const handleBack = () => {
    router.back();
  };

  const handleAddFeed = () => {
    const trimmedUrl = rssUrl.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Feed URL must start with http:// or https://');
      return;
    }
    if (rssFeeds.length >= 3) {
      Alert.alert('Limit Reached', 'Maximum 3 RSS feeds allowed.');
      return;
    }
    setRssFeeds([...rssFeeds, { url: trimmedUrl, label: rssLabel.trim() }]);
    setRssUrl('');
    setRssLabel('');
  };

  const handleRemoveFeed = (index: number) => {
    setRssFeeds(rssFeeds.filter((_, i) => i !== index));
  };

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Step 3: Sources' }} />
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Knowledge Sources</Text>
          <Text style={styles.subtitle}>Step 3 of 5: Sources</Text>
        </View>

        {/* Private Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Private Notes</Text>
          <Text style={styles.helperText}>
            Add context, instructions, or knowledge your agent should reference.
          </Text>
          <TextInput
            style={styles.textArea}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g., You are an expert in climate science. Always cite IPCC reports..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={8}
            maxLength={5000}
          />
          <Text style={styles.charCount}>{notes.length}/5000 characters</Text>
        </View>

        {/* Document Upload (V1.5) */}
        <View style={styles.section}>
          <Text style={styles.label}>Documents</Text>
          <Text style={styles.helperText}>
            Upload PDFs, text files, or other documents for your agent's knowledge base.
          </Text>
          <TouchableOpacity style={styles.comingSoonButton} disabled>
            <Text style={styles.comingSoonIcon}>📄</Text>
            <Text style={styles.comingSoonText}>Upload Documents (Coming Soon)</Text>
          </TouchableOpacity>
        </View>

        {/* RSS Feeds */}
        <View style={styles.section}>
          <Text style={styles.label}>RSS Feeds</Text>
          <Text style={styles.helperText}>
            Subscribe to news feeds to keep your agent updated (1-2x per day).
          </Text>

          {/* Feed list */}
          {rssFeeds.map((feed, index) => (
            <View key={index} style={styles.feedItem}>
              <View style={styles.feedInfo}>
                <Text style={styles.feedLabel} numberOfLines={1}>
                  {feed.label || feed.url}
                </Text>
                {feed.label ? (
                  <Text style={styles.feedUrl} numberOfLines={1}>{feed.url}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.feedRemoveButton}
                onPress={() => handleRemoveFeed(index)}
              >
                <Text style={styles.feedRemoveText}>X</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Add feed form */}
          {rssFeeds.length < 3 && (
            <View style={styles.addFeedForm}>
              <TextInput
                style={styles.feedInput}
                value={rssUrl}
                onChangeText={setRssUrl}
                placeholder="https://example.com/feed.xml"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <TextInput
                style={styles.feedInput}
                value={rssLabel}
                onChangeText={setRssLabel}
                placeholder="Label (optional)"
                placeholderTextColor="#666"
              />
              <TouchableOpacity
                style={[styles.addFeedButton, !rssUrl.trim() && styles.addFeedButtonDisabled]}
                onPress={handleAddFeed}
                disabled={!rssUrl.trim()}
              >
                <Text style={styles.addFeedButtonText}>Add Feed</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.feedCount}>{rssFeeds.length}/3 feeds</Text>
        </View>

        {/* Web Access */}
        <View style={styles.section}>
          <Text style={styles.label}>Web Access</Text>
          <Text style={styles.helperText}>
            Allow your agent to read full articles and search the web. Uses your API key for summarization.
          </Text>

          <TouchableOpacity
            style={[styles.toggleRow, webEnabled && styles.toggleRowActive]}
            onPress={() => setWebEnabled(!webEnabled)}
          >
            <View style={[styles.toggleDot, webEnabled && styles.toggleDotActive]} />
            <Text style={[styles.toggleText, webEnabled && styles.toggleTextActive]}>
              {webEnabled ? 'Web Access Enabled' : 'Web Access Disabled'}
            </Text>
          </TouchableOpacity>

          {webEnabled && (
            <View style={styles.webConfig}>
              <Text style={styles.webConfigLabel}>Daily Limits</Text>
              <Text style={styles.webConfigDetail}>Max 10 article opens / day</Text>
              <Text style={styles.webConfigDetail}>Max 5 searches / day</Text>
              <Text style={styles.webConfigDetail}>Max 1 link per message</Text>
            </View>
          )}
        </View>

        {/* Navigation */}
        <View style={styles.navigation}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>Next: Memory →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
    lineHeight: 20,
  },
  textArea: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 150,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'right',
  },
  comingSoonButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  comingSoonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  comingSoonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  feedItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
  },
  feedInfo: {
    flex: 1,
    marginRight: 12,
  },
  feedLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  feedUrl: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  feedRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#331111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedRemoveText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '700',
  },
  addFeedForm: {
    gap: 8,
    marginTop: 4,
  },
  feedInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  addFeedButton: {
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  addFeedButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  addFeedButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  feedCount: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'right',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleRowActive: {
    borderColor: '#00ff00',
    backgroundColor: '#0a1a0a',
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#333',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#555',
  },
  toggleDotActive: {
    backgroundColor: '#00ff00',
    borderColor: '#00ff00',
  },
  toggleText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#00ff00',
  },
  webConfig: {
    backgroundColor: '#0a1a0a',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1a3a1a',
  },
  webConfigLabel: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  webConfigDetail: {
    color: '#888',
    fontSize: 12,
    lineHeight: 18,
  },
  navigation: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 32,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    backgroundColor: '#00ff00',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
