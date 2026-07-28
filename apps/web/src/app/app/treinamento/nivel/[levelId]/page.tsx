import { LevelDetail } from '@/components/learning-path/level-detail';

export default async function LearningLevelPage({
  params,
}: {
  params: Promise<{ levelId: string }>;
}) {
  const { levelId } = await params;
  return <LevelDetail levelId={levelId} />;
}
