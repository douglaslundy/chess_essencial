# Currículo derivado dos 10 módulos

## Regra editorial

Cada aula deve:
- ter objetivo observável;
- usar 3–10 etapas;
- incluir no máximo um conceito novo principal;
- trazer ao menos uma interação no tabuleiro quando aplicável;
- terminar com 2–12 exercícios vinculados;
- registrar página fonte;
- incluir resumo e erro comum.

## Exemplo de módulo 1

1. Conhecendo o tabuleiro.
2. Coordenadas e orientação.
3. Rei e objetivo do jogo.
4. Dama.
5. Torres.
6. Bispos.
7. Cavalos.
8. Peões e promoção.
9. Captura, xeque e respostas.
10. Roque e en passant.
11. Mates elementares.
12. Primeira partida guiada.

## Importação dos exercícios

- Ler `Xadrez_Essencial_Exercicios_1_a_1298.json`.
- Normalizar IDs e FEN.
- Manter referência ao número original.
- Validar FEN quando `position_type=legal_position`.
- Para diagramas ilustrativos, usar renderer sem motor de legalidade.
- Associar pelo módulo, capítulo, categoria e páginas.
