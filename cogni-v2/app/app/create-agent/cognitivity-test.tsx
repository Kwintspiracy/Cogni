import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { AGENT_BEHAVIOR_QUESTIONS } from '@/lib/AgentBehaviorQuestions';
import { calculateAgentSpec, CognitivityResult } from '@/lib/AgentBehaviorLogic';
import { useCreateAgentStore } from '@/stores/create-agent.store';

export default function CognitivityTestScreen() {
  const params = useLocalSearchParams();
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const { setBehaviorResults } = useCreateAgentStore();

  // Group questions by section (preserving order)
  const sections: string[] = [];
  for (const q of AGENT_BEHAVIOR_QUESTIONS) {
    if (!sections.includes(q.section)) sections.push(q.section);
  }
  const currentSection = sections[currentSectionIndex];
  const sectionQuestions = AGENT_BEHAVIOR_QUESTIONS.filter(
    (q) => q.section === currentSection,
  );

  const totalAnswered = Object.keys(answers).length;
  const totalQuestions = AGENT_BEHAVIOR_QUESTIONS.filter(
    (q) => q.type === 'single',
  ).length;

  const handleSelect = (
    questionId: number,
    value: string,
    type: 'single' | 'multiple',
  ) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (type === 'single') {
        next[questionId] = value;
      } else {
        const current = (next[questionId] as string[]) || [];
        if (current.includes(value)) {
          next[questionId] = current.filter((v) => v !== value);
        } else {
          next[questionId] = [...current, value];
        }
      }
      return next;
    });
  };

  const validateSection = (): boolean => {
    const unanswered = sectionQuestions.filter(
      (q) => q.type === 'single' && !answers[q.id],
    );
    if (unanswered.length > 0) {
      Alert.alert(
        'Missing Answers',
        'Please answer all questions before proceeding.',
      );
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateSection()) return;

    if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      handleFinish();
    }
  };

  const handlePrevious = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleFinish = () => {
    if (!validateSection()) return;

    try {
      const result: CognitivityResult = calculateAgentSpec(answers);

      // Store results in zustand store
      setBehaviorResults(result);

      // Navigate back to identity screen (don't push a new one)
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to generate behavior spec. Please try again.');
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Test?',
      'Your progress will be lost.',
      [
        { text: 'Continue Test', style: 'cancel' },
        { text: 'Cancel', style: 'destructive', onPress: () => router.back() },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Cognitivity Test' }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Behavior Test</Text>
        <Text style={styles.headerProgress}>
          {currentSectionIndex + 1}/{sections.length}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${((currentSectionIndex + 1) / sections.length) * 100}%`,
            },
          ]}
        />
      </View>

      {/* Questions */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionTitle}>{currentSection}</Text>
        <Text style={styles.sectionSubtitle}>
          Answer each question to shape your agent's behavioral contract.
        </Text>

        {sectionQuestions.map((question) => (
          <View key={question.id} style={styles.questionContainer}>
            <Text style={styles.questionText}>
              <Text style={styles.questionNumber}>Q{question.id}. </Text>
              {question.text}
            </Text>
            {question.type === 'multiple' && (
              <Text style={styles.multiHint}>Select all that apply</Text>
            )}
            <View style={styles.optionsContainer}>
              {question.options.map((option) => {
                const isSelected =
                  question.type === 'single'
                    ? answers[question.id] === option.id
                    : ((answers[question.id] as string[]) || []).includes(
                        option.id,
                      );
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.optionButton,
                      isSelected && styles.optionButtonSelected,
                    ]}
                    onPress={() =>
                      handleSelect(question.id, option.id, question.type)
                    }
                  >
                    <View
                      style={[
                        question.type === 'single'
                          ? styles.radioCircle
                          : styles.checkboxCircle,
                        isSelected &&
                          (question.type === 'single'
                            ? styles.radioCircleSelected
                            : styles.checkboxCircleSelected),
                      ]}
                    >
                      {isSelected &&
                        (question.type === 'single' ? (
                          <View style={styles.radioInner} />
                        ) : (
                          <Text style={styles.checkMark}>&#10003;</Text>
                        ))}
                    </View>
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {option.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Footer navigation */}
      <View style={styles.footer}>
        {currentSectionIndex > 0 ? (
          <TouchableOpacity
            style={styles.prevButton}
            onPress={handlePrevious}
          >
            <Text style={styles.prevButtonText}>Previous</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.prevButton} />
        )}

        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>
            {currentSectionIndex === sections.length - 1
              ? 'Finish'
              : 'Next Section'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  cancelText: {
    color: '#888',
    fontSize: 15,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  headerProgress: {
    color: '#00ff00',
    fontSize: 14,
    fontWeight: '600',
  },
  progressBar: {
    height: 3,
    backgroundColor: '#222',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00ff00',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  questionContainer: {
    marginBottom: 28,
  },
  questionText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 12,
    lineHeight: 22,
  },
  questionNumber: {
    color: '#00ff00',
  },
  multiHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  optionButtonSelected: {
    backgroundColor: '#002200',
    borderColor: '#00ff00',
  },
  optionText: {
    fontSize: 15,
    color: '#ccc',
    flex: 1,
  },
  optionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: '#00ff00',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00ff00',
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCircleSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#00ff00',
  },
  checkMark: {
    color: '#000',
    fontSize: 13,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  prevButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  prevButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#00ff00',
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
