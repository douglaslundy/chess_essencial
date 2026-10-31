import { LibraryStudyRoom } from '@/components/library/library-study-room';

export default async function LibraryGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <LibraryStudyRoom gameId={gameId} />;
}
