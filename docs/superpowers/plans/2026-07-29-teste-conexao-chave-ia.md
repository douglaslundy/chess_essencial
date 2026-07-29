# Botão de teste de conexão para chaves de IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Testar" button per AI-provider card in `/app/admin/ia` that makes a real chat-completion call with the already-saved key and shows the literal text the model generated.

**Architecture:** New `POST /admin/ai-providers/:provider/test` endpoint reuses the existing per-provider row (no new persistence) and the existing `callLlm()` dispatcher from `apps/api/src/games/narration/llm-client.ts` to make one real, short completion call. The frontend adds one button that calls it and renders the result in the card's existing status-message slot.

**Tech Stack:** NestJS (API), Zod (`@xadrez/contracts`), Next.js/React (web), Vitest.

## Global Constraints

- Never return or log the plaintext API key (existing convention across this module — keep it).
- Every provider error must surface the real message from the provider/LLM call, never a generic 500 (this is the exact bug class fixed in commit `0b8c0f7` earlier this session — don't reintroduce it).
- No new database writes for the test action — it must not touch `lastValidatedAt`/`lastValidationError`, which belong to the save/validate flow only.
- Follow the existing "leave the key untouched, test what's already saved" convention already used by `SettingsService#testMercadoPagoConnection()`.

---

### Task 1: Contract schema + OpenAPI spec for the test endpoint

**Files:**
- Modify: `packages/contracts/src/ai-providers.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `api/openapi.yaml`
- Modify: `apps/web/src/lib/api/openapi.d.ts` (regenerated, not hand-edited)
- Modify: `packages/sdk/src/generated/openapi.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: `aiProviderTestResultSchema` (Zod) and `AiProviderTestResult` (`{ generatedText: string }`) — Task 2 (backend service) and Task 4 (frontend client) both import `AiProviderTestResult` from `@xadrez/contracts`.

- [ ] **Step 1: Add the schema to `packages/contracts/src/ai-providers.ts`**

Add right after `aiProviderModelListSchema` (currently the last schema before the type-export block):

```typescript
export const aiProviderTestResultSchema = z.object({
  generatedText: z.string(),
});
```

Add to the type-export block (after `export type AiProviderModelList = ...`):

```typescript
export type AiProviderTestResult = z.infer<typeof aiProviderTestResultSchema>;
```

- [ ] **Step 2: Re-export from `packages/contracts/src/index.ts`**

In the existing `export { ... } from './ai-providers.js';` block, add `aiProviderTestResultSchema` to the value list (alphabetical, after `aiProviderSchema`) and `type AiProviderTestResult` to the type list (alphabetical, after `type AiProviderModelMetadata`).

- [ ] **Step 3: Typecheck the contracts package**

Run: `pnpm --filter @xadrez/contracts exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Add the path + schema to `api/openapi.yaml`**

Add a new path entry right after the existing `/admin/ai-providers/{provider}/models` block (before `/admin/ai-providers/{provider}:`):

```yaml
  /admin/ai-providers/{provider}/test:
    post:
      summary: Make a real completion call with the already-saved key, to confirm it works (admin only)
      operationId: adminTestAiProviderKey
      parameters:
        - {name: provider, in: path, required: true, schema: {type: string, enum: [anthropic, openai, gemini]}}
      responses:
        '200':
          description: The literal text the model generated
          content:
            application/json:
              schema: {$ref: '#/components/schemas/AiProviderTestResult'}
        '400': {$ref: '#/components/responses/Problem'}
        '401': {$ref: '#/components/responses/Problem'}
        '403': {$ref: '#/components/responses/Problem'}
```

Add a new schema right after the existing `AiProviderModelList:` schema (in `components/schemas`):

```yaml
    AiProviderTestResult:
      type: object
      required: [generatedText]
      properties:
        generatedText: {type: string}
```

- [ ] **Step 5: Regenerate the web and SDK OpenAPI clients**

Run: `pnpm --filter @xadrez/web generate:api`
Run: `pnpm --filter @xadrez/sdk generate:api`

Expected: both commands exit 0 and modify `apps/web/src/lib/api/openapi.d.ts` / `packages/sdk/src/generated/openapi.ts` to include the new path/schema. Do not hand-edit these two generated files.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/ai-providers.ts packages/contracts/src/index.ts api/openapi.yaml apps/web/src/lib/api/openapi.d.ts packages/sdk/src/generated/openapi.ts
git commit -m "feat(contracts): add AiProviderTestResult schema and the test endpoint's OpenAPI path"
```

---

### Task 2: Backend — `AiProvidersService.test()` (TDD)

**Files:**
- Modify: `apps/api/src/ai-providers/ai-providers.service.ts`
- Test: `apps/api/src/ai-providers/ai-providers.service.test.ts`

**Interfaces:**
- Consumes: `aiProviderTestResultSchema`'s inferred type `AiProviderTestResult` (Task 1); `callLlm(config: {apiKey, model, provider}, system: string, userMessage: string): Promise<string>` and `class LlmRequestError extends Error` from `apps/api/src/games/narration/llm-client.ts` (both already exist, unchanged); the existing private `AiProvidersService.resolvePlainApiKey(provider, row, apiKey?)` (already exists at `ai-providers.service.ts:110`, unchanged) and `AiProvidersRepository.get(provider)` (already exists, unchanged).
- Produces: `AiProvidersService.test(provider: AiProvider): Promise<AiProviderTestResult>` — Task 3 (controller) calls this exact method/signature.

- [ ] **Step 1: Write the failing unit tests**

Add this new `vi.mock` block right after the existing `vi.mock('./model-listing.js', ...)` block in `apps/api/src/ai-providers/ai-providers.service.test.ts`:

```typescript
vi.mock('../games/narration/llm-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../games/narration/llm-client.js')>();
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm, LlmRequestError } from '../games/narration/llm-client.js';

const mockedCallLlm = vi.mocked(callLlm);
```

Add this import and helper right after the `mockedCallLlm` declaration above — real AES-256-GCM ciphertext is needed for the two tests below where `callLlm` is expected to actually run (`resolvePlainApiKey` must decrypt successfully first), the same way the "no longer decryptable" test elsewhere in this file uses a deliberately *invalid* ciphertext (`'not-real-ciphertext'`) to prove the opposite case:

```typescript
import { encryptSecret } from '../common/crypto/secret-cipher.js';

const testEncryptionKey = 'unit-test-encryption-key';
function seededKey(plaintext: string) {
  return encryptSecret(plaintext, testEncryptionKey);
}
```

Extend the existing `afterEach` to also reset the new mock:

```typescript
afterEach(() => {
  mockedListModels.mockReset();
  mockedCallLlm.mockReset();
});
```

Add a new `describe` block at the end of the file, after the closing `});` of `describe('AiProvidersService.update', ...)`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec vitest run src/ai-providers/ai-providers.service.test.ts`
Expected: FAIL — `AiProvidersService.test` doesn't exist yet (`TypeError: service(...).test is not a function`).

- [ ] **Step 3: Implement `AiProvidersService.test()`**

In `apps/api/src/ai-providers/ai-providers.service.ts`:

Add `AiProviderTestResult` to the existing `import { ... } from '@xadrez/contracts';` block (alphabetical, after `type AiProviderKey`).

Add this import near the top, after the existing `import { AiProvidersRepository, ... } from './ai-providers.repository.js';` line:

```typescript
import { callLlm, LlmRequestError } from '../games/narration/llm-client.js';
```

Add these two private static constants right after the `LEGACY_NARRATION_AI_SETTINGS_KEY` constant (top of the file, before the class):

```typescript
const TEST_CONNECTION_SYSTEM_PROMPT =
  'Você é um teste de conectividade da plataforma Xadrez Essencial.';
const TEST_CONNECTION_USER_MESSAGE =
  'Confirme em português, em até 20 palavras, que a conexão com você está funcionando.';
```

Add this method to the `AiProvidersService` class, right after `setActive()` and before `resolveActiveConfig()`:

```typescript
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
      throw error;
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec vitest run src/ai-providers/ai-providers.service.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-providers/ai-providers.service.ts apps/api/src/ai-providers/ai-providers.service.test.ts
git commit -m "feat(ai-providers): add AiProvidersService.test() for a real end-to-end connection check"
```

---

### Task 3: Backend — controller endpoint + e2e coverage

**Files:**
- Modify: `apps/api/src/ai-providers/ai-providers.controller.ts`
- Modify: `apps/api/src/ai-providers/ai-providers.e2e.test.ts`

**Interfaces:**
- Consumes: `AiProvidersService.test(provider: AiProvider): Promise<AiProviderTestResult>` (Task 2).
- Produces: `POST /v1/admin/ai-providers/:provider/test` — Task 4's frontend client calls this exact route.

- [ ] **Step 1: Add the controller route**

In `apps/api/src/ai-providers/ai-providers.controller.ts`, add this method right after `listModels()` and before `update()`:

```typescript
  @Post(':provider/test')
  test(@Param('provider') provider: string) {
    return this.aiProviders.test(parseInput(aiProviderSchema, provider));
  }
```

(No new imports needed — `Post`, `Param`, `aiProviderSchema`, and `parseInput` are already imported in this file.)

- [ ] **Step 2: Write the e2e test**

Add this test to `apps/api/src/ai-providers/ai-providers.e2e.test.ts`, right after the `'refuses to activate a provider that has no key configured'` test (same file already documents, at the top, that a real provider call can't be exercised in this environment — this test only covers the no-key-configured path, consistent with that documented limitation):

```typescript
  it('refuses to test a provider that has no key configured', async () => {
    await database.client`DELETE FROM ai_provider_keys WHERE provider = 'gemini'`;
    const response = await app.inject({
      headers: auth(admin),
      method: 'POST',
      url: '/v1/admin/ai-providers/gemini/test',
    });
    expect(response.statusCode, response.body).toBe(400);
  });
```

- [ ] **Step 3: Run the API test suite**

Run: `cd apps/api && pnpm test`
Expected: PASS (this e2e test is skipped in this environment without `RUN_DB_TESTS=true`/a real Postgres — same documented limitation as the rest of this file — but must not be a syntax/type error; the unit suite must stay green).

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-providers/ai-providers.controller.ts apps/api/src/ai-providers/ai-providers.e2e.test.ts
git commit -m "feat(ai-providers): expose POST /admin/ai-providers/:provider/test"
```

---

### Task 4: Frontend — API client method

**Files:**
- Modify: `apps/web/src/lib/api/client.ts`

**Interfaces:**
- Consumes: `AiProviderTestResult` type (Task 1), `POST /admin/ai-providers/:provider/test` (Task 3).
- Produces: `api.adminTestAiProviderKey(provider: AiProvider, token: string): Promise<AiProviderTestResult>` — Task 5's UI calls this exact function.

- [ ] **Step 1: Add the type import**

In the existing `import { ... } from '@xadrez/contracts';` block near the top of `apps/web/src/lib/api/client.ts`, add `AiProviderTestResult` (alphabetical, after `AiProviderModelList`).

- [ ] **Step 2: Add the client method**

Add this method to the `api` object, right after `adminListAiProviderModels` and before `adminUpdateAiProviderKey`:

```typescript
  adminTestAiProviderKey: (provider: AiProvider, token: string) =>
    request<AiProviderTestResult>(`/admin/ai-providers/${provider}/test`, token, {
      method: 'POST',
    }),
```

- [ ] **Step 3: Typecheck the web app**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/client.ts
git commit -m "feat(web): add adminTestAiProviderKey to the API client"
```

---

### Task 5: Frontend — "Testar" button in `/app/admin/ia`

**Files:**
- Modify: `apps/web/src/app/app/admin/ia/page.tsx`

**Interfaces:**
- Consumes: `api.adminTestAiProviderKey(provider, token)` (Task 4).

- [ ] **Step 1: Add the `testKey` handler**

In `apps/web/src/app/app/admin/ia/page.tsx`, add this function right after `saveKey()` and before `setActive()`:

```typescript
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
```

- [ ] **Step 2: Add the button next to "Usar este provedor" / "Desativar"**

Find this existing block (the activate/deactivate button):

```tsx
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
```

Add a second button right after it, inside the same `{current?.hasApiKey ? (...) : null}` conditional (so both buttons render together, or neither):

```tsx
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
              Testar
            </button>
          ) : null}
```

- [ ] **Step 3: Typecheck, lint, and build the web app**

Run: `cd apps/web && pnpm typecheck && pnpm lint && pnpm build`
Expected: all three succeed with no errors.

- [ ] **Step 4: Manual verification in the browser**

Start the dev server (`pnpm --filter @xadrez/web dev` or the project's existing `run` skill/dev workflow) and open `/app/admin/ia` as an admin. For a provider that already has a key saved: confirm the "Testar" button appears, click it, confirm the button disables while busy and the card's message area shows either the real generated text or a real error message (never a generic "erro interno"). For a provider with no key saved: confirm the button does not appear.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/app/admin/ia/page.tsx
git commit -m "feat(web): add a Testar button per AI provider card"
```

---

### Task 6: Full monorepo gates

**Files:** none (verification only)

- [ ] **Step 1: Run every gate used by this project before a push**

Run, from the repo root:

```bash
pnpm --filter @xadrez/contracts exec tsc --noEmit -p tsconfig.json
pnpm --filter @xadrez/api typecheck
pnpm --filter @xadrez/api lint
pnpm --filter @xadrez/api test
pnpm --filter @xadrez/api build
pnpm --filter @xadrez/web typecheck
pnpm --filter @xadrez/web lint
pnpm --filter @xadrez/web build
pnpm format:check
```

Expected: every command exits 0.

- [ ] **Step 2: Report gate results to the user before pushing**

Push to `main` triggers the production auto-deploy timer (per `[[project_chess_production_deploy]]` in memory) — confirm with the user before running `git push`, same as every other push this session.
