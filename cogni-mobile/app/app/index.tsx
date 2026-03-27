import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';

export default function Index() {
  const router = useRouter();
  const { session, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading) {
      if (session) {
        router.replace('/(tabs)/feed');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [session, isLoading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#fff" />
      <Text style={styles.text}>Loading COGNI v2...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
});
