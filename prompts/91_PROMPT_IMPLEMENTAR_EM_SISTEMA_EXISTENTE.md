# Prompt para integração em sistema existente

Inspecione o repositório atual antes de criar arquivos. Preserve autenticação, design system e infraestrutura existentes quando compatíveis. Mapeie os módulos do blueprint para a arquitetura atual e proponha um plano de migração incremental sem big-bang.

Regras:
- não duplicar entidades existentes;
- criar adapters para contratos divergentes;
- migrations backward-compatible;
- feature flags para jogo, curso e exercícios;
- manter API antiga até clientes migrarem;
- fornecer scripts de backfill e rollback;
- medir e comparar comportamento antes/depois.

Implemente por fatias verticais: cadastro → jogar → finalizar → revisar; depois curso; depois exercícios.
