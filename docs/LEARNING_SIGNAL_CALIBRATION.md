# Calibra??o dos sinais pedag?gicos

A taxonomia permanece deliberadamente limitada a `tactical_awareness` e `move_safety`. Centipawn loss, qualidade e `missed_win` n?o provam garfo, cravada, fase da partida ou causa cognitiva; nenhuma classe espec?fica ser? adicionada sem detector objetivo e valida??o real.

## Relat?rio agregado

Ap?s a migration 0043 estar implantada e existir volume real, execute `scripts/learning-signal-calibration.sql` com `psql` em modo somente leitura. O relat?rio n?o seleciona usu?rio, partida ou evid?ncia bruta. Ele mede:

- distribui??o por vers?o da regra, skill, tipo e qualidade;
- cobertura indireta de utilidade: tentativa posterior e acerto posterior no exerc?cio recomendado;
- diversidade: exerc?cios distintos e concentra??o no exerc?cio mais recomendado.

Fixtures, seeds e contas de teste n?o s?o evid?ncia de calibra??o. N?o existe limiar autom?tico de amostra ou aprova??o: o relat?rio deve publicar as contagens junto das taxas, evitando conclus?es baseadas em denominadores pequenos.

## Regra de decis?o

- N?o alterar confid?ncias nem ampliar a taxonomia sem amostra real e revis?o dos falsos positivos por detector objetivo.
- N?o usar LLM como classificador.
- Recomenda??es evitam exerc?cio resolvido, exerc?cio usado nos ?ltimos 30 dias e repeti??o excessiva; o desempate determin?stico por sinal distribui candidatos equivalentes.
- A dificuldade n?o ser? personalizada at? o relat?rio real permitir avaliar sucesso posterior por faixa sem prejudicar iniciantes.
