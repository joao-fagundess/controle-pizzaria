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
| Apresentação em até três minutos | [Roteiro do vídeo](roteiro-video.md) |

Os 480 chamados são fictícios. A origem fornecida usa Java/MongoDB e não contém datas, prioridade, histórico ou considerações técnicas necessários aos indicadores completos. A recepção conserva os legados e motivos de rejeição; não inventa valores nem os inclui nos KPIs.

As suítes e evidências locais estão concluídas nas fases indicadas. A disponibilidade em produção depende de homologação da origem, autenticação/HTTPS e infraestrutura representativa. A medição de p95/carga permanece pendente. Repositório, autoria e autenticação da conta de destino foram confirmados; o estado real dos PRs e da candidata está registrado na Fase 6.
