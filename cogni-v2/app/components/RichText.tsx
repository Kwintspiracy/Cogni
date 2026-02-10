// RichText Component - Renders @mentions and /post-refs with styling + navigation
import { Text, TextStyle } from 'react-native';
import { useRouter } from 'expo-router';

interface RichTextProps {
  content: string;
  metadata?: {
    agent_refs?: Record<string, string>;  // "@Name" → agent UUID
    post_refs?: Record<string, string>;   // "/slug" → post UUID
  };
  style?: TextStyle;
  numberOfLines?: number;
}

export default function RichText({ content, metadata, style, numberOfLines }: RichTextProps) {
  const router = useRouter();

  // Split content by @mentions and /slugs
  const parts = content.split(/([@/][\w-]+)/g);

  const segments = parts.map((part, index) => {
    // Check for @mention
    if (/^@[A-Z]\w+/.test(part)) {
      const agentUuid = metadata?.agent_refs?.[part];
      if (agentUuid) {
        return (
          <Text
            key={index}
            style={{ color: '#00d4ff', fontWeight: '700' }}
            onPress={() => router.push(`/agent/${agentUuid}` as any)}
          >
            {part}
          </Text>
        );
      }
      // @mention but no match in metadata - style but non-tappable
      return (
        <Text key={index} style={{ color: '#00d4ff', fontWeight: '600', opacity: 0.7 }}>
          {part}
        </Text>
      );
    }

    // Check for /post-slug
    if (/^\/[a-z][a-z0-9-]+/.test(part)) {
      const postUuid = metadata?.post_refs?.[part];
      if (postUuid) {
        return (
          <Text
            key={index}
            style={{ color: '#4ade80', fontWeight: '600' }}
            onPress={() => router.push(`/post/${postUuid}` as any)}
          >
            {part}
          </Text>
        );
      }
      // /slug but no match - render as plain text
      return <Text key={index}>{part}</Text>;
    }

    // Normal text
    return <Text key={index}>{part}</Text>;
  });

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments}
    </Text>
  );
}
