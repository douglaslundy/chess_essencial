// @vitest-environment jsdom
import type { ModerationReportDetail } from '@xadrez/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AdminReportsPage from './page';

const apiMocks = vi.hoisted(() => ({
  adminGetReport: vi.fn(),
  adminListReports: vi.fn(),
  adminModerateReport: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({ api: apiMocks }));

const report: ModerationReportDetail = {
  category: 'harassment',
  createdAt: '2026-07-31T10:00:00.000Z',
  description: 'Conduta inadequada',
  gameId: null,
  history: [
    {
      actor: null,
      createdAt: '2026-07-31T10:00:00.000Z',
      fromStatus: null,
      id: 1,
      note: 'Denúncia criada',
      toStatus: 'open',
    },
  ],
  id: '018f0000-0000-7000-8000-000000000001',
  overdue: false,
  reportedUser: { id: '018f0000-0000-7000-8000-000000000002', username: 'reported' },
  reporter: { id: '018f0000-0000-7000-8000-000000000003', username: 'reporter' },
  resolution: null,
  resolvedAt: null,
  resolvedBy: null,
  slaDueAt: '2026-08-03T10:00:00.000Z',
  status: 'open',
  updatedAt: '2026-07-31T10:00:00.000Z',
};

beforeEach(() => {
  window.localStorage.setItem('xadrez.access_token', 'admin-token');
  apiMocks.adminListReports.mockResolvedValue({ items: [report], total: 1 });
  apiMocks.adminGetReport.mockResolvedValue(report);
  apiMocks.adminModerateReport.mockResolvedValue({ ...report, status: 'reviewing' });
});

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('AdminReportsPage', () => {
  it('opens a report and starts its audited review', async () => {
    render(<AdminReportsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Aberta · harassment/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar análise' }));
    await waitFor(() =>
      expect(apiMocks.adminModerateReport).toHaveBeenCalledWith(
        report.id,
        { note: undefined, status: 'reviewing' },
        'admin-token',
      ),
    );
  });
});
