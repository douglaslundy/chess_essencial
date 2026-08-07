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
  AiProviderKeyInvalidError,
  listModelsForProvider,
  type LiveModel,
} from './model-listing.js';

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
export class AiProvidersService implements OnModuleInit {
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
  async onModuleInit() {
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
    const row = await this.repository.getActive();
    if (!row?.encryptedApiKey || !row.model) return null;
    return {
      apiKey: decryptSecret(row.encryptedApiKey, this.encryptionKey()),
      model: row.model,
      provider: row.provider,
    };
  }
}
