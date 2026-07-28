import { StageRunner } from '@/components/learning-path/stage-runner';

export default async function LearningStagePage({
  params,
}: {
  params: Promise<{ stageId: string }>;
}) {
  const { stageId } = await params;
  return <StageRunner stageId={stageId} />;
}
