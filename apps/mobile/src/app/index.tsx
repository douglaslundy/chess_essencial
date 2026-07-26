import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function Index() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <SafeAreaView style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return <Redirect href={user ? '/(tabs)/jogar' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
