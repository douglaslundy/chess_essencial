# Motor de aulas interativas

## Conceito

A aula é uma sequência de etapas. Cada etapa pode apresentar texto, tabuleiro, pergunta ou ação. O aluno realiza uma jogada e o backend decide a próxima etapa.

## Exemplo

```json
{
  "stepKey": "pawn-first-move",
  "stepType": "board_instruction",
  "title": "Primeiro movimento do peão",
  "bodyMd": "Mova o peão de b2 para b3.",
  "initialFen": "8/8/8/8/8/8/1P6/4K3 w - - 0 1",
  "orientation": "white",
  "expectedActions": [
    {"type":"move","uci":"b2b3"}
  ],
  "feedback": {
    "correct": "Correto. O peão avançou uma casa.",
    "incorrect": "Tente mover o peão que está em b2 para b3."
  },
  "nextStepRules": [
    {"when":"correct","goTo":"pawn-capture"}
  ]
}
```

## Tipos de etapa

- `text`: conceito e ilustração;
- `board_instruction`: exige lance;
- `quiz`: múltipla escolha ou resposta curta;
- `explanation`: revela linha e comentário;
- `checkpoint`: avalia domínio;
- `summary`: encerra aula.

## Validação

- ações enviadas ao backend;
- backend valida legalidade e regra da etapa;
- frontend não conhece respostas futuras;
- estado de tentativa salvo após cada ação;
- etapas podem aceitar múltiplos lances equivalentes;
- branches para erro comum e recuperação.

## Progressão

- pré-requisitos por aula;
- desbloqueio por conclusão ou nota mínima;
- exercícios do livro intercalados;
- repetição espaçada futura;
- progresso por módulo e curso.

## Conteúdo baseado no livro

Criar 10 módulos correspondentes aos volumes. Recomenda-se 8–14 aulas por módulo, total aproximado de 110–120 aulas.

Distribuição inicial:

1. Fundamentos: 12 aulas.
2. Pensamento e cálculo: 11.
3. Tática: 14.
4. Estratégia: 12.
5. Finais: 12.
6. Aberturas: 14.
7. Ataque e defesa: 11.
8. Jogo prático: 10.
9. Competição: 8.
10. Consolidação: 8.

Cada aula deve registrar `source_pages` e `exercise_ids`.
