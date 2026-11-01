import { CoursePlayer } from '@/components/course/course-player';

export default async function CourseActivityPage({
  params,
}: {
  params: Promise<{ atividade: string }>;
}) {
  const { atividade } = await params;
  // Keyed: moving to the next activity starts a fresh player.
  return <CoursePlayer activityId={atividade} key={atividade} />;
}
