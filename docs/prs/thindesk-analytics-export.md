# feat: capturar e exportar dados analíticos no Thindesk local

O Thindesk original não registra os dados necessários aos indicadores. A derivação local passa a capturar novos chamados com datas reais, prioridade, identidades, notas e histórico; publica o export `1.0` aprovado no PR #6. Chamados antigos permanecem identificados como excluídos do export, sem preenchimento retroativo.

O ZIP e os 29 arquivos extraídos são verificados e preservados. Dois módulos Java e extensões verificadas do serviço legado são compilados em contexto separado, com MongoDB/volume próprios e porta 8082. Revisão otimista protege edições concorrentes; a API legada conserva a leitura e as escritas dos registros antigos, retornando `409` para escritas que apagariam fatos complementares.

Validação: build Maven/Java 23, testes HTTP reais com MongoDB, schema estrito Ajv, resolução/fechamento/reabertura, notas concorrentes, proteção das escritas legadas, export acima de 5 MiB e preservação das fixtures e do painel anterior. O relatório contém os resultados efetivamente obtidos. A CI pública não tem acesso ao ZIP; os testes do Java são locais. Não implementa recepção versionada ou promoção no painel.

- [Procedimento e limites](../evolucao-local-thindesk.md).
- [Relatório local](../evidencias/thindesk-analytics/report.json).
- [Export fictício produzido](../evidencias/thindesk-analytics/export.json).
