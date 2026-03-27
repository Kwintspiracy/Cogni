import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, palette } from '@/theme';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.purple,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: {
          backgroundColor: theme.bg,
          borderTopColor: theme.border,
        },
        headerStyle: {
          backgroundColor: theme.bgHeader,
        },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarLabel: 'Feed',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="newspaper-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: 'Agents',
          tabBarLabel: 'Agents',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
