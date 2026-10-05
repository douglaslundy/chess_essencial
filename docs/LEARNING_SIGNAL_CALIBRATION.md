# Calibração dos sinais pedagógicos

A taxonomia pública permanece limitada a `tactical_awareness` e `move_safety`. Perda em centipawns e `missed_win` não provam garfo, cravada, fase da partida ou causa cognitiva.

A regra `stockfish_error_signal_v2` acrescenta somente o tema objetivo `missed_forced_mate`: ele existe quando o motor registrou mate forçado antes do lance e o jogador deixou a vitória escapar. O tema fica na evidência derivada para calibração; ainda não é apresentado como diagnóstico específico ao aluno.

## Relatório agregado

Execute `scripts/learning-signal-calibration.sql` com `psql` após existir volume real. O script abre uma transação somente leitura e não retorna usuário, partida, recomendação individual nem evidência bruta.

O relatório mede:

- distribuição e cobertura por versão da regra, skill, tipo, qualidade e tema objetivo;
- tentativa e acerto em até 30 dias, por faixa de dificuldade;
- mediana de horas até a primeira tentativa;
- concentração no primeiro e nos cinco exercícios mais recomendados;
- quantidade efetiva de exercícios e repetição por aluno, sempre agregada.

Fixtures, seeds e contas de teste não são evidência de calibração. As contagens devem acompanhar as taxas para evitar conclusões com denominadores pequenos.

## Regra de decisão

- Não ajustar confiança nem publicar novos diagnósticos sem amostra real e revisão dos falsos positivos.
- Não usar LLM como classificador.
- `missed_forced_mate` é aceito porque deriva diretamente de mate forçado calculado pelo motor; outros temas exigem detectores objetivos próprios.
- Não personalizar dificuldade antes de comparar tentativa e acerto por faixa sem prejudicar iniciantes.
- Manter preferência por exercícios não resolvidos, fora da janela recente e pouco repetidos.
