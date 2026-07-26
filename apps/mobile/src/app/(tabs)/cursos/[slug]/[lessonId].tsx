import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import type { LessonAttemptView } from '@xadrez/contracts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { coursesApi } from '@/lib/api/courses';
import { ApiProblem } from '@/lib/api/client';

// Only 'text'/'explanation'/'summary' steps can be passively advanced with a
// {type:'continue'} action (enforced server-side); 'quiz'/'board_instruction'/
// 'checkpoint' need an actual answer or move, which this read-only pass does
// not build (see mobile-jogar's chessboard work) — those steps just show
// their content with a note instead of a continue button.
const PASSIVE_STEP_TYPES = new Set(['text', 'explanation', 'summary']);

export default function LessonScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const [attempt, setAttempt] = useState<LessonAttemptView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    let active = true;
    coursesApi
      .startLessonAttempt(lessonId)
      .then((value) => {
        if (active) setAttempt(value);
      })
      .catch((thrown) => {
        if (!active) return;
        setError(thrown instanceof ApiProblem ? thrown.message : 'Falha ao carregar a aula.');
      });
    return () => {
      active = false;
    };
  }, [lessonId]);

  async function continueStep() {
    if (!attempt) return;
    setAdvancing(true);
    try {
      setAttempt(await coursesApi.submitLessonAction(attempt.attemptId, { type: 'continue' }));
    } catch (thrown) {
      setError(thrown instanceof ApiProblem ? thrown.message : 'Falha ao avançar a aula.');
    } finally {
      setAdvancing(false);
    }
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="small">{error}</ThemedText>
      </ThemedView>
    );
  }

  if (!attempt) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  const step = attempt.currentStep;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText themeColor="textSecondary" type="small">
            {attempt.progress.completedSteps} de {attempt.progress.totalSteps} etapas
          </ThemedText>

          {!step ? (
            <ThemedText type="title">
              {attempt.status === 'completed' ? 'Aula concluída! 🎉' : 'Aula encerrada.'}
            </ThemedText>
          ) : (
            <>
              {step.title ? <ThemedText type="subtitle">{step.title}</ThemedText> : null}
              <ThemedText type="default">{step.bodyMd}</ThemedText>

              {PASSIVE_STEP_TYPES.has(step.stepType) ? (
                <Pressable
                  disabled={advancing}
                  onPress={() => void continueStep()}
                  style={({ pressed }) => [
                    styles.continueButton,
                    (pressed || advancing) && styles.continueButtonPressed,
                  ]}
                >
                  <ThemedText type="smallBold">Continuar</ThemedText>
                </Pressable>
              ) : (
                <ThemedText themeColor="textSecondary" type="small">
                  Essa parte é interativa (responder/jogar) — abra pelo site para continuar por
                  enquanto.
                </ThemedText>
              )}
            </>
          )}
        </ScrollView>
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
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
  continueButtonPressed: {
    opacity: 0.7,
  },
  safeArea: {
    flex: 1,
  },
});
