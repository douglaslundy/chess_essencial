// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RatingChart } from './rating-chart';

afterEach(cleanup);

describe('RatingChart', () => {
  it('asks for more games when there is no line to draw', () => {
    render(<RatingChart points={[{ date: '2026-11-01T10:00:00Z', rating: 1200 }]} />);
    expect(screen.getByText(/Jogue mais partidas/)).toBeTruthy();
  });

  it('draws one dot per game, green for a rise and red for a drop', () => {
    const { container } = render(
      <RatingChart
        points={[
          { date: '2026-11-01T10:00:00Z', rating: 1200 },
          { date: '2026-11-02T10:00:00Z', rating: 1216 },
          { date: '2026-11-03T10:00:00Z', rating: 1204 },
        ]}
      />,
    );
    const dots = [...container.querySelectorAll('circle')].map((dot) => dot.getAttribute('fill'));
    expect(dots).toEqual(['#7cc4ff', '#22c55e', '#ef4444']);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('de 1200 para 1204');
  });
});
