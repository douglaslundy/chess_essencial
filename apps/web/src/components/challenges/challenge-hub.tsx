'use client';

import { useEffect, useState } from 'react';

import { ExerciseTrainer } from '@/components/exercises/exercise-trainer';
import { api } from '@/lib/api/client';

import { challengeDifficultyForRating, type ChallengeDifficulty } from './challenge-level';
import styles from './challenge-hub.module.css';

const techniques = [
  {
    key: 'mate_em_um',
    label: 'Mate em um',
    detail: 'Encontre o golpe final imediato.',
    difficulty: 'beginner',
  },
  {
    key: 'salvar_o_rei',
    label: 'Salvar o rei',
    detail: 'Defenda-se de um xeque corretamente.',
    difficulty: 'beginner',
  },
  {
    key: 'garfo',
    label: 'Garfos',
    detail: 'Ataque dois alvos ao mesmo tempo.',
    difficulty: 'intermediate',
  },
  {
    key: 'cravada_absoluta',
    label: 'Cravadas',
    detail: 'Imobilize uma peça ligada ao rei.',
    difficulty: 'intermediate',
  },
  {
    key: 'mate_em_dois',
    label: 'Mate em dois',
    detail: 'Calcule a sequência forçada completa.',
    difficulty: 'advanced',
  },
  {
    key: 'espeto',
    label: 'Espetos',
    detail: 'Force a peça valiosa a sair da linha.',
    difficulty: 'advanced',
  },
  {
    key: 'ataque_descoberto',
    label: 'Ataque descoberto',
    detail: 'Abra uma linha com ganho de tempo.',
    difficulty: 'expert',
  },
  {
    key: 'xeque_duplo',
    label: 'Xeque duplo',
    detail: 'Ataque o rei com duas peças de uma vez.',
    difficulty: 'expert',
  },
] as const;

export function ChallengeHub() {
  const [technique, setTechnique] = useState<(typeof techniques)[number]>(techniques[0]);
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>('beginner');
  const [ratingNote, setRatingNote] = useState('Usando a faixa inicial até carregar seu rating.');
  const availableTechniques = techniques.filter((item) => item.difficulty === difficulty);

  function selectDifficulty(next: ChallengeDifficulty) {
    const first = techniques.find((item) => item.difficulty === next);
    setDifficulty(next);
    if (first) setTechnique(first);
  }

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    api
      .getRatings(token)
      .then((profiles) => {
        const rapid = profiles.find((profile) => profile.pool === 'rapid');
        const reference = rapid ?? profiles.toSorted((a, b) => b.gamesCount - a.gamesCount)[0];
        if (!reference) return;
        selectDifficulty(challengeDifficultyForRating(reference.rating));
        setRatingNote(`Faixa sugerida pelo seu rating ${reference.rating} em ${reference.pool}.`);
      })
      .catch(() => setRatingNote('Escolha manualmente a dificuldade desejada.'));
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Treino no tabuleiro</span>
        <h1>Desafios</h1>
        <p>
          Resolva posições jogáveis por técnica. As tentativas, dicas e resultados são avaliados e
          registrados pelo servidor.
        </p>
      </header>
      <label className={styles.settings}>
        Dificuldade por rating
        <select
          onChange={(event) => selectDifficulty(event.target.value as ChallengeDifficulty)}
          value={difficulty}
        >
          <option value="beginner">Iniciante · até 999</option>
          <option value="intermediate">Intermediário · 1000–1399</option>
          <option value="advanced">Avançado · 1400–1799</option>
          <option value="expert">Especialista · 1800+</option>
        </select>
        <small className={styles.ratingNote}>{ratingNote}</small>
      </label>
      <section className={styles.techniques} aria-label="Tipos de desafio">
        {availableTechniques.map((item) => (
          <button
            aria-pressed={technique.key === item.key}
            key={item.key}
            onClick={() => setTechnique(item)}
            type="button"
          >
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </button>
        ))}
      </section>
      <div className={styles.trainer}>
        <ExerciseTrainer
          description={`${technique.detail} O nível selecionado corresponde à faixa de rating escolhida.`}
          initialDifficulty={difficulty}
          initialQuery={technique.key}
          key={`${technique.key}-${difficulty}`}
          positionType="legal_position"
          title={technique.label}
        />
      </div>
    </main>
  );
}
