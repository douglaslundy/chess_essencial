# @xadrez/mobile

Aplicativo Android/iOS da plataforma Xadrez Essencial, construído com Expo + Expo Router. Consome a mesma API (`apps/api`) e os mesmos contratos (`packages/contracts`) do site (`apps/web`).

## Rodando localmente

```bash
pnpm install
pnpm --filter @xadrez/mobile start
```

Aponte para a API local ou de produção via a variável `EXPO_PUBLIC_API_URL` (padrão: `http://localhost:4000/v1`), por exemplo:

```bash
EXPO_PUBLIC_API_URL=https://chess.dlsistemas.com.br/v1 pnpm --filter @xadrez/mobile start
```

No terminal do Expo, escolha abrir em um emulador Android, simulador iOS ou no app Expo Go.

## Estrutura

- `src/app/` — rotas (Expo Router, file-based, mesma lógica mental do App Router do Next.js).
- `src/screens/` — telas reais da aplicação.
- `src/lib/api/` — cliente HTTP para a API (mesmo formato do `apps/web/src/lib/api/client.ts`), com sessão persistida via `expo-secure-store`.
- `src/lib/auth/` — contexto de autenticação (`AuthProvider`/`useAuth`).
- `src/components/`, `src/hooks/`, `src/constants/` — primitivas de UI e tema, compartilhadas entre telas.

## Escopo

Fase 18 do backlog (`TAREFAS.md`): meta de paridade completa com o site (jogo, curso/exercícios, social), construída incrementalmente. Ainda sem publicação nas lojas — aguardando o usuário criar as contas de desenvolvedor Apple/Google.
