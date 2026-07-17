# Segurança, privacidade e fair play

## Autenticação

- senha com Argon2id;
- access token curto;
- refresh token rotativo, hash no banco;
- cookies HttpOnly/Secure/SameSite quando web;
- mobile usa secure storage;
- verificação de e-mail e recuperação com token de uso único.

## WebSocket

- autenticar handshake;
- autorização por sala;
- limite de comandos;
- tamanho máximo de payload;
- validação de schema;
- sequência e idempotência.

## Jogo justo

MVP:
- servidor autoritativo;
- detecção de múltiplas contas por sinais, sem decisões automáticas;
- logs de tempo por lance;
- sinalização de padrões improváveis;
- denúncias e revisão manual.

Futuro:
- análise estatística de coincidência com engine;
- classificação de risco;
- nunca banir exclusivamente por um único indicador automatizado;
- processo de recurso e auditoria.

## Menores e privacidade

- coletar apenas dados necessários;
- perfil privado por padrão para menores, se idade for conhecida;
- sem exposição de e-mail/data de nascimento;
- controles de chat e bloqueio;
- política de retenção e exclusão.

## OWASP

- CSRF conforme estratégia de cookie;
- XSS: sanitizar Markdown e conteúdo de usuário;
- SSRF: allowlist em importadores;
- SQL injection: queries parametrizadas;
- upload: scan, MIME real e limites;
- secrets em vault.
