export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export function challengeDifficultyForRating(rating: number): ChallengeDifficulty {
  if (rating < 1000) return 'beginner';
  if (rating < 1400) return 'intermediate';
  if (rating < 1800) return 'advanced';
  return 'expert';
}
