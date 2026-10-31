'use client';

import type { AiProvider, AiProviderKey, AiProviderModel } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { webEnv } from '@/env';
import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google (Gemini)',
  openai: 'OpenAI (GPT)',
  chatgpt: 'ChatGPT (conta via OAuth)',
};

const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini', 'chatgpt'];
/** Models a ChatGPT plan can run; the test call confirms the account really has the chosen one. */
const CHATGPT_MODELS = ['gpt-5.5', 'gpt-5.5-mini', 'gpt-5.4', 'gpt-5.4-mini'];
const CHATGPT_REDIRECT_URI = `${webEnv.NEXT_PUBLIC_API_URL}/ai-providers/chatgpt/oauth/callback`;

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
    chatgpt: null,
    gemini: null,
    openai: null,
  });
  const [cards, setCards] = useState<Record<AiProvider, CardState>>({
    anthropic: emptyCardState(),
    chatgpt: emptyCardState(),
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
          chatgpt: null,
          gemini: null,
          openai: null,
        };
        for (const entry of list) next[entry.provider] = entry;
        setProviders(next);
        const active = list.find((entry) => entry.isActive);
        if (active) setSelectedProvider(active.provider);
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
    // Back from OpenAI's consent page: show how the connection went.
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('chatgpt');
    if (!outcome) return;
    queueMicrotask(() => {
      setSelectedProvider('chatgpt');
      updateCard('chatgpt', {
        message:
          outcome === 'conectado'
            ? 'Conta do ChatGPT conectada. Escolha o modelo, salve e teste a conexão.'
            : `Não foi possível conectar: ${params.get('detalhe') ?? 'erro desconhecido'}`,
      });
    });
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function connectChatgpt() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const clientId = cards.chatgpt.apiKeyDraft.trim() || providers.chatgpt?.oauthClientId || '';
    if (!clientId) {
      updateCard('chatgpt', { message: 'Informe o Client ID registrado na OpenAI.' });
      return;
    }
    updateCard('chatgpt', { busy: true, message: 'Abrindo a autorização da OpenAI…' });
    try {
      const { authorizeUrl } = await api.adminStartChatgptOAuth({ clientId }, token);
      window.location.assign(authorizeUrl);
    } catch (error) {
      updateCard('chatgpt', {
        busy: false,
        message: error instanceof Error ? error.message : 'Falha ao iniciar a conexão.',
      });
    }
  }

  async function disconnectChatgpt() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    updateCard('chatgpt', { busy: true });
    try {
      await api.adminDisconnectChatgpt(token);
      load();
      updateCard('chatgpt', { busy: false, message: 'Conta do ChatGPT desconectada.' });
    } catch (error) {
      updateCard('chatgpt', {
        busy: false,
        message: error instanceof Error ? error.message : 'Falha ao desconectar.',
      });
    }
  }

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

  async function testKey(provider: AiProvider) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    updateCard(provider, { busy: true, message: 'Testando conexão…' });
    try {
      const { generatedText } = await api.adminTestAiProviderKey(provider, token);
      updateCard(provider, { busy: false, message: `IA respondeu: "${generatedText}"` });
    } catch (error) {
      updateCard(provider, {
        busy: false,
        message: error instanceof Error ? error.message : 'Falha ao testar a conexão.',
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
  const activeProvider = PROVIDERS.find((provider) => providers[provider]?.isActive) ?? null;
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
      {loadMessage ? null : (
        <p
          className={`${styles.activeBanner} ${activeProvider ? '' : styles.activeBannerNone}`}
          role="status"
        >
          {activeProvider ? (
            <>
              <span>Provedor ativo</span>
              <strong>{PROVIDER_LABELS[activeProvider]}</strong>
              <span>modelo {providers[activeProvider]?.model}</span>
            </>
          ) : (
            <>
              <span>Provedor ativo</span>
              <strong>Nenhum</strong>
              <span>a IA está desligada na plataforma</span>
            </>
          )}
        </p>
      )}
      <div className={styles.inlineFieldRow}>
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
        {card.models.length > 0 ? (
          <label className={styles.field}>
            Modelo
            <select
              onChange={(event) => updateCard(selectedProvider, { modelDraft: event.target.value })}
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
      </div>
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
        {selectedProvider === 'chatgpt' ? (
          <div className={styles.formGrid}>
            <p className={styles.helpText}>
              Usa o plano do ChatGPT (Plus ou Pro) da conta conectada, sem chave de API. É uma opção
              ao lado das chaves: ative-a só quando quiser que a plataforma use esta conta. Requer
              um app OAuth registrado na OpenAI com o endereço de retorno abaixo.
            </p>
            <label className={styles.field}>
              Client ID (OpenAI)
              <input
                onChange={(event) => updateCard('chatgpt', { apiKeyDraft: event.target.value })}
                placeholder={current?.oauthClientId ?? 'Cole o Client ID do app OAuth'}
                value={card.apiKeyDraft}
              />
            </label>
            <label className={styles.field}>
              Endereço de retorno (cadastre no app OAuth)
              <input readOnly value={CHATGPT_REDIRECT_URI} />
            </label>
            <p className={styles.helpText}>
              {current?.hasApiKey
                ? `Conectado como ${current.keyPreview ?? 'conta ChatGPT'}. Modelo atual: ${current.model ?? '—'}.`
                : 'Nenhuma conta do ChatGPT conectada ainda.'}
            </p>
            <button
              className={styles.primaryButton}
              disabled={card.busy}
              onClick={() => void connectChatgpt()}
              style={{ alignSelf: 'start' }}
              type="button"
            >
              {current?.hasApiKey ? 'Reconectar com ChatGPT' : 'Conectar com ChatGPT'}
            </button>
            {current?.hasApiKey ? (
              <>
                <label className={styles.field}>
                  Modelo
                  <select
                    onChange={(event) => updateCard('chatgpt', { modelDraft: event.target.value })}
                    value={card.modelDraft || current.model || CHATGPT_MODELS[0]}
                  >
                    {CHATGPT_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={styles.primaryButton}
                  disabled={card.busy}
                  onClick={() => void saveKey('chatgpt')}
                  type="button"
                >
                  Salvar modelo
                </button>
                <button
                  className="adminActionButton"
                  disabled={card.busy}
                  onClick={() => void setActive('chatgpt', !current.isActive)}
                  type="button"
                >
                  {current.isActive ? 'Desativar' : 'Usar este provedor'}
                </button>
                <button
                  className="adminActionButton"
                  disabled={card.busy}
                  onClick={() => void testKey('chatgpt')}
                  type="button"
                >
                  Testar conexão
                </button>
                <button
                  className="adminActionButton"
                  disabled={card.busy}
                  onClick={() => void disconnectChatgpt()}
                  type="button"
                >
                  Desconectar
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Chave de API
              <input
                onChange={(event) =>
                  updateCard(selectedProvider, { apiKeyDraft: event.target.value })
                }
                placeholder={
                  current?.hasApiKey ? `•••• ${current.keyPreview}` : 'Cole a chave aqui'
                }
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
              style={{ alignSelf: 'start' }}
              type="button"
            >
              Validar e listar modelos
            </button>
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
                className="adminActionButton"
                disabled={card.busy}
                onClick={() => void setActive(selectedProvider, !current.isActive)}
                type="button"
              >
                {current.isActive ? 'Desativar' : 'Usar este provedor'}
              </button>
            ) : null}
            {current?.hasApiKey ? (
              <button
                className="adminActionButton"
                disabled={card.busy}
                onClick={() => void testKey(selectedProvider)}
                type="button"
              >
                Testar conexão
              </button>
            ) : null}
          </div>
        )}
        {card.message ? (
          <p className={styles.status} role="status">
            {card.message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
