import { LessonPlayer } from '@/components/lessons/lesson-player';

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <LessonPlayer lessonId={lessonId} />;
}
