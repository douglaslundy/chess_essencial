import type { AiProvider } from '@xadrez/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export interface AiProviderKeyRow {
  encryptedApiKey: string | null;
  isActive: boolean;
  keyPreview: string | null;
  lastValidatedAt: Date | null;
  lastValidationError: string | null;
  model: string | null;
  provider: AiProvider;
}

@Injectable()
export class AiProvidersRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<AiProviderKeyRow[]> {
    return this.database.client<AiProviderKeyRow[]>`
      SELECT provider, encrypted_api_key AS "encryptedApiKey", key_preview AS "keyPreview",
        model, is_active AS "isActive", last_validated_at AS "lastValidatedAt",
        last_validation_error AS "lastValidationError"
      FROM ai_provider_keys
      ORDER BY provider
    `;
  }

  async get(provider: AiProvider): Promise<AiProviderKeyRow | null> {
    const [row] = await this.database.client<AiProviderKeyRow[]>`
      SELECT provider, encrypted_api_key AS "encryptedApiKey", key_preview AS "keyPreview",
        model, is_active AS "isActive", last_validated_at AS "lastValidatedAt",
        last_validation_error AS "lastValidationError"
      FROM ai_provider_keys
      WHERE provider = ${provider}
    `;
    return row ?? null;
  }

  async getActive(): Promise<AiProviderKeyRow | null> {
    const [row] = await this.database.client<AiProviderKeyRow[]>`
      SELECT provider, encrypted_api_key AS "encryptedApiKey", key_preview AS "keyPreview",
        model, is_active AS "isActive", last_validated_at AS "lastValidatedAt",
        last_validation_error AS "lastValidationError"
      FROM ai_provider_keys
      WHERE is_active = true
    `;
    return row ?? null;
  }

  /**
   * Saves a validated key/model. encryptedApiKey is left untouched (COALESCE)
   * when null — the "leave blank on update to keep the current key"
   * convention shared with SMTP/Mercado Pago.
   */
  async upsert(
    provider: AiProvider,
    fields: {
      encryptedApiKey: string | null;
      keyPreview: string | null;
      lastValidationError: string | null;
      model: string;
    },
  ): Promise<AiProviderKeyRow> {
    const [row] = await this.database.client<AiProviderKeyRow[]>`
      INSERT INTO ai_provider_keys (provider, encrypted_api_key, key_preview, model, last_validated_at, last_validation_error)
      VALUES (
        ${provider}, ${fields.encryptedApiKey}, ${fields.keyPreview}, ${fields.model}, now(), ${fields.lastValidationError}
      )
      ON CONFLICT (provider) DO UPDATE SET
        encrypted_api_key = COALESCE(EXCLUDED.encrypted_api_key, ai_provider_keys.encrypted_api_key),
        key_preview = COALESCE(EXCLUDED.key_preview, ai_provider_keys.key_preview),
        model = EXCLUDED.model,
        last_validated_at = now(),
        last_validation_error = EXCLUDED.last_validation_error,
        updated_at = now()
      RETURNING provider, encrypted_api_key AS "encryptedApiKey", key_preview AS "keyPreview",
        model, is_active AS "isActive", last_validated_at AS "lastValidatedAt",
        last_validation_error AS "lastValidationError"
    `;
    if (!row) throw new Error('Falha ao salvar a configuração do provedor.');
    return row;
  }

  /** Deactivating never touches other rows; activating deactivates every other row first, in the same transaction. */
  async setActive(provider: AiProvider, isActive: boolean): Promise<AiProviderKeyRow> {
    return this.database.client.begin(async (transaction) => {
      const [existing] = await transaction<{ hasKey: boolean }[]>`
        SELECT (encrypted_api_key IS NOT NULL) AS "hasKey" FROM ai_provider_keys WHERE provider = ${provider}
      `;
      if (!existing) {
        throw new NotFoundException('Configure uma chave para este provedor antes de ativá-lo.');
      }
      if (isActive && !existing.hasKey) {
        throw new NotFoundException(
          'Configure uma chave válida para este provedor antes de ativá-lo.',
        );
      }
      if (isActive) {
        await transaction`
          UPDATE ai_provider_keys SET is_active = false, updated_at = now()
          WHERE is_active = true AND provider != ${provider}
        `;
      }
      const [row] = await transaction<AiProviderKeyRow[]>`
        UPDATE ai_provider_keys SET is_active = ${isActive}, updated_at = now()
        WHERE provider = ${provider}
        RETURNING provider, encrypted_api_key AS "encryptedApiKey", key_preview AS "keyPreview",
          model, is_active AS "isActive", last_validated_at AS "lastValidatedAt",
          last_validation_error AS "lastValidationError"
      `;
      if (!row) throw new NotFoundException('Provedor não encontrado.');
      return row;
    });
  }
}
