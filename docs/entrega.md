# Documento final da entrega

Dashboard administrativo de **chamados técnicos de helpdesk** integrado à API própria. Este índice reúne os documentos finais sem duplicar regras ou resultados históricos.

| Conteúdo | Documento |
| --- | --- |
| Atores, casos de uso, RF01–RF07 e requisitos não funcionais | [Requisitos](requisitos.md) |
| Premissas e justificativas de análise/projeto | [Decisões](decisoes-de-analise.md) |
| Inspeção do Thindesk fornecido | [Origem e campos ausentes](thindesk-inspecao.md) |
| Modelo Mermaid, chaves, constraints e índices | [Modelagem](modelagem.md) |
| Rotas, parâmetros, erros e execução da API | [Endpoints](endpoints.md), [OpenAPI](openapi.json), [coleção HTTP](requisicoes.http) |
| Recepção dos registros legados | [Integração](integracao-thindesk.md) |
| Dashboard, filtros, atualização e responsividade | [Frontend](frontend.md) |
| Seed e integridade | [Fase 2](evidencias/fase-2.md) |
| API, conector e inspeção SQL | [Fase 3](evidencias/fase-3.md) |
| Capturas reais e comportamento no navegador | [Fase 4](evidencias/fase-4.md) |
| Testes consolidados e cobertura | [Fase 5](evidencias/fase-5.md) |
| RF → endpoint → cenário aprovado | [Rastreabilidade](rastreabilidade.md) |
| Banco, API e frontend em contêineres | [Implantação](implantacao.md), [Compose](../docker-compose.yml) |
| Organização de branches e revisão | [Gitflow](gitflow.md) |
| Verificação e pendências da entrega | [Fase 6](evidencias/fase-6.md) |
| Escopo e integração da versão 0.1.0 | [Notas da versão](versao-0.1.0.md) |
| Homologação complementar do código original do ZIP | [Procedimento](homologacao-thindesk.md), [evidências](evidencias/thindesk-local.md) |
| Evolução dos dados da origem | [Contrato complementar aprovado](contrato-complementar-thindesk.md), [testes do schema](evidencias/contrato-thindesk.md) |
| Captura e export na cópia local derivada | [Procedimento e limites](evolucao-local-thindesk.md), [relatório HTTP](evidencias/thindesk-analytics/report.json) |
| Recepção 1.0, promoção transacional e completude | [Operação](recepcao-versionada-thindesk.md), [evidências](evidencias/thindesk-import.md) |
| Encerramento solicitado pelo usuário | [Estado final e limites](encerramento.md) |
| Apresentação em até três minutos | [Roteiro do vídeo](roteiro-video.md) |

Os 480 chamados são fictícios. A origem fornecida usa Java/MongoDB e não contém datas, prioridade, histórico ou considerações técnicas necessários aos indicadores completos. A recepção conserva os legados e motivos de rejeição; não inventa valores nem os inclui nos KPIs.

As seis fases foram entregues, e os quatro PRs foram integrados com autorização do usuário em 12/11/2026. A disponibilidade em produção depende de homologação da origem, autenticação/HTTPS e infraestrutura representativa. A medição de p95/carga permanece pendente. O estado real dos PRs está registrado na Fase 6; a versão `0.1.0` reúne a entrega aprovada para uso local.
