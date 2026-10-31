import {
  aiProviderSchema,
  lookupModelMetadata,
  type AiProvider,
  type AiProviderKey,
  type AiProviderTestResult,
  type UpdateAiProviderKeyInput,
} from '@xadrez/contracts';
import {
  BadRequestException,
  Injectable,
  type OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../observability/audit.service.js';
import { decryptSecret, encryptSecret, maskedKeyPreview } from '../common/crypto/secret-cipher.js';
import { SettingsRepository } from '../settings/settings.repository.js';
import { AiProvidersRepository, type AiProviderKeyRow } from './ai-providers.repository.js';
import { callLlm, LlmRequestError } from '../games/narration/llm-client.js';
import {
  authorizeUrlFor,
  ChatgptOAuthError,
  exchangeCode,
  newPendingAuthorization,
  refreshTokens,
  revokeRefreshToken,
  type ChatgptTokens,
  type PendingAuthorization,
} from './chatgpt-oauth.js';
import {
  AiProviderKeyInvalidError,
  CHATGPT_PLAN_MODELS,
  listModelsForProvider,
  type LiveModel,
} from './model-listing.js';

/** Renew the ChatGPT access token (1 h lifetime) well before it expires, so the worker always reads a valid one. */
const CHATGPT_REFRESH_MARGIN_MS = 20 * 60_000;
const CHATGPT_REFRESH_CHECK_MS = 5 * 60_000;

// Key this feature replaces (SP, 2026-07-26): a single JSON blob with a
// plaintext key, one provider at a time. Migrated once at boot, then never
// read again.
const LEGACY_NARRATION_AI_SETTINGS_KEY = 'ai.narration';

const TEST_CONNECTION_SYSTEM_PROMPT =
  'Você é um teste de conectividade da plataforma Xadrez Essencial.';
const TEST_CONNECTION_USER_MESSAGE =
  'Confirme em português, em até 20 palavras, que a conexão com você está funcionando.';

interface LegacyNarrationAiConfig {
  apiKey: string | null;
  model: string;
  provider: AiProvider;
}

@Injectable()
export class AiProvidersService implements OnModuleInit, OnModuleDestroy {
  private chatgptTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repository: AiProvidersRepository,
    private readonly legacySettings: SettingsRepository,
    private readonly config: ConfigService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private encryptionKey(): string {
    const key = this.config.get<string>('SETTINGS_ENCRYPTION_KEY');
    if (!key)
      throw new ServiceUnavailableException('Criptografia de segredos não está configurada.');
    return key;
  }

  /**
   * One-time carry-over of whatever was already configured in production
   * under the old single-provider mechanism, so this migration never
   * silently drops an admin's existing setup. Encrypts on the way in (the
   * old row was plaintext) and deletes the old row once migrated —
   * otherwise the whole point of adding encryption would be undermined by
   * a live plaintext copy sitting next to it.
   */
  onModuleDestroy() {
    if (this.chatgptTimer) clearInterval(this.chatgptTimer);
  }

  async onModuleInit() {
    this.chatgptTimer = setInterval(
      () => void this.refreshChatgptIfNeeded().catch(() => undefined),
      CHATGPT_REFRESH_CHECK_MS,
    );
    this.chatgptTimer.unref?.();
    // The whole method is best-effort: this runs on every app boot,
    // including test/CI environments with no real database connection at
    // all — a failure here (DB unreachable, encryption not configured yet)
    // must never take down app startup itself. If skipped, the legacy row
    // simply stays put and this is retried on the next restart.
    try {
      const legacy = await this.legacySettings.get<LegacyNarrationAiConfig>(
        LEGACY_NARRATION_AI_SETTINGS_KEY,
      );
      if (!legacy?.apiKey) return;
      const existing = await this.repository.get(legacy.provider);
      if (existing?.encryptedApiKey) return;
      const encryptedApiKey = encryptSecret(legacy.apiKey, this.encryptionKey());
      await this.repository.upsert(legacy.provider, {
        encryptedApiKey,
        keyPreview: maskedKeyPreview(legacy.apiKey),
        lastValidationError: null,
        model: legacy.model,
      });
      await this.repository.setActive(legacy.provider, true);
      await this.legacySettings.set(LEGACY_NARRATION_AI_SETTINGS_KEY, {}, 'system');
    } catch {
      // See comment above — intentionally swallowed.
    }
  }

  async list(): Promise<AiProviderKey[]> {
    const rows = await this.repository.list();
    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    return aiProviderSchema.options.map((provider) =>
      this.toPublic(provider, byProvider.get(provider) ?? null),
    );
  }

  private toPublic(provider: AiProvider, row: AiProviderKeyRow | null): AiProviderKey {
    return {
      availableModels: [],
      hasApiKey: Boolean(row?.encryptedApiKey),
      isActive: row?.isActive ?? false,
      keyPreview: row?.keyPreview ?? null,
      lastValidatedAt: row?.lastValidatedAt?.toISOString() ?? null,
      lastValidationError: row?.lastValidationError ?? null,
      model: row?.model ?? null,
      oauthClientId: row?.oauthClientId ?? null,
      provider,
    };
  }

  private resolvePlainApiKey(
    provider: AiProvider,
    row: AiProviderKeyRow | null,
    apiKey?: string,
  ): string {
    if (apiKey) return apiKey;
    if (!row?.encryptedApiKey) {
      throw new BadRequestException('Informe uma chave de API para este provedor.');
    }
    try {
      return decryptSecret(row.encryptedApiKey, this.encryptionKey());
    } catch {
      // decryptSecret() throws a raw, generic crypto error whenever
      // SETTINGS_ENCRYPTION_KEY no longer matches whatever it was when
      // this key was saved (e.g. the env var changed across a deploy) —
      // this used to propagate all the way up as an opaque 500 "erro
      // interno" with no actionable message. Never let that happen: the
      // fix here is for the admin to re-enter the key.
      throw new BadRequestException(
        'Não foi possível ler a chave já salva para este provedor (a configuração de criptografia pode ter mudado). Informe a chave novamente para continuar.',
      );
    }
  }

  private toPublicModels(
    provider: AiProvider,
    liveModels: LiveModel[],
  ): AiProviderKey['availableModels'] {
    return liveModels.map((model) => ({
      id: model.id,
      metadata: {
        ...lookupModelMetadata(provider, model.id),
        ...(model.contextWindowTokens ? { contextWindowTokens: model.contextWindowTokens } : {}),
        ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
      },
    }));
  }

  /**
   * Validates a key against the provider's real model-listing endpoint and
   * returns what's available — no persistence. This is the first step of
   * the admin UI flow: paste a key, see the real models for that account,
   * then pick one and call update() to actually save. Also used by
   * update() itself to re-validate at save time.
   */
  async listModels(
    provider: AiProvider,
    apiKey?: string,
  ): Promise<AiProviderKey['availableModels']> {
    const existing = await this.repository.get(provider);
    const plainApiKey = this.resolvePlainApiKey(provider, existing, apiKey);
    try {
      const liveModels = await listModelsForProvider(provider, plainApiKey);
      if (liveModels.length === 0) {
        throw new BadRequestException('Nenhum modelo disponível para esta chave/conta.');
      }
      return this.toPublicModels(provider, liveModels);
    } catch (error) {
      if (error instanceof AiProviderKeyInvalidError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  /**
   * Validates the key with a real call to the provider's model-listing
   * endpoint before ever persisting it — an invalid/expired/rate-limited
   * key never gets saved. Returns the models available to that account,
   * enriched with the static metadata catalog for whatever the provider's
   * own endpoint doesn't return (see packages/contracts/src/ai-providers.ts).
   */
  async update(
    provider: AiProvider,
    input: UpdateAiProviderKeyInput,
    actorUserId: string,
  ): Promise<AiProviderKey> {
    const existing = await this.repository.get(provider);
    if (provider === 'chatgpt') return this.updateChatgptModel(existing, input.model, actorUserId);
    const plainApiKey = this.resolvePlainApiKey(provider, existing, input.apiKey);

    let liveModels: LiveModel[];
    try {
      liveModels = await listModelsForProvider(provider, plainApiKey);
    } catch (error) {
      if (error instanceof AiProviderKeyInvalidError) {
        // Record why it failed (surfaced in the admin panel as
        // lastValidationError) WITHOUT ever persisting the invalid key
        // itself — passing null here relies on upsert()'s COALESCE to
        // keep whatever encrypted_api_key/key_preview were already
        // stored. The previous version encrypted and saved input.apiKey
        // even when it had just failed validation, silently overwriting
        // a working key with a broken one on a failed update attempt.
        await this.repository.upsert(provider, {
          encryptedApiKey: null,
          keyPreview: null,
          lastValidationError: error.message,
          model: input.model,
        });
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (liveModels.length === 0) {
      throw new BadRequestException('Nenhum modelo disponível para esta chave/conta.');
    }
    if (!liveModels.some((model) => model.id === input.model)) {
      throw new BadRequestException(
        `Modelo "${input.model}" não está disponível para esta chave. Escolha um dos modelos retornados.`,
      );
    }

    const row = await this.repository.upsert(provider, {
      encryptedApiKey: input.apiKey ? encryptSecret(input.apiKey, this.encryptionKey()) : null,
      keyPreview: input.apiKey ? maskedKeyPreview(input.apiKey) : (existing?.keyPreview ?? null),
      lastValidationError: null,
      model: input.model,
    });
    await this.audit?.record(
      actorUserId,
      'admin.ai_provider_key_updated',
      'ai_provider_key',
      provider,
      {
        hasKey: true,
        model: input.model,
      },
    );

    const publicModel = this.toPublic(provider, row);
    publicModel.availableModels = this.toPublicModels(provider, liveModels);
    return publicModel;
  }

  async setActive(
    provider: AiProvider,
    isActive: boolean,
    actorUserId: string,
  ): Promise<AiProviderKey> {
    const row = await this.repository.setActive(provider, isActive);
    await this.audit?.record(
      actorUserId,
      isActive ? 'admin.ai_provider_activated' : 'admin.ai_provider_deactivated',
      'ai_provider_key',
      provider,
      {},
    );
    return this.toPublic(provider, row);
  }

  /**
   * Makes one real completion call with the key already on file — proves
   * the saved key actually works end to end (not just that model-listing
   * accepts it), without changing anything in storage. Same
   * test-without-persisting shape as SettingsService#testMercadoPagoConnection().
   */
  async test(provider: AiProvider): Promise<AiProviderTestResult> {
    if (provider === 'chatgpt') await this.refreshChatgptIfNeeded();
    const existing = await this.repository.get(provider);
    if (!existing?.encryptedApiKey || !existing.model) {
      throw new BadRequestException(
        'Configure e salve uma chave e um modelo para este provedor antes de testar.',
      );
    }
    const plainApiKey = this.resolvePlainApiKey(provider, existing);
    try {
      const generatedText = await callLlm(
        { apiKey: plainApiKey, model: existing.model, provider },
        TEST_CONNECTION_SYSTEM_PROMPT,
        TEST_CONNECTION_USER_MESSAGE,
      );
      return { generatedText };
    } catch (error) {
      if (error instanceof LlmRequestError) throw new BadRequestException(error.message);
      if (error instanceof Error) {
        throw new BadRequestException(`Não foi possível contatar o provedor: ${error.message}`);
      }
      throw error;
    }
  }

  async resolveProviderConfig(provider: AiProvider): Promise<{
    apiKey: string;
    model: string;
    provider: AiProvider;
  } | null> {
    if (provider === 'chatgpt') await this.refreshChatgptIfNeeded().catch(() => undefined);
    const row = await this.repository.get(provider);
    if (!row?.encryptedApiKey || !row.model) return null;
    return {
      apiKey: this.resolvePlainApiKey(provider, row),
      model: row.model,
      provider,
    };
  }

  /** Used by narration-consuming code (game-narration-job's config comes from the DB directly instead — see there for why). */
  async resolveActiveConfig(): Promise<{
    apiKey: string;
    model: string;
    provider: AiProvider;
  } | null> {
    await this.refreshChatgptIfNeeded().catch(() => undefined);
    const row = await this.repository.getActive();
    if (!row?.encryptedApiKey || !row.model) return null;
    return {
      apiKey: decryptSecret(row.encryptedApiKey, this.encryptionKey()),
      model: row.model,
      provider: row.provider,
    };
  }

  // ---------- ChatGPT (OAuth) ----------

  private async updateChatgptModel(
    existing: AiProviderKeyRow | null,
    model: string,
    actorUserId: string,
  ): Promise<AiProviderKey> {
    if (!existing?.encryptedApiKey) {
      throw new BadRequestException('Conecte a conta do ChatGPT antes de escolher o modelo.');
    }
    const row = await this.repository.upsert('chatgpt', {
      encryptedApiKey: null,
      keyPreview: null,
      lastValidationError: null,
      model,
    });
    await this.audit?.record(
      actorUserId,
      'admin.ai_provider_key_updated',
      'ai_provider_key',
      'chatgpt',
      {
        model,
      },
    );
    const publicModel = this.toPublic('chatgpt', row);
    publicModel.availableModels = this.toPublicModels(
      'chatgpt',
      CHATGPT_PLAN_MODELS.map((id) => ({ contextWindowTokens: null, id, maxOutputTokens: null })),
    );
    return publicModel;
  }

  /** Step 1: PKCE state saved server-side; the admin's browser is sent to OpenAI's consent page. */
  async startChatgptOAuth(clientId: string, redirectUri: string, actorUserId: string) {
    const pending = newPendingAuthorization(clientId, redirectUri);
    await this.repository.saveChatgptPending(
      clientId,
      encryptSecret(JSON.stringify(pending), this.encryptionKey()),
    );
    await this.audit?.record(
      actorUserId,
      'admin.chatgpt_oauth_started',
      'ai_provider_key',
      'chatgpt',
      {},
    );
    return { authorizeUrl: authorizeUrlFor(pending), redirectUri };
  }

  /** Step 2 (OAuth callback): checks state, exchanges the code and stores the tokens encrypted. */
  async completeChatgptOAuth(code: string, state: string): Promise<void> {
    const row = await this.repository.getChatgptOAuth();
    if (!row?.encryptedOauthPending) {
      throw new ChatgptOAuthError(
        'Nenhuma conexão com o ChatGPT foi iniciada. Clique em Conectar de novo.',
      );
    }
    const pending = JSON.parse(
      decryptSecret(row.encryptedOauthPending, this.encryptionKey()),
    ) as PendingAuthorization;
    if (pending.state !== state)
      throw new ChatgptOAuthError('Resposta de autorização inválida (state).');
    if (pending.expiresAt < Date.now()) {
      throw new ChatgptOAuthError('A autorização expirou. Clique em Conectar de novo.');
    }
    try {
      await this.storeChatgptTokens(await exchangeCode(pending, code));
    } catch (error) {
      if (error instanceof Error) await this.repository.recordChatgptError(error.message);
      throw error;
    }
  }

  async disconnectChatgpt(actorUserId: string): Promise<void> {
    const row = await this.repository.getChatgptOAuth();
    if (row?.oauthClientId && row.encryptedRefreshToken) {
      await revokeRefreshToken(
        row.oauthClientId,
        decryptSecret(row.encryptedRefreshToken, this.encryptionKey()),
      );
    }
    await this.repository.clearChatgptTokens();
    await this.audit?.record(
      actorUserId,
      'admin.chatgpt_oauth_disconnected',
      'ai_provider_key',
      'chatgpt',
      {},
    );
  }

  /**
   * Renews the access token ahead of time. The worker renews too when it finds it expired; both
   * take the same database lock, so the rotating refresh token is never used twice.
   */
  async refreshChatgptIfNeeded(): Promise<void> {
    const peek = await this.repository.getChatgptOAuth();
    if (!peek?.encryptedRefreshToken || !peek.oauthClientId) return;
    if ((peek.accessTokenExpiresAt?.getTime() ?? 0) - Date.now() > CHATGPT_REFRESH_MARGIN_MS)
      return;
    await this.repository.withChatgptRefreshLock(async (row) => {
      // Re-checked under the lock: the worker may have just renewed it.
      if (!row?.encryptedRefreshToken || !row.oauthClientId) return;
      const expiresAt = row.accessTokenExpiresAt?.getTime() ?? 0;
      if (expiresAt - Date.now() > CHATGPT_REFRESH_MARGIN_MS) return;
      try {
        await this.storeChatgptTokens(
          await refreshTokens(
            row.oauthClientId,
            decryptSecret(row.encryptedRefreshToken, this.encryptionKey()),
          ),
        );
      } catch (error) {
        if (error instanceof Error) await this.repository.recordChatgptError(error.message);
        throw error;
      }
    });
  }

  private async storeChatgptTokens(tokens: ChatgptTokens): Promise<void> {
    const key = this.encryptionKey();
    await this.repository.saveChatgptTokens({
      accessTokenExpiresAt: tokens.expiresAt,
      encryptedAccessToken: encryptSecret(tokens.accessToken, key),
      encryptedRefreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken, key) : null,
      keyPreview: tokens.account ? tokens.account.slice(0, 12) : 'ChatGPT',
      model: CHATGPT_PLAN_MODELS[0]!,
    });
  }
}
