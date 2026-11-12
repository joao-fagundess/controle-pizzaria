# docs: propor contrato complementar para dados analíticos do Thindesk

O legado homologado não oferece os campos necessários aos indicadores completos. Esta proposta define um export versionado com datas, prioridade, vínculos estáveis, histórico e notas com cobertura explícita, preservando a distinção entre informação desconhecida e coleção vazia.

Inclui [decisões CP01–CP07](../contrato-complementar-thindesk.md), JSON Schema 2020-12, exemplos fictícios e testes estruturais. As regras de cronologia, identidade, catálogo, transições e idempotência estão separadas do schema, que não comprova validade de negócio nem veracidade dos dados.

Validação: [44 testes estruturais aprovados](../evidencias/contrato-thindesk.md), incluindo imutabilidade dos payloads e demonstração explícita dos limites do validador. O comando também foi acrescentado à CI; Ajv e ajv-formats são dependências de desenvolvimento.

Não há novo leitor de importação, alteração do Java original, migration ou mudança dos sete endpoints de produção. A aprovação do contrato precede a evolução da origem, a persistência de identidades de eventos/notas, os avisos de completude e a promoção transacional. Os legados continuam fora dos indicadores.

Base de revisão: `develop`. Proposta em rascunho para aprovação das regras e do caminho de implementação.
