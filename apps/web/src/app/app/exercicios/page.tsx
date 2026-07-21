import { ExerciseTrainer } from '@/components/exercises/exercise-trainer';

export default function ExercisesPage() {
  return (
    <ExerciseTrainer
      description="Resolva na ordem sugerida pelo seu progresso. Filtre por origem se quiser praticar só um bloco."
      guided
      showSourceFilter
      storageKey="xadrez.exercicios_session"
      title="Exercícios"
    />
  );
}
