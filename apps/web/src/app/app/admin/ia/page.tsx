'use client';

import type { AiProvider, AiProviderKey, AiProviderModel } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google (Gemini)',
  openai: 'OpenAI (GPT)',
};

const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini'];

function formatPrice(value: number | null) {
  return value === null ? 'preço indisponível' : `US$ ${value.toFixed(2)}/MTok`;
}

function formatTokens(value: number | null) {
  return value === null
    ? 'indisponível'
    : `${Math.round(value / 1000).toLocaleString('pt-BR')}k tokens`;
}

interface CardState {
  apiKeyDraft: string;
  busy: boolean;
  message: string;
  modelDraft: string;
  models: AiProviderModel[];
}

function emptyCardState(): CardState {
  return { apiKeyDraft: '', busy: false, message: '', modelDraft: '', models: [] };
}

export default function AdminAiProvidersPage() {
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>('anthropic');
  const [providers, setProviders] = useState<Record<AiProvider, AiProviderKey | null>>({
    anthropic: null,
    gemini: null,
    openai: null,
  });
  const [cards, setCards] = useState<Record<AiProvider, CardState>>({
    anthropic: emptyCardState(),
    gemini: emptyCardState(),
    openai: emptyCardState(),
  });
  const [loadMessage, setLoadMessage] = useState('Carregando provedores…');

  function load() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setLoadMessage('Entre com uma conta de administrador.');
      return;
    }
    api
      .adminListAiProviders(token)
      .then((list) => {
        const next: Record<AiProvider, AiProviderKey | null> = {
          anthropic: null,
          gemini: null,
          openai: null,
        };
        for (const entry of list) next[entry.provider] = entry;
        setProviders(next);
        setLoadMessage('');
        setCards((current) => {
          const updated = { ...current };
          for (const provider of PROVIDERS) {
            updated[provider] = { ...updated[provider], modelDraft: next[provider]?.model ?? '' };
          }
          return updated;
        });
      })
      .catch((error: unknown) =>
        setLoadMessage(error instanceof Error ? error.message : 'Falha ao carregar provedores.'),
      );
  }

  useEffect(() => {
    queueMicrotask(load);
  }, []);

  function updateCard(provider: AiProvider, patch: Partial<CardState>) {
    setCards((current) => ({ ...current, [provider]: { ...current[provider], ...patch } }));
  }

  async function validateKey(provider: AiProvider) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const card = cards[provider];
    updateCard(provider, { busy: true, message: 'Validando com o provedor…' });
    try {
      const { models } = await api.adminListAiProviderModels(
        provider,
        { apiKey: card.apiKeyDraft || undefined },
        token,
      );
      updateCard(provider, {
        busy: false,
        message: `${models.length} modelo(s) disponível(is) para esta conta.`,
        modelDraft: card.modelDraft || models[0]?.id || '',
        models,
      });
    } catch (error) {
      updateCard(provider, {
        busy: false,
        message: error instanceof Error ? error.message : 'Falha ao validar a chave.',
        models: [],
      });
    }
  }

  async function saveKey(provider: AiProvider) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const card = cards[provider];
    if (!card.modelDraft) {
      updateCard(provider, { message: 'Valide a chave e escolha um modelo antes de salvar.' });
      return;
    }
    updateCard(provider, { busy: true, message: 'Salvando…' });
    try {
      const updated = await api.adminUpdateAiProviderKey(
        provider,
        { apiKey: card.apiKeyDraft || undefined, model: card.modelDraft },
        token,
      );
      setProviders((current) => ({ ...current, [provider]: updated }));
      updateCard(provider, {
        apiKeyDraft: '',
        busy: false,
        message: 'Configuração salva.',
        models: updated.availableModels,
      });
    } catch (error) {
      updateCard(provider, {
        busy: false,
        message: error instanceof Error ? error.message : 'Falha ao salvar.',
      });
    }
  }

  async function setActive(provider: AiProvider, isActive: boolean) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    updateCard(provider, { busy: true });
    try {
      const updated = await api.adminSetAiProviderActive(provider, { isActive }, token);
      // Activating this one deactivates any other on the server — refresh everything.
      load();
      updateCard(provider, {
        busy: false,
        message: isActive ? 'Provedor ativado.' : 'Provedor desativado.',
      });
      void updated;
    } catch (error) {
      updateCard(provider, {
        busy: false,
        message: error instanceof Error ? error.message : 'Falha ao ativar/desativar.',
      });
    }
  }

  const current = providers[selectedProvider];
  const card = cards[selectedProvider];

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Administração</span>
        <h1>Provedores de inteligência artificial</h1>
        <p>
          Cadastre uma chave por provedor. Ao salvar, a chave é validada com uma chamada real ao
          provedor e criptografada antes de ser armazenada — ela nunca é reexibida depois de salva.
          Apenas um provedor pode ficar ativo por vez; ativar um desativa qualquer outro
          automaticamente. Você também pode deixar todos desativados.
        </p>
      </header>
      <p className={styles.status} role="status">
        {loadMessage}
      </p>
      <label className={styles.field}>
        Qual IA deseja configurar?
        <select
          onChange={(event) => setSelectedProvider(event.target.value as AiProvider)}
          value={selectedProvider}
        >
          {PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {PROVIDER_LABELS[provider]}
              {providers[provider]?.isActive ? ' — ativo' : ''}
            </option>
          ))}
        </select>
      </label>
      <section className={styles.card}>
        <h2>
          {PROVIDER_LABELS[selectedProvider]}
          {current?.isActive ? ' — ativo' : ''}
        </h2>
        {current?.lastValidationError ? (
          <p className={styles.status} role="status">
            Última validação falhou: {current.lastValidationError}
          </p>
        ) : null}
        <div className={styles.formGrid}>
          <label className={styles.field}>
            Chave de API
            <input
              onChange={(event) =>
                updateCard(selectedProvider, { apiKeyDraft: event.target.value })
              }
              placeholder={current?.hasApiKey ? `•••• ${current.keyPreview}` : 'Cole a chave aqui'}
              type="password"
              value={card.apiKeyDraft}
            />
          </label>
          <p className={styles.helpText}>
            {current?.hasApiKey
              ? `Chave configurada termina em "${current.keyPreview}" — compare com a chave que você está prestes a colar antes de substituir. Deixe o campo em branco para manter a atual e só trocar o modelo. Modelo atual: ${current.model ?? '—'}.`
              : 'Nenhuma chave configurada para este provedor ainda.'}
          </p>
          <button
            className={styles.primaryButton}
            disabled={card.busy || (!card.apiKeyDraft && !current?.hasApiKey)}
            onClick={() => void validateKey(selectedProvider)}
            type="button"
          >
            Validar e listar modelos
          </button>
          {card.models.length > 0 ? (
            <label className={styles.field}>
              Modelo
              <select
                onChange={(event) =>
                  updateCard(selectedProvider, { modelDraft: event.target.value })
                }
                value={card.modelDraft}
              >
                {card.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {card.models.length > 0 ? (
            <ul className={styles.helpText}>
              {card.models
                .filter((model) => model.id === card.modelDraft)
                .map((model) => (
                  <li key={model.id}>
                    Contexto: {formatTokens(model.metadata.contextWindowTokens)} · Saída máxima:{' '}
                    {formatTokens(model.metadata.maxOutputTokens)} · Entrada:{' '}
                    {formatPrice(model.metadata.inputPricePerMillionTokensUsd)} · Saída:{' '}
                    {formatPrice(model.metadata.outputPricePerMillionTokensUsd)}
                  </li>
                ))}
            </ul>
          ) : null}
          <button
            className={styles.primaryButton}
            disabled={card.busy || !card.modelDraft}
            onClick={() => void saveKey(selectedProvider)}
            type="button"
          >
            Salvar
          </button>
          {current?.hasApiKey ? (
            <button
              disabled={card.busy}
              onClick={() => void setActive(selectedProvider, !current.isActive)}
              type="button"
            >
              {current.isActive ? 'Desativar' : 'Usar este provedor'}
            </button>
          ) : null}
        </div>
        {card.message ? (
          <p className={styles.status} role="status">
            {card.message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
