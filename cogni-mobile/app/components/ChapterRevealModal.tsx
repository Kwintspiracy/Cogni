// ChapterRevealModal - Displays the final assembled chapter for a writing event
import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { useTheme, palette } from '@/theme';
import { WritingEvent } from '@/services/writingEvent.service';

interface ChapterRevealModalProps {
  visible: boolean;
  onClose: () => void;
  event: WritingEvent;
}

function CanonSection({ canon }: { canon: Record<string, any> }) {
  const theme = useTheme();
  const entries = Object.entries(canon ?? {});
  if (entries.length === 0) return null;

  return (
    <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
      <Text style={{ color: 'rgba(245,158,11,0.8)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
        Canon Established
      </Text>
      {entries.map(([key, value]) => (
        <View key={key} style={{ marginBottom: 8 }}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', textTransform: 'capitalize', letterSpacing: 0.3, marginBottom: 2 }}>
            {key.replace(/_/g, ' ')}
          </Text>
          {Array.isArray(value) ? (
            value.map((item: string, idx: number) => (
              <Text key={idx} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 18 }}>
                · {item}
              </Text>
            ))
          ) : (
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 18 }}>
              {String(value)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export default function ChapterRevealModal({ visible, onClose, event }: ChapterRevealModalProps) {
  const theme = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.85)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderColor: 'rgba(245,158,11,0.3)',
      maxHeight: '90%',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.borderMedium,
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 8,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    titleRow: {
      alignItems: 'center',
      marginBottom: 20,
      gap: 4,
    },
    sparkle: {
      fontSize: 22,
    },
    chapterLabel: {
      color: '#f59e0b',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    eventTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: 'center',
      lineHeight: 28,
    },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 16,
    },
    chapterText: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 24,
    },
    noChapterText: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: 'center',
      fontStyle: 'italic',
      paddingVertical: 20,
    },
    closeButton: {
      marginTop: 24,
      paddingVertical: 14,
      borderRadius: 8,
      backgroundColor: 'rgba(245,158,11,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.3)',
      alignItems: 'center',
    },
    closeButtonText: {
      color: '#f59e0b',
      fontSize: 14,
      fontWeight: '700',
    },
  }), [theme]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <SafeAreaView style={styles.sheet}>
          <Pressable>
            <View style={styles.handle} />
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Title area */}
              <View style={styles.titleRow}>
                <Text style={styles.sparkle}>✨</Text>
                <Text style={styles.chapterLabel}>Chapter {event.chapter_number} Complete</Text>
                <Text style={styles.eventTitle}>"{event.world_event_title}"</Text>
              </View>

              <View style={styles.divider} />

              {/* Chapter text */}
              {event.chapter_text ? (
                <Text style={styles.chapterText}>{event.chapter_text}</Text>
              ) : (
                <Text style={styles.noChapterText}>
                  Chapter text is being assembled...
                </Text>
              )}

              {/* Canon section */}
              {event.canon && Object.keys(event.canon).length > 0 && (
                <CanonSection canon={event.canon} />
              )}

              {/* Close button */}
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}
