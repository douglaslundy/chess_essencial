const challengeLines: Readonly<Record<string, readonly string[]>> = {
  '11000000-0000-4000-8000-000000000001': ['e1e8'],
  '11000000-0000-4000-8000-000000000002': ['e6g8', 'f8g8', 'h6f7'],
  '11000000-0000-4000-8000-000000000003': ['f1e2'],
  '11000000-0000-4000-8000-000000000004': ['b5c7'],
  '11000000-0000-4000-8000-000000000005': ['c4b5'],
  '11000000-0000-4000-8000-000000000006': ['a1a5'],
  '11000000-0000-4000-8000-000000000007': ['d3h7'],
  '11000000-0000-4000-8000-000000000008': ['d3b5'],
};

export function guidedChallengeLine(exerciseId: string): readonly string[] | null {
  return challengeLines[exerciseId] ?? null;
}
