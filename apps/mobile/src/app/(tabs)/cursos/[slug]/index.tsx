import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import type { CourseDetail } from '@xadrez/contracts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { coursesApi } from '@/lib/api/courses';
import { ApiProblem } from '@/lib/api/client';

export default function CourseDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    coursesApi
      .getCourse(slug)
      .then((value) => {
        if (active) setCourse(value);
      })
      .catch((thrown) => {
        if (!active) return;
        setError(thrown instanceof ApiProblem ? thrown.message : 'Falha ao carregar o curso.');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="small">{error}</ThemedText>
      </ThemedView>
    );
  }

  if (!course) {
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
          data={course.modules}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <ThemedView style={styles.header}>
              <ThemedText type="title">{course.title}</ThemedText>
              <ThemedText type="small">{course.description}</ThemedText>
            </ThemedView>
          }
          renderItem={({ item: courseModule }) => (
            <ThemedView style={styles.moduleSection}>
              <ThemedText type="subtitle">{courseModule.title}</ThemedText>
              {courseModule.lessons.map((lesson) => (
                <Pressable
                  key={lesson.id}
                  onPress={() => router.push(`/cursos/${slug}/${lesson.id}`)}
                  style={({ pressed }) => [styles.lessonRow, pressed && styles.lessonRowPressed]}
                >
                  <ThemedText type="default">{lesson.title}</ThemedText>
                  <ThemedText themeColor="textSecondary" type="small">
                    {lesson.estimatedMinutes} min
                  </ThemedText>
                </Pressable>
              ))}
            </ThemedView>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  header: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  list: {
    padding: Spacing.three,
  },
  lessonRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#8888',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  lessonRowPressed: {
    opacity: 0.6,
  },
  moduleSection: {
    gap: Spacing.one,
    marginBottom: Spacing.four,
  },
  safeArea: {
    flex: 1,
  },
});
