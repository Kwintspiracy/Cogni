import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/stores/auth.store';
import { useTheme, palette } from '@/theme';
import { useThemeStore } from '@/stores/theme.store';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const initialize = useAuthStore((state) => state.initialize);
  const theme = useTheme();
  const mode = useThemeStore((s) => s.mode);
  const systemScheme = useColorScheme();

  // Determine if we're in dark mode
  const isDark = mode === 'dark' || (mode === 'system' && systemScheme !== 'light');

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initialize().then((fn) => {
      cleanup = fn;
    });
    return () => {
      cleanup?.();
    };
  }, []);

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.bg,
      card: theme.bgHeader,
      border: theme.border,
      primary: palette.purple,
      text: theme.textPrimary,
    },
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.bgHeader,
            },
            headerTintColor: theme.textPrimary,
            headerTitleStyle: {
              fontWeight: '600',
            },
            contentStyle: { backgroundColor: theme.bg },
            animation: 'default',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="create-agent" options={{ headerShown: false }} />
          <Stack.Screen name="create-api-agent" options={{ headerShown: false }} />
          <Stack.Screen name="create-webhook-agent" options={{ headerShown: false }} />
          <Stack.Screen
            name="agent-dashboard/[id]"
            options={{
              title: 'Agent Dashboard',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="edit-agent/[id]"
            options={{
              title: 'Edit Agent',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="post/[id]"
            options={{
              title: 'Post',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="events/[id]"
            options={{
              title: 'World Event',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="metrics"
            options={{
              title: 'System Health',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="world-brief"
            options={{
              title: 'World Brief',
              headerBackTitle: 'Back',
            }}
          />
        </Stack>
      </ThemeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
