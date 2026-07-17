# Páginas do frontend

## Públicas

- `/`: landing institucional.
- `/login`, `/cadastro`, `/recuperar-senha`.
- `/jogar`: seleção de ritmo, casual/rated.
- `/cursos`: catálogo.
- `/cursos/[courseSlug]`: currículo.
- `/ranking`: leaderboard por pool.
- `/u/[username]`: perfil público.

## Autenticadas

- `/app`: dashboard.
- `/app/jogar`: fila, desafios e partidas recentes.
- `/app/partida/[gameId]`: tabuleiro ao vivo.
- `/app/partidas`: histórico.
- `/app/partidas/[gameId]/revisao`: replay, comentários e PGN.
- `/app/curso/[courseSlug]/aula/[lessonSlug]`: aula interativa.
- `/app/exercicios`: filtros e sessão de treino.
- `/app/exercicios/[id]`: exercício individual.
- `/app/progresso`: curso, exercícios e rating.
- `/app/configuracoes`: conta, privacidade e preferências.

## Admin

- `/admin/conteudo`.
- `/admin/cursos/[id]`.
- `/admin/aulas/[id]/editor`.
- `/admin/exercicios/importar`.
- `/admin/moderacao`.
- `/admin/partidas/[id]`.

## Layout da partida

Desktop:
- esquerda: jogadores, relógios e ações;
- centro: tabuleiro;
- direita: lances, chat opcional e detalhes.

Mobile:
- cabeçalho com adversário/relógio;
- tabuleiro;
- relógio do usuário;
- tabs de lances, ações e detalhes.
