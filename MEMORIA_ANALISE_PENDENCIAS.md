# Memória — análise de pendências do projeto

## Data da análise

2026-07-30

## Atualização de execução

As pendências encontradas no log do Claude foram concluídas e publicadas no commit 0ad3d57. Na validação posterior, o CI revelou uma regressão de desserialização JSON; o usuário também relatou o estado visual incorreto dos desafios do Treinamento e pediu verificação do botão de teste da IA.

A nova leva corrige os três pontos: rank global dos níveis calculado corretamente, parser JSON/JSONB explícito no cliente PostgreSQL e teste de interface do botão Testar conexão. A suíte e2e da Jornada foi adicionada ao job PostgreSQL do CI para impedir retorno dessa regressão.

## Resumo executivo

O projeto Xadrez Essencial está tecnicamente avançado. A varredura realizada não encontrou marcadores `TODO`, `FIXME`, `HACK` ou equivalentes que representem implementação relevante ainda faltando no código-fonte ativo.

As pendências reais identificadas concentram-se em release, homologação visual, operação, lançamento mobile e saneamento da documentação.

## Estado do Git observado

- Branch atual: `main`.
- Estado: `main` estava 10 commits à frente de `origin/main`.
- Alteração não rastreada: diretório `livrocompleto/` contendo o arquivo `Xadrez_Essencial_Edicao_Completa_Douglas_Lundy.pdf`, com aproximadamente 21 MB.
- `git diff --check origin/main..HEAD` não apontou erros.
- Os 10 commits locais incluem a implementação do teste de conexão de provedores de IA, com endpoint, contratos, testes e interface administrativa.

## Prioridade imediata

### 1. Publicar e homologar os 10 commits locais

Trabalho necessário:

1. Executar os gates obrigatórios pertinentes antes do push, incluindo `git diff --check` e varredura de charset.
2. Fazer push da branch `main`.
3. Acompanhar os jobs da CI.
4. Confirmar o deploy automático.
5. Validar em produção o novo botão `Testar` para chaves de IA usando uma chave real.

### 2. Executar homologação visual em navegador

As seguintes alterações recentes têm testes automatizados, mas ainda precisam de conferência visual real:

- responsividade dos tabuleiros em desktop, mobile retrato e mobile paisagem;
- padronização das páginas administrativas;
- novo mapa visual da Jornada de Aprendizagem;
- layout da página de provedores de IA;
- alinhamento dos campos de provedor e modelo;
- dimensões do botão `Validar e listar modelos`;
- novo botão `Testar` e apresentação da resposta ou erro do provedor.

### 3. Impedir deploy antes da conclusão da CI

O arquivo `deploy/auto-deploy.sh` consulta `origin/main` e executa `git pull --ff-only` seguido do deploy assim que encontra um commit novo. Ele não consulta o resultado do GitHub Actions.

Risco confirmado: um push com CI vermelha pode ser implantado automaticamente antes da correção.

Tarefa recomendada: adicionar um gate que só permita implantar commits aprovados pela CI ou adotar uma referência/tag de release promovida após os testes.

## Pendências funcionais e operacionais

### 4. Resolver a execução do seed da Jornada

O comando `db:seed-learning-path` não está encadeado no deploy automático. Atualmente precisa ser executado manualmente quando o catálogo de exercícios muda de maneira relevante.

Decisão necessária:

- automatizar sua execução com garantias de idempotência e segurança; ou
- manter a execução manual e documentar formalmente o gatilho, o procedimento, a validação e o rollback.

### 5. Corrigir os dados antigos da Jornada sem dicas

O código já exige dicas não vazias ao fazer novos sorteios de exercícios. Entretanto, parte das 525 etapas criadas anteriormente em produção continua associada a exercícios sem dica.

A correção exige executar novamente `db:seed-learning-path`, reatribuindo as etapas com o filtro atualizado. O usuário decidiu anteriormente adiar essa operação, portanto esta é uma pendência conhecida e não um bug urgente de código.

### 6. Concluir o ciclo de lançamento mobile

O aplicativo Expo/React Native possui implementação extensa de autenticação, jogo, cursos e recursos sociais. A publicação ainda não foi realizada.

Trabalho restante para lançamento:

- criar ou configurar contas de desenvolvedor Apple e Google;
- definir identificadores, certificados e perfis de assinatura;
- produzir builds assinados;
- testar em aparelhos Android e iOS reais;
- preparar política de privacidade, textos, imagens e metadados das lojas;
- executar beta fechado;
- corrigir problemas encontrados na homologação;
- publicar nas lojas.

## Organização e governança

### 7. Reconciliar a documentação do projeto

Foram encontrados documentos que não representam corretamente o estado atual:

- a seção `Próxima tarefa` de `PROGRESSO.md` ainda descreve um incidente antigo de julho;
- `CHECKLIST.md` continua totalmente desmarcado, embora banco, autenticação, jogo, rating, curso, exercícios, admin, observabilidade e produção já tenham implementações registradas;
- planos antigos em `docs/superpowers/plans/` mantêm checkboxes vazios apesar de as funcionalidades correspondentes já estarem concluídas;
- `docs/COMPATIBILITY_MATRIX.md` possui referências antigas a fases pendentes;
- há registros históricos de limitações que foram resolvidas posteriormente e não devem ser tratados automaticamente como backlog atual.

Tarefa recomendada: consolidar o estado atual em uma fonte confiável, mantendo histórico separado de backlog executável.

### 8. Decidir o destino do PDF não versionado

Arquivo encontrado:

`livrocompleto/Xadrez_Essencial_Edicao_Completa_Douglas_Lundy.pdf`

O arquivo tem aproximadamente 21 MB e aparece como não rastreado pelo Git.

Decisão necessária:

- versionar normalmente;
- usar Git LFS;
- manter apenas como fonte local e adicioná-lo ao `.gitignore`;
- armazená-lo em repositório privado ou storage externo.

Antes de versioná-lo, verificar direitos de distribuição, política de acesso e impacto no tamanho do repositório.

### 9. Auditar o checklist executivo

O checklist atual não é uma fonte confiável, pois todos os itens permanecem desmarcados. Deve ser auditado contra o código, a documentação e a infraestrutura.

Itens que precisam de confirmação explícita:

- domínio e marca;
- política de privacidade e termos;
- ambiente de staging;
- backups e teste periódico de restauração;
- observabilidade operacional;
- testes de carga e segurança;
- critérios e execução de beta fechado;
- critérios formais de produção e lançamento.

Não se deve considerar automaticamente que todos esses itens estão faltando: vários já possuem implementação parcial ou completa, mas o documento não foi atualizado.

## Itens que não devem ser tratados como pendências atuais sem nova verificação

- Menções antigas a `SETTINGS_ENCRYPTION_KEY`: os registros posteriores mostram que a aplicação já salvou e leu chaves criptografadas em produção, portanto a configuração provavelmente já existe.
- Registros antigos sobre falta de HTTPS: a documentação posterior registra produção atrás de Traefik com HTTPS e Let's Encrypt.
- Pendências intermediárias das Fases 18 a 22: muitas aparecem em entradas históricas, mas foram concluídas em entradas posteriores.
- Checkboxes vazios dentro de planos de implementação antigos: não constituem, isoladamente, prova de trabalho faltante.

## Ordem sugerida para a próxima execução

1. Revalidar os 10 commits locais e publicar.
2. Acompanhar CI e deploy até a versão nova estar saudável.
3. Homologar o botão de teste de IA e as mudanças visuais recentes.
4. Corrigir o risco do deploy não aguardar CI.
5. Definir a política do seed da Jornada e dos exercícios sem dica.
6. Atualizar `PROGRESSO.md`, `TAREFAS.md`, `CHECKLIST.md` e documentos de auditoria.
7. Decidir o destino do PDF não rastreado.
8. Planejar homologação e publicação do aplicativo mobile.

## Arquivos principais consultados

- `AGENTS.md`
- `README.md`
- `package.json`
- `PROGRESSO.md`
- `TAREFAS.md`
- `ROADMAP.md`
- `CHECKLIST.md`
- `deploy/auto-deploy.sh`
- `docs/DEPLOY_GIT_PULL.md`
- `docs/RELEASE_RUNBOOK.md`
- `docs/COMPATIBILITY_MATRIX.md`
