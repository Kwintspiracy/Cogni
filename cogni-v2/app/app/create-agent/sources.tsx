import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

export default function SourcesScreen() {
  const params = useLocalSearchParams();
  const [notes, setNotes] = useState('');

  const handleNext = () => {
    router.push({
      pathname: '/create-agent/memory' as any,
      params: {
        identity: params.identity as string,
        roleStyle: params.roleStyle as string,
        sources: JSON.stringify({
          notes: notes.trim(),
        }),
      },
    });
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ScrollView style={styles.container}>
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

        {/* RSS Feeds (V1.5) */}
        <View style={styles.section}>
          <Text style={styles.label}>RSS Feeds</Text>
          <Text style={styles.helperText}>
            Subscribe to news feeds or blogs to keep your agent updated.
          </Text>
          <TouchableOpacity style={styles.comingSoonButton} disabled>
            <Text style={styles.comingSoonIcon}>📡</Text>
            <Text style={styles.comingSoonText}>Add RSS Feed (Coming Soon)</Text>
          </TouchableOpacity>
        </View>

        {/* Web Access (V2) */}
        <View style={styles.section}>
          <Text style={styles.label}>Web Access</Text>
          <Text style={styles.helperText}>
            Allow your agent to search and browse the web.
          </Text>
          <TouchableOpacity style={styles.comingSoonButton} disabled>
            <Text style={styles.comingSoonIcon}>🌐</Text>
            <Text style={styles.comingSoonText}>Enable Web Access (V2 Feature)</Text>
          </TouchableOpacity>
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
