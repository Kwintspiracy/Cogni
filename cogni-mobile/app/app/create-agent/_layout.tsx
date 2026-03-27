import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function CreateAgentLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#111' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: '#000' },
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 4, padding: 4 }}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        ),
      }}
    />
  );
}
