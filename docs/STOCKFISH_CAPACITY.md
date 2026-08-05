# Capacidade do pipeline Stockfish

Data da medição: 2026-08-05.

## Orçamento aplicado

- Stockfish: 1 thread e 16 MB de hash por subprocesso.
- Worker: limite de 1 CPU e 512 MB no Compose de produção.
- Concorrência: uma partida por vez e uma posição por vez.
- Timeout por posição: 30 segundos.
- Lease da análise: 30 minutos.
- Lease da narração: 15 minutos; cada chamada ao provedor possui timeout de 30 segundos.

## Benchmark local reproduzível

Comando:

```bash
pnpm --filter @xadrez/worker benchmark:stockfish
```

A amostra executa 30 avaliações em profundidade 14 sobre abertura, meio-jogo, final e ataque de mate. Duas execuções consecutivas produziram:

| Métrica                             | Resultado conservador |
| ----------------------------------- | --------------------: |
| p50 por posição                     |                1,18 s |
| p95 por posição                     |                2,35 s |
| p99/máximo por posição              |                2,39 s |
| Vazão sequencial                    |     0,74 avaliações/s |
| CPU da árvore completa do benchmark |               48,34 s |
| Pico de memória da árvore completa  |             382,75 MB |

A medição de memória local é conservadora: inclui `cmd`, `pnpm`, `tsx`, o processo do benchmark e os subprocessos do motor. Em produção, a telemetria usa cgroup v2 e cobre o container inteiro, incluindo o Stockfish; fora de cgroup, o health identifica explicitamente o escopo mais limitado como `worker-process`.

## Amostra real de produção

Consultas somente leitura no PostgreSQL de produção, sem deploy:

| Métrica                      | Amostra |     p50 |     p95 |     p99 |   Máximo |
| ---------------------------- | ------: | ------: | ------: | ------: | -------: |
| Plies por partida finalizada |      39 |      40 |   97,10 |  126,22 |      138 |
| Duração da análise           |      39 | 27,77 s | 59,63 s | 94,07 s | 107,85 s |
| Duração da narração          |       1 |  8,53 s |  8,53 s |  8,53 s |   8,53 s |

O p99 real da análise consome 5,23% do lease de 30 minutos; o máximo observado consome 5,99%. Mesmo uma projeção deliberadamente conservadora de 128 posições, todas no p99 local de 2,39 s, termina em aproximadamente 5,1 minutos, 17,0% do lease.

A amostra de narração ainda é pequena demais para percentis confiáveis. Entretanto, o job seleciona no máximo seis momentos e um resumo, e cada uma das sete chamadas possíveis possui timeout de 30 segundos. O teto das chamadas é 3,5 minutos, antes do overhead pequeno de banco, ainda com margem ampla no lease de 15 minutos.

## Decisão

Não adicionar heartbeat e não elevar paralelismo. Os dados observados demonstram margem suficiente, e aumentar concorrência disputaria CPU com os demais containers da VPS compartilhada.

O worker manté até 512 amostras em memória e publica p50/p95/p99 no endpoint `/health`. Depois de 20 partidas no processo atual, `heartbeatDecision` muda para `required` caso o p99 alcance metade do lease (15 minutos); abaixo disso, permanece `not_required`. Logs estruturados por partida preservam duração, CPU, memória, profundidade, quantidade de posições e resultado.
