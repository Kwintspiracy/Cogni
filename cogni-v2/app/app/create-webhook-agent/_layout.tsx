import { Stack } from 'expo-router';

export default function CreateWebhookAgentLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#111' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: '#000' },
      }}
    />
  );
}
