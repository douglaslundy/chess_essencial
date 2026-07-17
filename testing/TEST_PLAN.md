# Plano de testes

## Unitários

- motor de rating;
- relógio;
- transições de estado da partida;
- regras de resultado;
- máquina de aulas;
- associação de exercícios.

## Integração

- registro/login/refresh;
- fila → match → partida;
- lance persistido e broadcast;
- finalização → rating;
- importação de 1.298 exercícios;
- progresso de curso.

## E2E

1. Dois navegadores cadastram usuários.
2. Entram na mesma fila.
3. Jogam uma miniatura até mate.
4. Ambos recebem resultado e rating.
5. Abrem revisão e percorrem lances.
6. Um usuário conclui aula interativa.
7. Resolve exercício e vê progresso.

## Propriedades

- qualquer sequência legal persistida reproduz o FEN final;
- reprocessar comando idempotente não cria segundo lance;
- soma dos deltas pode não ser zero quando K difere; registrar isso como esperado;
- rating nunca diverge do ledger.

## Carga

- conexões WebSocket simultâneas;
- partidas ativas;
- p95 de `move.submit`;
- reconexão em massa;
- fila de rating.

SLO inicial:
- p95 confirmação de lance < 250 ms na mesma região;
- disponibilidade mensal 99,5% no MVP;
- zero perda de lance confirmado.
