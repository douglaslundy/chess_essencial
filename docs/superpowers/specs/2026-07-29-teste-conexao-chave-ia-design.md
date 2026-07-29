# Botão de teste de conexão para chaves de IA

Data: 2026-07-29

## Contexto

O usuário reportou "erro ao gravar a chave da inteligência artificial" em produção.
Investigação (log real do servidor via SSH, só leitura) achou a causa raiz: `DatabaseService`
compartilhava uma conexão Postgres entre queries cruas e o Drizzle ORM, e o Drizzle desliga
globalmente a conversão de colunas de data/hora nessa conexão como efeito colateral — a chave
era salva corretamente, mas a resposta HTTP quebrava depois, mostrando "erro interno". Corrigido
separadamente (commit `0b8c0f7`), sem relação com este documento.

No mesmo pedido, o usuário confirmou que o cadastro de uma chave por provedor (Anthropic/OpenAI/
Gemini) e a escolha de qual ativar **já existem** em `/app/admin/ia` — e pediu, além disso, um
botão de teste que confirme que a chave configurada realmente funciona.

## Decisões (confirmadas com o usuário via perguntas de múltipla escolha)

- O teste deve gerar um texto de verdade pela IA (chamada real de chat/completion), não só
  listar os modelos disponíveis — a página já tem "Validar e listar modelos", que faz uma
  chamada real mas não prova que a geração de texto funciona ponta a ponta.
- Um botão "Testar" por card de provedor, testando a chave **já salva** no banco (não uma chave
  recém-colada), disponível para qualquer provedor com chave configurada — não só o ativo no
  momento.
- O resultado exibido é o texto literal gerado pela IA (não só "sucesso"/"falha" genérico) —
  prova visual de que a chamada funcionou de verdade.

## Design

### Backend

Novo endpoint `POST /admin/ai-providers/:provider/test` (mesmo `AdminGuard` dos outros endpoints
desta área).

`AiProvidersService.test(provider: AiProvider): Promise<{ generatedText: string }>`:

1. Busca a linha salva do provedor. Se não houver chave ou modelo configurado, `BadRequestException`
   pedindo para configurar e salvar antes de testar.
2. Descriptografa a chave salva, reaproveitando a mesma mensagem de erro já usada em
   `resolvePlainApiKey()` quando a criptografia não bate mais (`SETTINGS_ENCRYPTION_KEY` mudou).
3. Chama `callLlm()` (já existe em `apps/api/src/games/narration/llm-client.ts`, despacho
   Anthropic/OpenAI/Gemini com timeout de 12s) com um prompt fixo e curto pedindo uma confirmação
   de conexão em poucas palavras.
4. Erros do provedor (`LlmRequestError`) viram `BadRequestException` com a mensagem real do
   provedor — nunca "erro interno".
5. **Não persiste nada** — mesmo padrão de `SettingsService#testMercadoPagoConnection()` (só
   testa, não grava estado). Sem novo campo no contrato de resposta salva (`AiProviderKey`).

Contrato novo em `packages/contracts/src/ai-providers.ts`:
`aiProviderTestResultSchema = z.object({ generatedText: z.string() })`.

### Frontend (`/app/admin/ia`)

- Novo `api.adminTestAiProviderKey(provider, token)` em `apps/web/src/lib/api/client.ts`.
- Botão "Testar" no card do provedor, ao lado de "Usar este provedor"/"Desativar" — visível
  sempre que `current?.hasApiKey` for verdadeiro (mesma condição já usada pelo botão de
  ativar/desativar), independente do provedor estar ativo ou não.
- Ao clicar, mostra o texto devolvido (ou o erro real) na área de mensagem do card já existente
  (`card.message`), reaproveitando o mesmo estado `busy`.

### Custo/efeito colateral, explícito para o usuário

Cada clique em "Testar" é uma chamada real e paga ao provedor (poucos tokens, mesmo timeout de
12s do `callLlm`). Não há limite de cliques nem cooldown nesta v1 — YAGNI até haver sinal de
abuso real (só admins têm acesso a esta página).

### Testes

- Unitário (`ai-providers.service.test.ts`): repositório mockado + `callLlm` mockado — cobre
  "sem chave configurada" (400), falha de descriptografia (400, mensagem clara), erro do
  provedor propagado (400 com a mensagem real), e sucesso (retorna o texto).
- E2e (`ai-providers.e2e.test.ts`, `RUN_DB_TESTS`): cobre o caminho "sem chave configurada" (400)
  contra banco real — mesma limitação já documentada no arquivo (sem credenciais de sandbox dos
  provedores reais, uma geração de texto de verdade não pode ser testada em CI).

### Fora de escopo (YAGNI)

- Rate limit/cooldown no botão de teste.
- Persistir o resultado do teste (`lastValidatedAt`/histórico) — isso já existe para o fluxo de
  salvar/validar; o teste é uma ação pontual e não deve interferir nesse estado.
