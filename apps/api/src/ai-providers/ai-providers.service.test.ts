import type { AiProvider } from '@xadrez/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiProviderKeyRow } from './ai-providers.repository.js';
import { AiProvidersService } from './ai-providers.service.js';

vi.mock('./model-listing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./model-listing.js')>();
  return { ...actual, listModelsForProvider: vi.fn() };
});

vi.mock('../games/narration/llm-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../games/narration/llm-client.js')>();
  return { ...actual, callLlm: vi.fn() };
});

import { AiProviderKeyInvalidError, listModelsForProvider } from './model-listing.js';
import { callLlm, LlmRequestError } from '../games/narration/llm-client.js';

const mockedListModels = vi.mocked(listModelsForProvider);
const mockedCallLlm = vi.mocked(callLlm);

import { encryptSecret } from '../common/crypto/secret-cipher.js';

const testEncryptionKey = 'unit-test-encryption-key';
function seededKey(plaintext: string) {
  return encryptSecret(plaintext, testEncryptionKey);
}

afterEach(() => {
  mockedListModels.mockReset();
  mockedCallLlm.mockReset();
});

class FakeAiProvidersRepository {
  rows = new Map<AiProvider, AiProviderKeyRow>();

  async get(provider: AiProvider): Promise<AiProviderKeyRow | null> {
    return this.rows.get(provider) ?? null;
  }

  // Mirrors the real repository's ON CONFLICT ... COALESCE(...) behavior:
  // a null encryptedApiKey/keyPreview in the update never wipes what was
  // already stored.
  async upsert(
    provider: AiProvider,
    fields: {
      encryptedApiKey: string | null;
      keyPreview: string | null;
      lastValidationError: string | null;
      model: string;
    },
  ): Promise<AiProviderKeyRow> {
    const existing = this.rows.get(provider) ?? null;
    const row: AiProviderKeyRow = {
      encryptedApiKey: fields.encryptedApiKey ?? existing?.encryptedApiKey ?? null,
      isActive: existing?.isActive ?? false,
      keyPreview: fields.keyPreview ?? existing?.keyPreview ?? null,
      lastValidatedAt: new Date(),
      lastValidationError: fields.lastValidationError,
      model: fields.model,
      provider,
    };
    this.rows.set(provider, row);
    return row;
  }
}

function service(repository: FakeAiProvidersRepository) {
  const config = { get: () => 'unit-test-encryption-key' };
  return new AiProvidersService(repository as never, {} as never, config as never);
}

describe('AiProvidersService.update', () => {
  it('never overwrites an already-working key when the new one fails validation', async () => {
    const repository = new FakeAiProvidersRepository();
    repository.rows.set('openai', {
      encryptedApiKey: 'original-encrypted-value',
      isActive: true,
      keyPreview: 'origi',
      lastValidatedAt: new Date(),
      lastValidationError: null,
      model: 'gpt-5.6-luna',
      provider: 'openai',
    });
    mockedListModels.mockRejectedValue(
      new AiProviderKeyInvalidError('openai', 401, 'Chave de API inválida ou sem permissão.'),
    );

    await expect(
      service(repository).update(
        'openai',
        { apiKey: 'sk-a-new-but-broken-key', model: 'gpt-5.6-luna' },
        'admin-1',
      ),
    ).rejects.toThrow('Chave de API inválida ou sem permissão.');

    const row = repository.rows.get('openai')!;
    expect(row.encryptedApiKey).toBe('original-encrypted-value');
    expect(row.keyPreview).toBe('origi');
    expect(row.lastValidationError).toBe('Chave de API inválida ou sem permissão.');
  });

  it('records the validation failure for a brand-new provider without ever storing the invalid key', async () => {
    const repository = new FakeAiProvidersRepository();
    mockedListModels.mockRejectedValue(
      new AiProviderKeyInvalidError('gemini', 401, 'Chave de API inválida ou sem permissão.'),
    );

    await expect(
      service(repository).update(
        'gemini',
        { apiKey: 'sk-brand-new-broken', model: 'gemini-3-pro' },
        'admin-1',
      ),
    ).rejects.toThrow('Chave de API inválida ou sem permissão.');

    const row = repository.rows.get('gemini')!;
    expect(row.encryptedApiKey).toBeNull();
    expect(row.keyPreview).toBeNull();
  });

  it('reports a clean, actionable error instead of a bare 500 when the stored key can no longer be decrypted', async () => {
    const repository = new FakeAiProvidersRepository();
    // Not valid ciphertext for any key at all - the same failure shape a
    // SETTINGS_ENCRYPTION_KEY mismatch produces.
    repository.rows.set('anthropic', {
      encryptedApiKey: 'not-real-ciphertext',
      isActive: false,
      keyPreview: 'xxxxx',
      lastValidatedAt: null,
      lastValidationError: null,
      model: 'claude-sonnet-5',
      provider: 'anthropic',
    });

    // Omitting apiKey is the "keep the current key, just change the
    // model" flow the admin UI tells admins to use.
    await expect(
      service(repository).update('anthropic', { model: 'claude-sonnet-5' }, 'admin-1'),
    ).rejects.toThrow(/chave|criptografia/i);

    // Must fail before ever attempting the real provider call.
    expect(mockedListModels).not.toHaveBeenCalled();
    // The unreadable row is left untouched.
    expect(repository.rows.get('anthropic')!.encryptedApiKey).toBe('not-real-ciphertext');
  });
});

describe('AiProvidersService.test', () => {
  it('refuses to test a provider with no key/model configured', async () => {
    const repository = new FakeAiProvidersRepository();

    await expect(service(repository).test('gemini')).rejects.toThrow(/configure e salve/i);
    expect(mockedCallLlm).not.toHaveBeenCalled();
  });

  it('reports a clean, actionable error instead of a bare 500 when the stored key can no longer be decrypted', async () => {
    const repository = new FakeAiProvidersRepository();
    repository.rows.set('anthropic', {
      encryptedApiKey: 'not-real-ciphertext',
      isActive: false,
      keyPreview: 'xxxxx',
      lastValidatedAt: null,
      lastValidationError: null,
      model: 'claude-sonnet-5',
      provider: 'anthropic',
    });

    await expect(service(repository).test('anthropic')).rejects.toThrow(/chave|criptografia/i);
    expect(mockedCallLlm).not.toHaveBeenCalled();
  });

  it("propagates the provider's real error message instead of a bare 500", async () => {
    const repository = new FakeAiProvidersRepository();
    repository.rows.set('openai', {
      encryptedApiKey: seededKey('sk-any-test-value'),
      isActive: false,
      keyPreview: 'aaaaa',
      lastValidatedAt: null,
      lastValidationError: null,
      model: 'gpt-5.6-luna',
      provider: 'openai',
    });
    mockedCallLlm.mockRejectedValue(new LlmRequestError('OpenAI API respondeu 401: invalid key'));

    await expect(service(repository).test('openai')).rejects.toThrow(
      'OpenAI API respondeu 401: invalid key',
    );
  });

  it('reports a clean message instead of a bare 500 when the provider call fails at the transport level (timeout/network)', async () => {
    const repository = new FakeAiProvidersRepository();
    repository.rows.set('openai', {
      encryptedApiKey: seededKey('sk-any-test-value'),
      isActive: false,
      keyPreview: 'aaaaa',
      lastValidatedAt: null,
      lastValidationError: null,
      model: 'gpt-5.6-luna',
      provider: 'openai',
    });
    mockedCallLlm.mockRejectedValue(new Error('fetch failed'));

    await expect(service(repository).test('openai')).rejects.toThrow(/não foi possível contatar/i);
  });

  it('returns the real generated text on success', async () => {
    const repository = new FakeAiProvidersRepository();
    repository.rows.set('gemini', {
      encryptedApiKey: seededKey('sk-any-test-value'),
      isActive: true,
      keyPreview: 'bbbbb',
      lastValidatedAt: new Date(),
      lastValidationError: null,
      model: 'gemini-2.5-flash',
      provider: 'gemini',
    });
    mockedCallLlm.mockResolvedValue('Conexão funcionando, tudo certo!');

    const result = await service(repository).test('gemini');

    expect(result).toEqual({ generatedText: 'Conexão funcionando, tudo certo!' });
    expect(mockedCallLlm).toHaveBeenCalledTimes(1);
    expect(mockedCallLlm.mock.calls[0]![0]).toMatchObject({
      model: 'gemini-2.5-flash',
      provider: 'gemini',
    });
  });
});
