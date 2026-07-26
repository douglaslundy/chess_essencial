import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import type { CourseSummary } from '@xadrez/contracts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { coursesApi } from '@/lib/api/courses';
import { ApiProblem } from '@/lib/api/client';

export default function CursosScreen() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    coursesApi
      .listCourses()
      .then((value) => {
        if (active) setCourses(value);
      })
      .catch((thrown) => {
        if (!active) return;
        setError(thrown instanceof ApiProblem ? thrown.message : 'Falha ao carregar cursos.');
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="small">{error}</ThemedText>
      </ThemedView>
    );
  }

  if (!courses) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
        <FlatList
          contentContainerStyle={styles.list}
          data={courses}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<ThemedText type="small">Nenhum curso disponível ainda.</ThemedText>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/cursos/${item.slug}`)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <ThemedText type="subtitle">{item.title}</ThemedText>
              {item.description ? <ThemedText type="small">{item.description}</ThemedText> : null}
              <ThemedText themeColor="textSecondary" type="small">
                {item.moduleCount} módulo{item.moduleCount === 1 ? '' : 's'}
              </ThemedText>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8888',
    gap: Spacing.one,
    padding: Spacing.three,
  },
  cardPressed: {
    opacity: 0.6,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  list: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  safeArea: {
    flex: 1,
  },
});
