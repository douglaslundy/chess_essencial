# Segurança e observabilidade — Fase 11

## Threat model

### Escopo e fronteiras de confiança

- Cliente web/mobile → API HTTP `/v1`: toda entrada é não confiável.
- Cliente → WebSocket `/v1/ws`: autenticação é obrigatória antes de entrar em salas.
- API → PostgreSQL: somente queries parametrizadas e migrations versionadas.
- API → logs/telemetria: nunca registrar tokens, senhas, e-mails completos ou payloads livres.
- GitHub → VPS: código de deploy chega exclusivamente por `git pull --ff-only`; SSH é apenas diagnóstico.

### Ativos protegidos

- credenciais, tokens e sessões;
- identidade, preferências de privacidade e relações de bloqueio;
- estado autoritativo das partidas, relógios, resultados e ratings;
- denúncias e trilhas de auditoria;
- disponibilidade da API, WebSocket e banco.

### Ameaças e controles

| Ameaça                                   | Risco                     | Controle da Fase 11                                                                                                                        |
| ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Força bruta e enumeração em autenticação | Crítico                   | rate limit mais restrito em `/v1/auth/*`, resposta de credencial uniforme e métricas sem identificadores pessoais                          |
| Flood ou payload excessivo no WebSocket  | Crítico                   | limite de payload, autenticação em 5 s, limite de comandos por conexão e fechamento por abuso                                              |
| Roubo ou reutilização de sessão          | Alto                      | access token curto, refresh rotativo com hash, revogação em reuse e auditoria de eventos de sessão                                         |
| XSS armazenado em perfil/anotações       | Alto                      | limites de schema, remoção de caracteres de controle e tags HTML em texto de usuário, headers CSP e `nosniff`                              |
| CSRF                                     | Baixo no transporte atual | autenticação Bearer e refresh token no corpo; cookies de autenticação não são usados. Se forem adotados, exigir SameSite e token anti-CSRF |
| Vazamento de dados em logs               | Alto                      | logs JSON com redaction por chave, request ID e ausência de corpo/header sensível                                                          |
| Acesso após bloqueio                     | Alto                      | bloqueio persistente e verificado em desafios/matchmaking; endpoints autenticados para gerenciar bloqueios                                 |
| Denúncias forjadas ou em massa           | Médio                     | autenticação, rate limit, unicidade por alvo/contexto e auditoria                                                                          |
| SSRF por URLs de perfil                  | Médio                     | somente URL validada; nenhum fetch de avatar é feito pelo backend                                                                          |
| SQL injection                            | Alto                      | Drizzle/Postgres parametrizados; SQL dinâmico não recebe fragmentos do cliente                                                             |
| Falta de diagnóstico durante incidente   | Alto                      | métricas HTTP/WS, logs estruturados correlacionados e spans OpenTelemetry opcionais via OTLP                                               |

### Achados aceitos ou adiados

- Recuperação de senha e entrega real de e-mail não fazem parte do escopo atual.
- Detecção avançada de fair play será posterior; nenhuma punição automática pode depender de um único sinal.
- Métricas não devem incluir `userId`, e-mail, token, FEN ou texto submetido para evitar cardinalidade e exposição.

## Política HTTP

- Limite global por IP e janela fixa, com limite específico mais baixo para autenticação e denúncias.
- Requisições mutáveis com corpo exigem `application/json`.
- Respostas incluem CSP, proteção contra MIME sniffing, clickjacking, política de referência e permissões.
- HSTS é emitido somente em produção, onde TLS deve terminar no proxy confiável.
- Erros seguem Problem Details e incluem `requestId`, sem stack trace na resposta.

## Política WebSocket

- Payload máximo: 16 KiB.
- Autenticação deve ocorrer em até 5 segundos.
- No máximo 30 comandos em uma janela de 10 segundos por conexão.
- No máximo 16 salas por conexão e 1.000 conexões simultâneas por processo.
- Comando excedente gera erro 429; abuso repetido encerra a conexão com código 4429.

## Logs, métricas e tracing

- Logs são JSON e carregam `requestId`, método, rota, status e duração.
- O endpoint Prometheus `/v1/metrics` expõe apenas métricas agregadas e pode ser protegido por token em produção.
- OpenTelemetry é habilitado quando `OTEL_EXPORTER_OTLP_ENDPOINT` estiver configurado; sem endpoint, a API continua funcional sem exportar dados.
- Health check não substitui métricas nem tracing.

## Privacidade e moderação

- Usuários controlam visibilidade do perfil, recebimento de desafios e pedidos de amizade.
- Bloqueios são direcionais e impedem pareamento/desafio entre qualquer uma das partes.
- Denúncias aceitam categorias enumeradas e texto curto sanitizado; o denunciante não pode alterar o estado de moderação.
- Ações sensíveis produzem `audit_logs` em `past_tense`, sem conteúdo livre ou dado secreto.
