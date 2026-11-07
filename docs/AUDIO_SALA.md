# Áudio da sala de aula (PROF-03)

Branch `feature/https`: não mesclar na `main` até o site ter HTTPS e as chaves do LiveKit.

## Como funciona

- O professor entra no áudio e fala; os alunos só escutam.
- O professor abre ou fecha o microfone de cada aluno ("Dar a palavra"). O aluno com a palavra vê o botão "Falar".
- A API só assina o token de acesso (`POST /v1/classrooms/{id}/voice/token`) e muda permissões (`PUT /v1/classrooms/{id}/voice/speakers/{userId}`). O áudio passa pelo LiveKit.

## Ativar

1. Criar um projeto no LiveKit Cloud (plano Build, grátis) e copiar a URL `wss://…`, a API key e o API secret.
2. Pôr na `.env.vps` e reiniciar a API: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (o secret com 16 ou mais caracteres).
3. Sem as três variáveis o botão "Entrar no áudio" nem aparece.

## Limites

- O microfone só funciona em HTTPS (`localhost` também vale para testar).
- Plano grátis do LiveKit Cloud: 5.000 minutos de participante e 50 GB por mês (conferir na página oficial antes de contratar).
- Não testado com servidor LiveKit real: só o token e a montagem do pedido têm teste.
