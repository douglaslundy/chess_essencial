# Engenharia de prompt para revisão de partidas

Vale para todos os prompts que explicam lances: revisão (`apps/worker/src/narration/prompts.ts`), Treinador ao vivo (`apps/api/src/games/narration/prompts.ts`), revisão da biblioteca (`apps/api/src/library/library-review-prompt.ts`) e as frases montadas sem IA na web (`apps/web/src/components/history/move-narration.ts`, `apps/web/src/components/coach/coach-explanation.ts`).

## O problema que isto resolve

A IA recebia só o lance (`Nf3`), a classificação e o melhor lance do motor. Sem tabuleiro, ela só podia repetir o nome do lance e a nota. Pior: sem uma comparação medida, ela inventava o motivo (por exemplo, dizer que "peão come cavalo" é melhor que "cavalo come torre" sem saber das recapturas).

## Princípios

1. **A IA nunca calcula xadrez.** Tudo o que for verdade do tabuleiro sai do `chess.js` em `packages/chess-domain/src/move-facts.ts` e do motor (Stockfish). A IA só transforma fatos em fala.
2. **Dar o tabuleiro e os fatos.** Todo prompt leva a posição (FEN) e os "fatos do tabuleiro" do lance: o que captura, ameaça, defende, desenvolve, quais peças ficam sem proteção e o saldo de material depois das recapturas (`netMaterial`).
3. **Comparar o lance jogado com o melhor, em números.** `describeBetterMove` entrega: o que a sugestão faz, o saldo de material dos dois lances e a avaliação antes e depois (em peões). Se o material é parecido, o texto diz que a diferença está na posição, sem inventar motivo.
4. **Pensar como jogador.** A ordem de raciocínio do prompt é: o que o lance faz; o que deixa vulnerável; se foi bom ou ruim e por quê; qual é a melhor alternativa e o plano seguinte.
5. **Lance fraco sempre explica o porquê.** Formato: "Você jogou X, uma imprecisão, porque [o que cede]. No seu lugar, eu jogaria Y: ele [o que faz]. No saldo de material, Y rende +3 e o seu lance, +2."
6. **Ponto forte e ponto fraco.** O lance que for um dos dois diz isso começando a frase por "Ponto forte:" ou "Ponto fraco:", com os mesmos termos do resumo.
7. **Fala, não notação.** A fala diz "o bispo de b1 para h6", nunca "Bh6" nem "C cê 3". A tela mantém a notação curta (`Bh6`). A conversão está em `spokenSan` e `spokenMove` (`apps/web/src/lib/notation.ts`).
8. **Proibido inventar.** Sem variantes, ameaças ou avaliações fora dos dados. Na dúvida, dizer menos. Nunca citar "motor", "engine", "Stockfish", "computador" ou "programa": a opinião é do Treinador ("eu").
9. **Sugestões da IA sem motor passam por conferência.** Na biblioteca, que não tem motor, um `better` só vale se for legal e se não render menos material líquido que o lance jogado (`parseChunkResponse`).
10. **Frases curtas e faladas.** De 8 a 20 palavras por frase, conectivos naturais, sem listas, emojis ou markdown, porque o texto vira voz.

## Versão e cache

- A narração das partidas guarda `prompt_version` (`NARRATION_PROMPT_VERSION`). Ao mudar o prompt, suba o número: o worker refaz as narrações recentes, uma por vez, e a chave de cache de lances inclui a versão.
- O áudio (`voice_audio_cache`) é global por texto e voz. A primeira pessoa a abrir a revisão gera as falas; as seguintes só ouvem.

## Como testar uma mudança de prompt

- Testes unitários dos fatos: `packages/chess-domain/src/move-facts.test.ts`.
- Testes do texto: `apps/web/src/components/history/move-narration.test.ts` e `apps/worker/src/narration/prompts.test.ts`.
- Caso de regressão que motivou este guia: cavalo que captura torre defendida (saldo +2) contra peão que captura cavalo solto (saldo +3).
