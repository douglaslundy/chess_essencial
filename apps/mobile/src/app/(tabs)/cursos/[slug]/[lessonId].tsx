import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import type { LessonAttemptView } from '@xadrez/contracts';
import { ChessBoard } from '@/components/chess-board';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { coursesApi } from '@/lib/api/courses';
import { ApiProblem } from '@/lib/api/client';

// 'text'/'explanation'/'summary' passively advance with {type:'continue'}.
// 'board_instruction'/'checkpoint' expect {type:'move', uci}; 'checkpoint'
// always shows a board even without a recorded initialFen (mirrors the web
// lesson player, apps/web/src/components/lessons/lesson-player.tsx, which is
// the proven-working reference for this ambiguity). 'quiz' expects
// {type:'answer', value: string} — the web player always sends the raw
// trimmed string regardless of the step's real expected type, so this does
// the same rather than guessing a number/boolean conversion.
const PASSIVE_STEP_TYPES = new Set(['text', 'explanation', 'summary']);
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export default function LessonScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const theme = useTheme();
  const [attempt, setAttempt] = useState<LessonAttemptView | null>(null);
  const [pendingAttempt, setPendingAttempt] = useState<LessonAttemptView | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
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

  async function submitEvaluated(
    action: { type: 'answer'; value: string } | { type: 'move'; uci: string },
  ) {
    if (!attempt || pendingAttempt) return;
    setAdvancing(true);
    try {
      const value = await coursesApi.submitLessonAction(attempt.attemptId, action);
      setPendingAttempt(value);
      setPendingFeedback(value.feedback ?? 'Registrado.');
      setAnswer('');
    } catch (thrown) {
      setError(thrown instanceof ApiProblem ? thrown.message : 'Não foi possível enviar a ação.');
    } finally {
      setAdvancing(false);
    }
  }

  function acknowledgePending() {
    if (!pendingAttempt) return;
    setAttempt(pendingAttempt);
    setPendingAttempt(null);
    setPendingFeedback(null);
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
  const readOnly = Boolean(pendingAttempt);
  const showsBoard = step
    ? step.stepType === 'board_instruction' || step.stepType === 'checkpoint'
    : false;
  const showsQuizReferenceBoard = step
    ? step.stepType === 'quiz' && Boolean(step.initialFen)
    : false;

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

              {showsBoard || showsQuizReferenceBoard ? (
                <ChessBoard
                  disabled={readOnly || step.stepType === 'quiz'}
                  fen={step.initialFen ?? INITIAL_FEN}
                  onMove={(from, to, promotion) =>
                    void submitEvaluated({ type: 'move', uci: `${from}${to}${promotion ?? ''}` })
                  }
                />
              ) : null}

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
              ) : null}

              {step.stepType === 'quiz' && !readOnly ? (
                <>
                  <TextInput
                    editable={!advancing}
                    onChangeText={setAnswer}
                    placeholder="Sua resposta"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.answerInput,
                      { borderColor: theme.textSecondary, color: theme.text },
                    ]}
                    value={answer}
                  />
                  <Pressable
                    disabled={!answer.trim() || advancing}
                    onPress={() => void submitEvaluated({ type: 'answer', value: answer.trim() })}
                    style={({ pressed }) => [
                      styles.continueButton,
                      (pressed || advancing || !answer.trim()) && styles.continueButtonPressed,
                    ]}
                  >
                    <ThemedText type="smallBold">Responder</ThemedText>
                  </Pressable>
                </>
              ) : null}
            </>
          )}
        </ScrollView>

        <Modal animationType="fade" transparent visible={Boolean(pendingAttempt)}>
          <ThemedView style={styles.overlayBackdrop}>
            <ThemedView style={styles.overlayCard} type="backgroundElement">
              <ThemedText type="subtitle">Resultado registrado</ThemedText>
              <ThemedText type="default">{pendingFeedback}</ThemedText>
              <Pressable onPress={acknowledgePending} style={styles.continueButton}>
                <ThemedText type="smallBold">Continuar →</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  answerInput: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
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
  overlayBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  overlayCard: {
    borderRadius: Spacing.three,
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
  },
  safeArea: {
    flex: 1,
  },
});
