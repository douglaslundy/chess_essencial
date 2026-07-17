# AGENTS.md — Regras para o Codex

## Missão
Construir e manter a plataforma Xadrez Essencial seguindo este blueprint. O backend é API-first e independente do frontend.

## Princípios obrigatórios
1. O servidor é autoritativo para regras, relógio, resultado e rating.
2. Nunca confiar em FEN, tempo restante ou resultado enviados pelo cliente.
3. Toda jogada confirmada deve ser persistida de forma idempotente.
4. Cada partida deve poder ser reconstruída integralmente.
5. Rating é separado por pool de tempo.
6. Não chamar o rating interno de “oficial FIDE”.
7. APIs devem ser versionadas em `/v1`.
8. Toda alteração de banco deve ter migration e rollback documentado.
9. Código crítico exige testes unitários e de integração.
10. Frontend e backend não compartilham acesso direto ao banco.

## Workflow do Codex
- Antes de editar: inspecione árvore, scripts, testes e convenções.
- Faça plano breve e declare arquivos afetados.
- Implemente em pequenos commits lógicos.
- Execute lint, typecheck, unit, integração e e2e pertinentes.
- Não esconda falhas de teste.
- Não remova funcionalidade sem registrar decisão.
- Atualize OpenAPI e documentação quando contratos mudarem.

## Convenções
- TypeScript strict.
- IDs UUID v7 quando disponível, caso contrário UUID v4.
- Datas UTC no backend; timezone apenas na apresentação.
- Dinheiro em minor units; não aplicável ao rating.
- Eventos em `past_tense`, por exemplo `game.move_committed`.
- Erros HTTP em Problem Details (`application/problem+json`).
- Logs sem senhas, tokens, e-mails completos ou dados sensíveis.

## Deploy obrigatório por Git pull

- O GitHub `douglaslundy/chess_essencial` é a única origem de código para deploy.
- Nunca transferir código de deploy com SSH, SCP, tar, `docker cp` ou edição direta na VPS.
- Após testes e critérios de aceite, commitar e fazer push na branch `main`.
- A VPS deve obter mudanças exclusivamente por `git pull --ff-only`, executado pelo agendador local `deploy/auto-deploy.sh`.
- SSH pode ser usado somente para diagnóstico operacional; não para disparar deploy.
- Antes do push, executar `git diff --check`, varredura de charset/secrets e os testes pertinentes.

## Definition of Done
- Critérios de aceite atendidos.
- Testes adicionados.
- Migração aplicada em ambiente limpo.
- API documentada.
- Acessibilidade básica verificada.
- Sem secrets no repositório.

## Regras de Gerenciamento de Contexto e Memória

# REGRA OBRIGATÓRIA — Gerenciamento de Contexto e Memória de Projeto (Codex)

> Prioridade máxima. Executar em TODA sessão, sem exceção, antes de qualquer outra ação.

---

## 0. Estabilidade deste arquivo

- Este arquivo (`AGENTS.md`) é lido e cacheado no início de cada sessão. NÃO o edite a cada tarefa concluída — isso quebra o cache de prompt e aumenta o custo de todas as próximas execuções.
- Todo o estado dinâmico (tarefa atual, progresso, decisões do dia a dia) vive em `PROGRESSO.md` e `TAREFAS.md`, nunca aqui.
- Só edite este arquivo quando uma convenção estrutural do projeto mudar de fato (ex: nova arquitetura, novo padrão de teste).

---

## 1. Ao iniciar qualquer ação nesta sessão

- Antes de fazer qualquer outra coisa, leia o arquivo `PROGRESSO.md` na raiz do projeto.
  - Se não existir, crie-o.
- Se ele já tiver uma seção "PRÓXIMA TAREFA", trate-a como o ponto de retomada.
  - Não peça ao usuário para reexplicar o que já está registrado ali.
- Leia somente os arquivos indicados na seção "Contexto necessário" daquela tarefa.
  - Não explore o restante do repositório "por segurança" — isso consome tokens sem necessidade.

---

## 2. Durante a execução de uma tarefa

A cada passo importante concluído (função implementada, bug corrigido, decisão de arquitetura tomada), atualize `PROGRESSO.md` imediatamente com:

- O que foi feito (1–3 linhas, direto ao ponto)
- Arquivos alterados
- Decisões que não sejam óbvias só de olhar o código (ex: "optei por X em vez de Y porque Z")

Não espere terminar a tarefa inteira para salvar. Se a sessão cair ou a energia acabar no meio, o próximo passo precisa ser recuperável só lendo `PROGRESSO.md`.

---

## 3. Ao concluir uma tarefa

1. Marque a tarefa como concluída em `PROGRESSO.md`.
2. Leia a próxima tarefa em `TAREFAS.md` (ou backlog equivalente).
3. Reescreva a seção "Contexto necessário" de `PROGRESSO.md` contendo apenas o que é relevante para a próxima tarefa (arquivos, decisões, dependências).
   - Descarte explicitamente tudo que pertencia só à tarefa anterior.
4. Não é necessário pedir para "limpar contexto" manualmente — o Codex compacta automaticamente a conversa quando a janela se enche. Mesmo assim, garanta que `PROGRESSO.md` já contenha tudo que for necessário para retomar, já que a compactação automática pode resumir e perder detalhes finos.

---

## 4. Economia de tokens (regra contínua)

- Nunca releia um arquivo inteiro se só uma função/trecho é relevante — use busca (grep/rg) ou leitura parcial.
- Nunca repita no chat o conteúdo de arquivos já lidos; referencie por nome/caminho.
- Prefira resumos curtos a transcrições completas de código já existente.
- Se um arquivo de contexto crescer demais, resuma-o em `PROGRESSO.md` em vez de mantê-lo verboso.
- Ao rodar comandos exploratórios (listar diretórios, grep amplo), prefira escopos específicos em vez de varrer o repositório inteiro.

---

## 5. Recuperação após interrupção

Se o usuário disser "continue de onde parou" (ou similar):

1. Ler `PROGRESSO.md`.
2. Identificar a última tarefa marcada como "em andamento" ou a "PRÓXIMA TAREFA".
3. Carregar apenas o contexto indicado nela.
4. Retomar sem pedir esclarecimentos adicionais, a menos que estritamente necessário.
5. Se houver sessão local anterior disponível (histórico do Codex), pode ser usada como apoio, mas `PROGRESSO.md` é sempre a fonte de verdade principal, pois sobrevive a quedas de energia e perda de sessão.

---

## 6. Persistência desta regra

Esta regra deve permanecer salva neste arquivo (`AGENTS.md`) e ser tratada como instrução permanente — não deve ser repetida pelo usuário a cada sessão.

---

### Estrutura de referência

    projeto/
    ├── AGENTS.md          ← esta regra (lida automaticamente pelo Codex, estável, pouco editada)
    ├── PROGRESSO.md       ← estado atual, decisões, próxima tarefa (editado a cada passo)
    └── TAREFAS.md         ← backlog / lista de tarefas

### Modelo sugerido para PROGRESSO.md

    # Progresso do Projeto

    ## Última atualização
    [data e hora]

    ## Tarefa em andamento
    [descrição da tarefa atual]

    ## Contexto necessário
    - [arquivos relevantes]
    - [decisões importantes]

    ## Concluído
    - [x] [tarefas já finalizadas]

    ## Próxima tarefa
    [descrição da próxima tarefa]
