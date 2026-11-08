import { OpeningStudy } from '@/components/openings/opening-study';

export default async function OpeningPage({ params }: { params: Promise<{ openingId: string }> }) {
  const { openingId } = await params;
  return <OpeningStudy openingId={openingId} />;
}
