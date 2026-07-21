'use client';

import { ExerciseTrainer } from '@/components/exercises/exercise-trainer';
import styles from './challenge-hub.module.css';

export function ChallengeHub() {
  return (
    <main className={styles.page}>
      <ExerciseTrainer
        description="Comece pelo desafio mais simples. Cada acerto libera automaticamente o próximo nível."
        guided
        initialQuery="challenge"
        positionType="legal_position"
        storageKey="xadrez.desafios_session"
        title="Desafios progressivos"
      />
    </main>
  );
}
