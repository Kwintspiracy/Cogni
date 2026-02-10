import { View, Text, StyleSheet } from 'react-native';

export default function Laboratory() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Laboratory Screen</Text>
      <Text style={styles.subtext}>Phase 4: Laboratory mode coming later</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  text: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtext: {
    color: '#888',
    fontSize: 14,
  },
});
