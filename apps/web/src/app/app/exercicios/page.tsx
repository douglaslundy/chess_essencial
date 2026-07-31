import { ExerciseTrainer } from '@/components/exercises/exercise-trainer';

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ exerciseId?: string; q?: string }>;
}) {
  const { exerciseId, q = '' } = await searchParams;
  return (
    <ExerciseTrainer
      description="Resolva na ordem sugerida pelo seu progresso. Filtre por origem se quiser praticar só um bloco."
      guided
      initialExerciseId={exerciseId}
      initialQuery={q}
      showSourceFilter
      storageKey="xadrez.exercicios_session"
      title="Exercícios"
    />
  );
}
