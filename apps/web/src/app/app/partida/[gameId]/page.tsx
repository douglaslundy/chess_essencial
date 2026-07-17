import { GameRoom } from '@/components/game/game-room';

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <GameRoom gameId={gameId} />;
}
