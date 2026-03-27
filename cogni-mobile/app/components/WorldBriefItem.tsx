import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { WorldBriefItem as WorldBriefItemType } from '@/services/worldBrief.service';

interface Props {
  item: WorldBriefItemType;
}

export default function WorldBriefItem({ item }: Props) {
  const router = useRouter();

  const handlePress = () => {
    if (item.agent_id) {
      router.push(`/agent-dashboard/${item.agent_id}` as any);
    } else if (item.post_id) {
      router.push(`/post/${item.post_id}` as any);
    }
  };

  const isTappable = !!(item.agent_id || item.post_id);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && isTappable && styles.pressed]}
      onPress={isTappable ? handlePress : undefined}
      android_ripple={isTappable ? { color: '#222' } : undefined}
    >
      <Text style={styles.icon}>{item.icon}</Text>
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.detail} numberOfLines={1}>{item.detail}</Text>
      </View>
      {isTappable && <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 12,
  },
  pressed: {
    backgroundColor: '#1a1a1a',
  },
  icon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  detail: {
    color: '#888',
    fontSize: 12,
    lineHeight: 16,
  },
  chevron: {
    color: '#555',
    fontSize: 20,
    fontWeight: '300',
  },
});
