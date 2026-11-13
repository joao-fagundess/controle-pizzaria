# Documentação da entrega

Os documentos abaixo explicam como o painel de chamados funciona, como executar o projeto e quais testes foram realizados. O sistema consulta uma API própria e recebe dados do Thindesk por uma integração de leitura.

| Conteúdo | Documento |
| --- | --- |
| Atores, casos de uso, RF01–RF07 e requisitos não funcionais | [Requisitos](requisitos.md) |
| Premissas e justificativas de análise/projeto | [Decisões](decisoes-de-analise.md) |
| Inspeção do Thindesk fornecido | [Origem e campos ausentes](thindesk-inspecao.md) |
| Modelo Mermaid, chaves, constraints e índices | [Modelagem](modelagem.md) |
| Rotas, parâmetros, erros e execução da API | [Endpoints](endpoints.md), [OpenAPI](openapi.json), [coleção HTTP](requisicoes.http) |
| Recepção dos registros legados | [Integração](integracao-thindesk.md) |
| Dashboard, filtros, atualização e responsividade | [Frontend](frontend.md) |
| Seed e integridade | [Banco e seed](evidencias/banco.md) |
| API, conector e inspeção SQL | [API](evidencias/api.md) |
| Capturas reais e comportamento no navegador | [Interface](evidencias/interface.md) |
| Testes consolidados e cobertura | [Testes e cobertura](evidencias/testes.md) |
| RF → endpoint → cenário aprovado | [Rastreabilidade](rastreabilidade.md) |
| Banco, API e frontend em contêineres | [Implantação](implantacao.md), [Compose](../docker-compose.yml) |
| Organização de branches e revisão | [Gitflow](gitflow.md) |
| Verificação e pendências da entrega | [Compose](evidencias/compose.md) |
| Escopo e integração da versão 0.1.0 | [Notas da versão](versao-0.1.0.md) |
| Homologação complementar do código original do ZIP | [Procedimento](homologacao-thindesk.md), [evidências](evidencias/thindesk-local.md) |
| Evolução dos dados da origem | [Contrato complementar aprovado](contrato-complementar-thindesk.md), [testes do schema](evidencias/contrato-thindesk.md) |
| Captura e export na cópia local derivada | [Procedimento e limites](evolucao-local-thindesk.md), [relatório HTTP](evidencias/thindesk-analytics/report.json) |
| Recepção 1.0, promoção transacional e completude | [Operação](recepcao-versionada-thindesk.md), [evidências](evidencias/thindesk-import.md) |
| Encerramento solicitado pelo usuário | [Estado final e limites](encerramento.md) |
| Apresentação em até três minutos | [Roteiro do vídeo](roteiro-video.md) |

Os 480 chamados são fictícios. A origem fornecida usa Java/MongoDB e não contém datas, prioridade, histórico ou considerações técnicas necessários aos indicadores completos. A recepção conserva os legados e motivos de rejeição; não inventa valores nem os inclui nos KPIs.

As funcionalidades previstas da primeira entrega foram concluídas em 12/11/2026. Depois, o projeto recebeu a homologação local do Thindesk e o importador do contrato `1.0`. A `main` reúne essa evolução e a revisão dos textos; a tag `v0.1.0` preserva a primeira versão.

O projeto está preparado para demonstração e homologação local. Antes do uso operacional, ainda é preciso validar a instância real do Thindesk, autenticação, HTTPS e infraestrutura. O tempo de resposta sob carga, incluindo p95, ainda não foi medido.
