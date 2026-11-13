# Encerramento da entrega local

Entrega encerrada a pedido do usuário em **13/11/2026**, sem iniciar outra fase de desenvolvimento.

O [PR #8](https://github.com/joao-fagundess/controle-pizzaria/pull/8) foi integrado em `develop`, commit `c694adc3d27337296139e499df23f6f2986b5cc4`, após conferir o head aprovado e a [CI bem-sucedida](https://github.com/joao-fagundess/controle-pizzaria/actions/runs/43427349062). A evolução reúne recepção explícita 1.0, validação semântica, migrations incrementais, controle de versão/fatos e proveniência/completude na API e na interface. `main` e a tag `v0.1.0` preservam a primeira entrega; não foi criada outra release.

| Ambiente | Estado da entrega |
| --- | --- |
| [Demonstração principal](http://127.0.0.1:8080/) | 480 chamados fictícios preservados. |
| [Dashboard de homologação](http://127.0.0.1:8180/) | Três chamados aceitos, dois concluídos e seis registros rejeitados preservados. |
| Thindesk original em 8081 | Código/ZIP preservados; contrato legado continua sem promoção. |
| Origem analítica em 8082 | Imagem e volume preservados, serviço parado para economizar memória. |

A validação registrada inclui 108 casos de backend no PostgreSQL nativo, 14 de integridade, 13 verificações HTTP da API compilada, 25 testes de frontend e 44 testes estruturais do contrato. A imagem de produção passou por 27 verificações HTTP e cinco grupos adicionais de integração. Evidências, capturas e resultados completos estão em [recepção 1.0](evidencias/thindesk-import.md).

Os seis rejeitados não foram descartados: três pertencem ao contrato legado incompleto e três dependem de cadastro histórico não fornecido no export. Resolver essas referências fica como pendência da origem, fora deste encerramento. A aplicação não inventa dados para incluí-los nos indicadores.

Este encerramento cobre a demonstração e a homologação **locais, com dados fictícios**. Não declara implantação operacional ou validação de carga/autenticação corporativa. O [roteiro do vídeo](roteiro-video.md) está entregue; a gravação continua pendente conforme o registro da primeira entrega.

Para uso e manutenção, consultar [operação da recepção](recepcao-versionada-thindesk.md), [implantação](implantacao.md) e [documentação da entrega](entrega.md). As credenciais locais permanecem no cache ignorado pelo Git e não constam dos relatórios publicados.
