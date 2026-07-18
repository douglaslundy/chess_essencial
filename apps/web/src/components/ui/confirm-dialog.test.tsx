// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

const baseProps = {
  confirmLabel: 'Sim, desistir',
  description: 'A partida será encerrada.',
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
  open: true,
  title: 'Desistir da partida?',
};

describe('ConfirmDialog', () => {
  it('renders a styled accessible dialog and confirms the action', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} danger onConfirm={onConfirm} />);

    expect(screen.getByRole('alertdialog', { name: 'Desistir da partida?' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, desistir' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('cancels with Escape instead of relying on a native browser dialog', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
