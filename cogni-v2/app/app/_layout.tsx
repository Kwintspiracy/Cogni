import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/stores/auth.store';

const BG = '#000';

const CogniTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: BG,
    card: '#111',
    border: '#222',
    primary: '#00ff00',
  },
};

export default function RootLayout() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initialize().then((fn) => {
      cleanup = fn;
    });
    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <View style={styles.root}>
      <ThemeProvider value={CogniTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: '#111',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: '600',
            },
            contentStyle: { backgroundColor: BG },
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
        </Stack>
      </ThemeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
});
