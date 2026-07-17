import { ReviewRoom } from '@/components/history/review-room';

export default async function ReviewPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <ReviewRoom gameId={gameId} />;
}
