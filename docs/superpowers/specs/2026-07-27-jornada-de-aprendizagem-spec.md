# Jornada de Aprendizagem — Spec original do usuário (verbatim)

> Recebido do usuário em 2026-07-27. Reproduzido sem edições. Esta é a
> especificação completa de 23 fases para transformar o catálogo de
> desafios/exercícios atual numa trilha de aprendizagem por níveis
> (progressão tipo "mapa", inspirada nos princípios de UX de plataformas
> como Chess.com, sem copiar assets/identidade visual proprietária).
>
> Referida em conversas anteriores como "Jornada de Desafios". Esta cópia
> existe porque uma tentativa anterior de guardar só um resumo em memória
> (não o texto completo) causou perda de contexto entre sessões — ver
> `docs/superpowers/plans/` para o plano de implementação derivado deste
> spec, quando existir.

---

Você atuará como Product Designer, UX Architect, Game Designer, especialista em sistemas educacionais de xadrez e Senior Software Engineer.

Sua tarefa é analisar profundamente o sistema de xadrez existente antes de modificar qualquer código e, a partir dessa análise, projetar e implementar uma nova experiência de aprendizagem e desafios baseada em progressão por níveis.

IMPORTANTE

O sistema já possui:
- motor/física/regras do xadrez;
- tabuleiro funcional;
- desafios existentes;
- posições e respostas dos desafios;
- classificação atual dos desafios;
- fluxo funcional para executar desafios.

Não reimplemente o motor de xadrez e não substitua funcionalidades existentes sem necessidade.

O objetivo principal é REESTRUTURAR:
1. descoberta dos desafios;
2. organização pedagógica;
3. progressão;
4. experiência visual;
5. feedback;
6. sistema de dicas;
7. interface do tabuleiro;
8. acompanhamento do aprendizado.

A referência conceitual é a experiência de aprendizagem guiada por trilhas utilizada por plataformas como Chess.com.

NÃO copie assets, ilustrações, textos, personagens, mapas ou identidade visual proprietária.

Extraia os princípios de UX:
- progressão visual;
- sequência;
- desbloqueio;
- sensação de avanço;
- feedback imediato;
- instrutor contextual;
- redução de decisões desnecessárias;
- objetivos pequenos;
- aprendizado progressivo.

Crie identidade própria para o produto.

==================================================
FASE 1 — AUDITORIA DO SISTEMA ATUAL
==================================================

Antes de implementar qualquer alteração, analise o projeto existente.

Identifique:

- stack;
- arquitetura;
- rotas;
- componentes;
- estado global;
- componentes do tabuleiro;
- motor de xadrez utilizado;
- estrutura dos desafios;
- banco de dados;
- APIs;
- endpoints;
- modelos;
- tipos/interfaces;
- autenticação;
- persistência do progresso;
- sistema de pontuação, se houver;
- sistema de dicas, se houver;
- análise de jogadas, se houver.

Mapeie especificamente o fluxo:

Usuário
→ tela de desafios
→ Select de temas
→ escolha do tema
→ obtenção dos desafios
→ montagem da posição
→ execução
→ validação da jogada
→ feedback
→ próximo desafio
→ persistência.

Localize exatamente onde a classificação por tema acontece.

Não altere essa estrutura imediatamente.

Primeiro produza um relatório:

CURRENT_CHALLENGE_ARCHITECTURE.md

contendo:

- funcionamento atual;
- componentes envolvidos;
- modelos envolvidos;
- fluxo de dados;
- dependências;
- pontos de acoplamento;
- problemas encontrados;
- funcionalidades que devem ser preservadas;
- estratégia de migração.

==================================================
FASE 2 — NOVO MODELO PEDAGÓGICO
==================================================

A navegação principal deixa de ser:

DESAFIOS
→ selecionar tema
→ executar exercícios.

Passará a ser:

TREINAMENTO
→ MAPA
→ NÍVEL
→ ETAPA
→ DESAFIO
→ RESULTADO
→ PRÓXIMA ETAPA.

Temas deixam de ser a taxonomia principal apresentada ao usuário.

Entretanto, NÃO remova os temas do modelo de dados.

Cada desafio deve continuar podendo possuir:

challengeId
difficulty
rating estimado
themes[]
skills[]
position/FEN
solution
numberOfMoves
prerequisites
instructionalMetadata

Exemplo:

{
  "difficulty": 4,
  "themes": [
    "fork",
    "hanging-piece",
    "calculation"
  ]
}

A diferença é que o algoritmo selecionará desafios para a trilha.

==================================================
FASE 3 — CURRÍCULO POR DIFICULDADE
==================================================

Crie uma hierarquia configurável.

Exemplo conceitual:

Mundo 1 — Primeiros Passos
Mundo 2 — Fundamentos
Mundo 3 — Visão Tática
Mundo 4 — Combinações
Mundo 5 — Estratégia
Mundo 6 — Jogador Avançado
...

Os nomes definitivos devem respeitar a identidade atual do produto.

Cada Mundo possui vários Níveis.

Cada Nível possui várias Etapas.

Cada Etapa pode ser:

CHALLENGE
LESSON
REVIEW
CHECKPOINT
BOSS

Não é necessário que todos existam inicialmente, mas a arquitetura deve suportá-los.

Exemplo:

Mundo 2

01 ✓
02 ✓
03 ✓
04 ●
05 🔒
06 🔒
07 🔒
08 🏆

A etapa atual deve ser visualmente evidente.

Etapas concluídas devem possuir estado distinto.

Etapas futuras devem permanecer bloqueadas conforme as regras de progressão.

==================================================
FASE 4 — MAPA / TRILHA
==================================================

Substitua o Select atual como entrada principal por uma tela de progressão.

Criar:

LearningPathPage
LearningMap
LevelNode
CurrentLevelNode
CompletedLevelNode
LockedLevelNode
CheckpointNode
WorldSection
ProgressHeader

A trilha deve funcionar verticalmente, especialmente em mobile.

O usuário deve conseguir enxergar:

- onde está;
- o que concluiu;
- qual é o próximo passo;
- quanto falta para concluir o nível;
- quais etapas ainda estão bloqueadas.

Evite uma simples lista vertical de botões.

A trilha deve possuir percurso visual.

Exemplo:

        [12 🔒]
           |
     [11]──┘
      |
   [10 🏆]
      |
      └──[09]
          |
       [08]
          |
       [07 ✓]

Pode haver pequenas variações de posição dos nodes para criar sensação de mapa.

No mobile, preserve:
- legibilidade;
- área mínima de toque;
- scroll;
- desempenho;
- responsividade.

==================================================
FASE 5 — POSICIONAMENTO DO USUÁRIO
==================================================

Não obrigue todo usuário existente a começar no nível 1.

Crie suporte para:

placementLevel
currentLevel
highestUnlockedLevel
completedLevels
mastery
challengeHistory

Caso já existam dados suficientes, estime o nível inicial através de:
- desafios resolvidos;
- dificuldade;
- taxa de acerto;
- histórico disponível.

Caso não exista histórico confiável, mantenha um ponto inicial configurável ou crie futuramente um teste de nivelamento.

==================================================
FASE 6 — ALGORITMO DE SELEÇÃO
==================================================

Não use dificuldade como simples filtro.

O sistema precisa controlar uma curva pedagógica.

Cada nível deverá definir:

difficultyRange
allowedThemes
preferredThemes
challengeCount
masteryRequirement

Exemplo conceitual:

Nível 1:
80% desafios básicos
20% revisão

Nível 5:
60% dificuldade atual
25% revisão
15% desafio acima da dificuldade atual

Os percentuais devem ser configuráveis.

Misture temas quando pedagogicamente adequado.

Não transforme cada nível em apenas um tema disfarçado.

Exemplo:

Nível 7:
- garfo;
- peça indefesa;
- mate;
- raio-X;
- cálculo.

Isso estimula reconhecimento do problema sem dizer previamente ao jogador qual padrão procurar.

==================================================
FASE 7 — MASTERY
==================================================

Não considere apenas "completou/não completou".

Criar um sistema de domínio.

Registrar por desafio:

attempts
correctMoves
incorrectMoves
hintsUsed
completionTime
completed
firstTrySuccess

Calcular mastery por habilidade/tema.

Exemplo:

Garfo .............. 82%
Cravada ............ 64%
Mate em 2 .......... 91%
Defesa ............. 48%

Esses dados poderão futuramente alimentar seleção adaptativa.

==================================================
FASE 8 — SISTEMA DE REVISÃO
==================================================

Adicionar suporte a revisão de conceitos com baixo domínio.

Quando uma habilidade estiver fraca, desafios relacionados poderão reaparecer posteriormente.

Não repetir imediatamente o mesmo exercício como única estratégia.

O sistema deve preferir outro problema que teste o mesmo conceito.

Criar estrutura para:

skillMastery
lastSeen
errorCount
successCount
reviewPriority

==================================================
FASE 9 — NOVO LAYOUT DO TABULEIRO
==================================================

Refatore a experiência em torno do tabuleiro.

ANTES:

header
tabuleiro
controles/dicas separados.

DEPOIS:

HEADER

INSTRUTOR + BALÃO

TABULEIRO

FEEDBACK / CONTROLES

PROGRESSO

No mobile:

┌───────────────────────┐
│ ←     Nível 18    ⚙  │
├───────────────────────┤
│ [avatar] ┌──────────┐ │
│          │ Encontre │ │
│          │ a melhor │ │
│          │ jogada.  │ │
│          └──────────┘ │
├───────────────────────┤
│                       │
│       TABULEIRO       │
│                       │
├───────────────────────┤
│ Dica     3/5    ...   │
└───────────────────────┘

O tabuleiro continua sendo o elemento principal.

==================================================
FASE 10 — INSTRUTOR
==================================================

Criar um personagem original para representar o Instrutor.

NÃO copiar o Coach da Chess.com.

Criar identidade visual própria compatível com a marca do produto.

Componentes:

InstructorAvatar
InstructorBubble
InstructorMessage
InstructorState

Estados:

neutral
thinking
hint
success
mistake
warning
celebration

Exemplos de mensagens:

INTRO:
"Jogam as pretas. Você encontra a melhor continuação?"

HINT_1:
"Observe primeiro as peças que estão sob ataque."

HINT_2:
"Existe uma jogada forçada nesta posição."

ERROR:
"Essa jogada permite uma defesa. Procure uma alternativa."

SUCCESS:
"Boa. Você encontrou a ideia principal."

COMPLETION:
"Nível concluído."

Não hardcode textos nos componentes.

Criar estrutura:

instructionalContent: {
  intro,
  hints[],
  errors[],
  success,
  explanation
}

==================================================
FASE 11 — DICAS VISUAIS NO TABULEIRO
==================================================

Criar um sistema progressivo de dicas.

Hint Level 0:
nenhuma ajuda.

Hint Level 1:
orientação verbal.

Hint Level 2:
orientação estratégica mais específica.

Hint Level 3:
destacar região/casa relevante.

Hint Level 4:
mostrar origem ou destino possível.

Se o sistema existente já possui engine/análise suficiente, permitir sugestões visuais como:

highlightSquare(square)
highlightPiece(square)
drawArrow(from, to)

Não revele imediatamente a solução.

A dica deve ensinar antes de entregar a resposta.

==================================================
FASE 12 — FEEDBACK DE JOGADAS
==================================================

Após cada jogada, fornecer feedback visual e textual.

Jogada correta:
- highlight positivo;
- reação do instrutor;
- continuação automática do oponente quando aplicável.

Jogada incorreta:
- feedback visual;
- explicação curta;
- permitir nova tentativa quando apropriado.

Não basta:

"Errado."

Preferir:

"Essa jogada perde a iniciativa porque o adversário consegue defender a peça."

Sempre que tecnicamente possível, explicar a razão.

==================================================
FASE 13 — INSTRUTOR FORA DOS DESAFIOS
==================================================

O Instructor deve ser arquitetura reutilizável.

Criar:

<InstructorContext />

ou equivalente adequado à stack existente.

O Instrutor poderá ser usado em:

- desafios;
- partidas;
- análise;
- treino;
- onboarding;
- revisão pós-partida.

No modo de partida, ele poderá futuramente reagir a:

best
excellent
good
inaccuracy
mistake
blunder

Não implemente avaliação duplicada caso já exista serviço de análise.

Consuma a infraestrutura existente.

==================================================
FASE 14 — CONCLUSÃO DO NÍVEL
==================================================

Ao concluir:

- marcar etapa;
- atualizar progresso;
- calcular desempenho;
- atualizar mastery;
- desbloquear próxima etapa quando aplicável.

Exibir tela curta de conclusão.

Exemplo:

NÍVEL 18 CONCLUÍDO

4/5 desafios
80% precisão
1 dica utilizada

[ CONTINUAR ]

Evite modal excessivamente complexo.

A recompensa principal deve ser progressão.

==================================================
FASE 15 — GAMIFICAÇÃO
==================================================

Preparar arquitetura para:

XP
streak
badges
worldCompletion
perfectLevel
dailyChallenge

Mas não transformar o produto em um sistema de pontos sem significado.

Prioridade:

1. aprendizagem;
2. progresso;
3. feedback;
4. domínio;
5. recompensa.

==================================================
FASE 16 — BIBLIOTECA / TREINO LIVRE
==================================================

O antigo Select não precisa desaparecer completamente.

Transforme-o em:

TREINO LIVRE

Usuário poderá escolher:

- tema;
- dificuldade;
- quantidade;
- favoritos;
- erros anteriores.

Assim teremos dois fluxos:

APRENDER
→ trilha guiada.

TREINAR
→ prática personalizada.

Isso preserva o valor funcional do sistema atual.

==================================================
FASE 17 — MODELO DE DADOS
==================================================

Proponha entidades equivalentes a:

LearningWorld
LearningLevel
LearningStage
Challenge
ChallengeAttempt
UserLearningProgress
SkillMastery
InstructorContent

Exemplo:

LearningLevel {
 id
 worldId
 order
 difficulty
 title
 description
 challengeCount
 unlockRule
}

UserLearningProgress {
 userId
 currentWorld
 currentLevel
 xp
 completedStages
 unlockedStages
}

ChallengeAttempt {
 userId
 challengeId
 stageId
 attempts
 mistakes
 hintsUsed
 duration
 completedAt
}

SkillMastery {
 userId
 skill
 score
 attempts
 updatedAt
}

Adapte tudo ao banco existente.

Não crie tabelas redundantes quando estruturas equivalentes já existirem.

==================================================
FASE 18 — ANALYTICS
==================================================

Adicionar eventos:

learning_path_opened
level_started
challenge_started
move_correct
move_incorrect
hint_requested
challenge_completed
challenge_abandoned
level_completed
checkpoint_completed
free_training_started

Permitir medir:

- completion rate;
- abandono;
- tempo por desafio;
- dicas por nível;
- erros por dificuldade;
- retenção;
- avanço médio;
- habilidades problemáticas.

==================================================
FASE 19 — ACESSIBILIDADE
==================================================

Garantir:

- keyboard navigation;
- screen reader labels;
- contraste;
- estados não dependentes somente de cor;
- reduced motion;
- tamanho adequado dos controles;
- descrição textual de feedback importante.

==================================================
FASE 20 — MIGRAÇÃO
==================================================

A migração deve ser incremental.

Não remover o sistema existente antes que a trilha esteja operacional.

Estratégia preferida:

1. manter challenges existentes;
2. adicionar metadata necessária;
3. criar estrutura de níveis;
4. criar progressão;
5. criar mapa;
6. integrar tabuleiro;
7. adicionar Instructor;
8. adicionar mastery;
9. migrar entrada principal;
10. mover Select atual para Treino Livre.

Se necessário, usar feature flag:

learningPathV2

==================================================
FASE 21 — ARQUITETURA
==================================================

Separar:

DOMÍNIO
progressão
mastery
unlock
seleção

CONTEÚDO
desafios
mensagens
níveis
currículo

UI
mapa
tabuleiro
instrutor
feedback

ANALYTICS
eventos
métricas

ENGINE
xadrez
validação
análise

Não misturar regras pedagógicas dentro de componentes React/UI.

==================================================
FASE 22 — NÃO REGRESSÃO
==================================================

Preservar integralmente:

- regras do xadrez;
- movimentação;
- validação;
- FEN;
- histórico;
- engine;
- desafios existentes;
- responsividade;
- autenticação;
- persistência existente.

Criar testes para:

unlockLevel()
completeChallenge()
calculateMastery()
selectNextChallenge()
requestHint()
completeLevel()

Adicionar testes de integração do fluxo:

mapa
→ nível
→ desafio
→ jogada
→ feedback
→ conclusão
→ desbloqueio.

==================================================
FASE 23 — ENTREGÁVEIS
==================================================

Antes de codificar, entregue:

1. auditoria da arquitetura atual;
2. inventário dos desafios;
3. proposta de classificação por dificuldade;
4. proposta de currículo;
5. modelo de progressão;
6. modelo de dados;
7. arquitetura dos componentes;
8. fluxograma do usuário;
9. estratégia de migração;
10. riscos;
11. plano de implementação por fases.

Depois implemente em etapas.

Não faça uma refatoração massiva de uma única vez.

Após cada etapa:
- executar testes;
- executar lint;
- executar typecheck;
- verificar regressões.

==================================================
CRITÉRIO FINAL
==================================================

Ao abrir a área de treinamento, o usuário deve imediatamente compreender:

"Estou aqui."
"Já completei isso."
"Esse é meu próximo desafio."
"Isso vem depois."

Ao iniciar um exercício:

"Entendo o objetivo."
"Tenho orientação caso precise."
"Se eu errar, entendo por quê."
"Se eu acertar, sei o que fiz corretamente."

Ao terminar:

"Eu avancei."
"Sei como fui."
"Quero continuar."

A transformação não é estética.

O sistema deve passar de:

CATÁLOGO DE EXERCÍCIOS

para:

JORNADA DE APRENDIZAGEM.
