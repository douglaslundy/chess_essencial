// @vitest-environment jsdom
import type { AiProviderKey } from '@xadrez/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AdminAiProvidersPage from './page';

const apiMocks = vi.hoisted(() => ({
  adminListAiProviders: vi.fn(),
  adminTestAiProviderKey: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    adminListAiProviders: (...args: unknown[]) => apiMocks.adminListAiProviders(...args),
    adminTestAiProviderKey: (...args: unknown[]) => apiMocks.adminTestAiProviderKey(...args),
  },
}));

const configuredProvider: AiProviderKey = {
  availableModels: [],
  hasApiKey: true,
  isActive: true,
  keyPreview: 'abcde',
  lastValidatedAt: null,
  lastValidationError: null,
  model: 'claude-sonnet-5',
  provider: 'anthropic',
};

beforeEach(() => {
  window.localStorage.setItem('xadrez.access_token', 'admin-token');
  apiMocks.adminListAiProviders.mockResolvedValue([configuredProvider]);
});

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('AdminAiProvidersPage test connection', () => {
  it('calls the saved-provider test endpoint and displays the generated response', async () => {
    apiMocks.adminTestAiProviderKey.mockResolvedValue({
      generatedText: 'Conexão funcionando corretamente.',
    });

    render(<AdminAiProvidersPage />);

    const button = await screen.findByRole('button', { name: 'Testar conexão' });
    fireEvent.click(button);

    await waitFor(() =>
      expect(apiMocks.adminTestAiProviderKey).toHaveBeenCalledWith('anthropic', 'admin-token'),
    );
    expect(await screen.findByText(/IA respondeu:.*Conexão funcionando corretamente/)).toBeTruthy();
  });

  it('shows the actionable API error and enables the button again after a failed test', async () => {
    apiMocks.adminTestAiProviderKey.mockRejectedValue(
      new Error('OpenAI API respondeu 401: chave inválida'),
    );

    render(<AdminAiProvidersPage />);

    const button = await screen.findByRole('button', { name: 'Testar conexão' });
    fireEvent.click(button);

    expect(await screen.findByText('OpenAI API respondeu 401: chave inválida')).toBeTruthy();
    expect(button.hasAttribute('disabled')).toBe(false);
  });
});
