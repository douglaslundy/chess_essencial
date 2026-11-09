import { ClassroomGameWatch } from '@/components/classroom/classroom-watch';

export default async function ClassroomGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  return <ClassroomGameWatch gameId={gameId} />;
}
