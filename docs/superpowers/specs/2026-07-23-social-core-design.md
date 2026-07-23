# Rede social — SP-A: núcleo social (amizades + presença + perfil público)

Data: 2026-07-23
Sub-projeto A de 9 do lote 2 (rede social).

## Objetivo

Fundação da rede social: pedidos de amizade, lista de amigos com presença
(online/último acesso), e perfil público com rating — base para feed (B) e
mensagens (C).

## Diagnóstico

A tabela `friendships` (requester/addressee/status) e a coluna
`allow_friend_requests` em `user_profiles` já existiam no schema desde a
migration 0001/0008, usadas apenas pelo matchmaking para excluir bloqueados —
nunca houve API. `user_blocks` (módulo safety) também já existe e é reusado
para impedir pedidos entre usuários bloqueados.

## Arquitetura

- **Presença**: heartbeat do cliente (`POST /v1/presence/heartbeat` a cada
  30s enquanto logado) grava `presence:<userId>` no Redis (TTL 90s, via novo
  `RedisService`/`ioredis`) e atualiza `users.last_seen_at` (migration 0016).
  Online = chave existe no Redis; offline mostra "visto há X".
- **Amizades**: `SocialRepository` opera só sobre `friendships` (nunca usa o
  status `'blocked'` dela, que é legado/reservado para o matchmaking — bloqueio
  de verdade continua em `user_blocks`). Sem coluna de id própria na tabela
  (chave composta requester+addressee), então pedidos são referenciados pelo
  `username` da outra parte, não por um id sintético.
- **Perfil público**: `GET /v1/users/:username` retorna ratings (`rating_profiles`),
  presença e o status de amizade relativo a quem está vendo.

## Endpoints

`POST /v1/presence/heartbeat`, `GET/POST /v1/friends/requests`,
`POST /v1/friends/requests/:username/accept|decline`,
`DELETE /v1/friends/requests/:username` (cancelar), `GET /v1/friends`,
`DELETE /v1/friends/:userId`, `GET /v1/users/:username`.

## Frontend

`/app/amigos`: busca por username para enviar pedido, pedidos recebidos/enviados
com aceitar/recusar/cancelar, lista de amigos com bolinha online/último acesso
e remover. Heartbeat disparado pelo `AppChrome` (efeito com `setInterval`,
independente de navegação). Link "Amigos" na sidebar.

## Testes

E2e completo em `social.e2e.test.ts`: enviar/listar/aceitar pedido, recusar,
duplicidade e auto-pedido rejeitados, heartbeat reflete presença na lista de
amigos, perfil público mostra status de amizade correto, remover amizade.
Contrato testado em `social.test.ts`.

## Fora de escopo (próximos sub-projetos)

Feed de posts (B), mensagens (C), página de regras (D), 200 bots (E),
assinaturas (F), indicação (G), dashboard admin (H), pagamento Mercado Pago (I).
