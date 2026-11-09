import { ClassroomExerciseWatch } from '@/components/classroom/classroom-watch';

export default async function ClassroomExercisePage({
  params,
  searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { exerciseId } = await params;
  const { m } = await searchParams;
  const moves = (m ?? '').split('-').filter((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move));
  return <ClassroomExerciseWatch exerciseId={exerciseId} moves={moves} />;
}
