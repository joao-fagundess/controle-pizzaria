# Análise e requisitos — Fase 1

Documento de análise em 11/11/2026, revisado após a inspeção do ZIP fornecido e autorização para avançar à modelagem. Ver `thindesk-inspecao.md` para evidências e limitações da origem.

## 1. Problema, objetivo e escopo

O responsável pela operação precisa consultar a situação dos chamados técnicos, identificar concentrações de demanda e acompanhar o atendimento com dados consistentes. O painel reunirá indicadores, gráficos, listagem e detalhes em uma interface de consulta.

**Decisão de domínio:** o produto trata de chamados técnicos de helpdesk de TI. Incidentes e solicitações como falhas de impressão, acesso à VPN e configuração de software pertencem ao escopo. Controle de pizzaria não pertence ao escopo, apesar do nome da pasta local.

Inclui RF01 a RF07, API própria de leitura, persistência PostgreSQL, histórico e considerações técnicas para consulta. A preparação dos dados de demonstração também pertence à entrega.

Não inclui nesta entrega: abertura ou edição de chamados pelo painel, mudança de status, atribuição de técnicos, escrita de considerações, notificações, anexos, exportação, cálculo de SLA e telas de administração de usuários. A integração de leitura com o Thindesk considera o contrato observado no ZIP; homologação depende de uma instância acessível. Dados de seed não serão apresentados como dados reais.

A origem fornecida não registra datas, prioridade, histórico ou considerações. Registros incompletos devem ser preservados na área de recepção, com motivos de rejeição, e não participar dos indicadores normalizados. O painel deverá informar a existência desses registros excluídos. A cobertura completa dos RFs com dados reais exige evolução da origem ou export complementar confiável; o seed permite verificar esses RFs apenas em demonstração.

## 2. Atores

| Ator | Papel e necessidade |
| --- | --- |
| Responsável pelos chamados / supervisor | Usuário principal. Acompanha indicadores, filtra a operação e consulta chamados, histórico e considerações técnicas. |
| Técnico de suporte | Usuário de consulta. Examina chamados e considerações, inclusive filtrando pelo responsável. Nesta proposta, tem o mesmo acesso de leitura do supervisor. |
| Solicitante | Pessoa que originou o chamado. É uma entidade do domínio, sem acesso ao painel previsto nesta entrega. |
| Thindesk | Sistema Java/MongoDB de referência. O código fornece listagem completa de chamados e clientes com autenticação por formulário/sessão; acesso operacional e sincronização ainda precisam de homologação. |

O navegador chama apenas a API própria. A API consulta o PostgreSQL; credenciais de banco e do Thindesk nunca devem ser expostas ao frontend. O seed é uma fonte de demonstração, não um ator operacional.

## 3. Casos de uso

Pré-condição comum: API e banco disponíveis e, em ambiente que exigir autenticação, usuário autorizado. A indisponibilidade segue o tratamento descrito em RF07.

| ID | Caso de uso | Fluxo e resultado esperado | Alternativa relevante |
| --- | --- | --- | --- |
| UC01 | Consultar visão geral | Usuário abre o painel; a aplicação carrega opções e consulta indicadores, gráficos e primeira página da lista com os mesmos filtros selecionados. | Sem chamados, apresenta contagens zero e estados vazios. |
| UC02 | Filtrar chamados | Usuário informa período, status, tipo, prioridade ou responsável e aplica os filtros; todas as consultas usam essa seleção e a lista volta à página 1. Limpar restaura os padrões. | Intervalo inválido impede a consulta e identifica o campo. |
| UC03 | Analisar atendimentos no tempo | Usuário escolhe dia, semana ou mês; o gráfico mostra chamados concluídos no intervalo, conforme RN03 e RN04. | Períodos sem conclusões aparecem com valor zero. |
| UC04 | Consultar situação e tipos | Usuário compara a distribuição por status atual e o ranking de tipos atendidos, com indicação da base temporal de cada visualização. | Sem conclusões, o ranking mostra estado vazio. |
| UC05 | Consultar chamados | Usuário navega nas páginas e altera a ordenação; a seleção de filtros permanece. A lista mostra a última consideração técnica interna disponível. | Chamado sem consideração apresenta “Sem considerações técnicas”. |
| UC06 | Examinar um chamado | Usuário abre o detalhe e consulta identificação, solicitante, técnico, situação, datas, considerações e histórico em ordem cronológica. | Identificador inexistente retorna 404 e mensagem legível. |
| UC07 | Atualizar a consulta | Usuário aciona “Atualizar” ou aguarda o polling; a aplicação consulta novamente a seleção atual. | Falha preserva a última consulta válida, informa desatualização e oferece nova tentativa. |

## 4. Requisitos funcionais e aceite

### RF01 — Indicadores gerais

Exibir total de chamados, abertos, em andamento, resolvidos, tempo médio de atendimento e taxa de resolução. Aplicar os filtros da consulta e as fórmulas de RN05. “Resolvidos” soma os status `resolved` e `closed`; a interface deve explicar essa composição.

Aceite: os indicadores coincidem com a mesma população filtrada da listagem; chamados em espera compõem o total e a distribuição. Sem população, contagens são zero e métricas sem base aparecem como “—”.

### RF02 — Chamados atendidos por período

Apresentar série de conclusões por dia, semana ou mês, selecionável por `group_by=day|week|month`. Usar a data da resolução vigente, completar intervalos sem ocorrências com zero e manter a ordenação cronológica.

Aceite: cada chamado elegível aparece uma vez no intervalo correto; semanas começam na segunda-feira; datas seguem o fuso da operação. O gráfico informa “Concluídos por data de resolução” para distinguir sua base da criação usada na visão geral.

### RF03 — Situação, listagem e considerações técnicas

Exibir distribuição por status atual e tabela paginada com identificação, título, tipo, prioridade, responsável, status, criação e última consideração técnica. Disponibilizar detalhe com solicitante, datas, histórico e todas as considerações internas fornecidas à API.

Aceite: distribuição e total do RF01 coincidem sob os mesmos filtros; somar as categorias reproduz o total. A listagem não duplica chamados por terem múltiplas considerações ou movimentações. Histórico e considerações identificam autor e instante; ausência de técnico ou de considerações tem apresentação explícita.

### RF04 — Ranking de tipos mais atendidos

Ordenar tipos pela quantidade de chamados atualmente concluídos cuja resolução vigente ocorreu no período, aplicando os demais filtros. Usar `limit` padrão 5, permitido de 1 a 20. Desempatar por nome do tipo e depois por identificador.

Aceite: o ranking conta chamados, não considerações ou eventos. Tipos sem conclusões são omitidos. Exibir “Tipos atendidos por data de resolução” e estado vazio quando aplicável.

### RF05 — Filtros, paginação e ordenação

Disponibilizar `start_date`, `end_date`, `status`, `type_id`, `priority` e `assignee_id`. Combinar filtros com E lógico; nesta entrega cada campo aceita um valor. As opções vêm da API, sem identificadores fixos no frontend. Limpar filtros restaura o período padrão dos últimos 30 dias de calendário, incluindo hoje, e as demais dimensões sem restrição.

Aceite: datas válidas no formato `YYYY-MM-DD`; limites informados sempre em par e início menor ou igual ao fim. A API sem ambas as datas consulta todo o histórico; apenas uma data é inválida. A interface sempre envia o par do período selecionado. Não há limite de intervalo nesta proposta.

Aceite: `page` começa em 1; `page_size` padrão 25 e máximo 100; resposta informa página, tamanho, total de registros e total de páginas. Página além da última devolve lista vazia. Ordenação padrão `created_at desc`, com `id` como desempate estável. Campos permitidos: `created_at`, `updated_at`, `resolved_at` e `priority`, com direção `asc` ou `desc`; prioridade segue a severidade, não a ordem alfabética. Valores nulos ficam por último.

### RF06 — Integração frontend–API própria

Centralizar as chamadas HTTP em uma camada de serviço. Consumir rotas versionadas em `/api/v1`, enviar filtros explicitamente e refazer as consultas ao aplicar filtros, mudar agrupamento ou atualizar. Alterar página ou ordenação refaz somente a listagem.

Aceite: frontend em execução usa respostas reais da API própria, sem indicadores calculados a partir de constantes locais. A documentação OpenAPI descreve parâmetros, respostas e erros; uma coleção `.http` permite reproduzir as consultas. A homologação contra Thindesk real exige acesso à instância, validação do contrato observado e solução para os campos ausentes.

### RF07 — Atualização, validação e estados da interface

Oferecer atualização manual e polling configurável, inicialmente em 60 segundos, com possibilidade de desativar. Suspender polling em aba oculta e evitar sobreposição de ciclos. Mostrar carregamento inicial, atualização em curso, estado vazio, erro e ação “Tentar novamente”. Exibir data/hora da última atualização bem-sucedida.

Aceite: resposta atrasada de filtros anteriores não substitui a seleção atual. Se uma consulta de uma seção falhar, essa seção informa o erro e a idade do conteúdo; não anuncia atualização completa. Ao trocar filtros, conteúdo anterior não aparece como pertencente à nova seleção. Repetir consulta não duplica registros.

Aceite: API valida parâmetros, tipos e intervalos; persistência rejeita relações e datas incoerentes. Textos, datas e durações são apresentados em pt-BR; instantes trafegam em ISO 8601. Valores externos desconhecidos não são convertidos silenciosamente para status válidos: a ingestão deve registrá-los e rejeitá-los ou separá-los para correção, conforme contrato a definir.

## 5. Regras de negócio

### RN01 — Identidade, classificação e responsáveis

Cada chamado possui identificador interno único, título, descrição, solicitante, tipo, prioridade, status e datas de criação e atualização. Pode não possuir técnico responsável. Se houver ingestão externa, preservar a identidade da origem e impedir duplicação por sistema de origem e identificador externo. A estrutura física será definida na Fase 2.

Tipos iniciais propostos: acesso e permissões, rede e conectividade, hardware, impressão e software. Prioridades propostas: `low`, `normal`, `high`, `urgent`, exibidas como Baixa, Normal, Alta e Urgente. Catálogos reais e seu mapeamento dependem do Thindesk.

### RN02 — Status e significado de atendido

| Código proposto | Texto | Grupo |
| --- | --- | --- |
| `open` | Aberto | Não concluído |
| `in_progress` | Em andamento | Não concluído |
| `waiting` | Em espera | Não concluído |
| `resolved` | Resolvido | Concluído |
| `closed` | Fechado | Concluído |

“Atendido” significa chamado atualmente concluído (`resolved` ou `closed`). Não significa primeiro contato ou mera atribuição a um técnico. Fechar um chamado já resolvido não conta como novo atendimento nem altera a data de resolução. Cancelamento não foi assumido como status; se existir na origem, sua regra deverá ser aprovada antes do mapeamento.

### RN03 — Datas e filtros comuns

Instantes são armazenados em UTC e interpretados no fuso `America/Sao_Paulo` para filtros e apresentação. Um intervalo de datas inclui ambos os dias completos: `instante >= início do primeiro dia` e `instante < início do dia seguinte ao último`, com limites convertidos para UTC. Não usar `23:59:59` como limite final. Datas ausentes na origem não serão inferidas do identificador MongoDB ou do instante de importação.

| Consulta | Data à qual `start_date` e `end_date` se aplicam |
| --- | --- |
| Indicadores, distribuição de status e listagem | Criação do chamado (`created_at`) |
| Série de atendimentos e ranking de tipos atendidos | Resolução vigente do chamado (`resolved_at`) |
| Detalhe por identificador e opções de filtros | Não recebem filtros de período |

Os filtros de status, tipo, prioridade e responsável sempre consideram os valores atuais. Na série e no ranking, o critério de conclusão se soma aos filtros; selecionar um status não concluído produz zero atendimentos, com explicação na interface.

Essa diferença temporal é intencional: indicadores descrevem a demanda criada no período e gráficos de atendimento descrevem entregas ocorridas no período. Um chamado criado antes do intervalo e resolvido dentro dele pode aparecer na série sem compor o total do RF01. Totais entre essas duas bases não devem ser apresentados como equivalentes.

### RN04 — Resolução, reabertura e histórico

`resolved_at` representa a resolução vigente e é obrigatório para chamados concluídos. Deve ser igual ou posterior a `created_at`. `updated_at` também não pode anteceder a criação. Uma transição direta para fechado precisa trazer uma data de resolução válida.

Reabrir remove a resolução vigente e mantém a resolução anterior no histórico. Uma nova conclusão recebe nova data. A série conta o chamado uma vez pela resolução vigente; não conta ciclos antigos de reabertura. Portanto, trata-se de uma visão da situação atual, sujeita a mudar após reaberturas, e não de uma reconstrução histórica dos atendimentos. Alterações de status, responsável, tipo e prioridade devem ser rastreáveis quando fornecidas pela origem.

Agrupamentos respeitam o calendário local: dia de calendário, semana iniciada na segunda-feira e mês de calendário. Intervalos cortados no meio da semana ou do mês contam apenas resoluções dentro dos limites selecionados; o rótulo pode indicar o início do agrupamento.

### RN05 — Fórmulas dos indicadores

Seja `selectedTickets` o conjunto filtrado pela criação e pelas dimensões atuais, e `completedTickets` seu subconjunto nos status `resolved` ou `closed`:

| Indicador | Regra |
| --- | --- |
| Total | Quantidade de `selectedTickets`. |
| Abertos | Quantidade de `selectedTickets` com status `open`. |
| Em andamento | Quantidade de `selectedTickets` com status `in_progress`. |
| Resolvidos | Quantidade de `completedTickets`, incluindo os fechados. |
| Tempo médio de atendimento | Média aritmética de `resolved_at - created_at` de `completedTickets`, calculada em segundos. |
| Taxa de resolução | `100 × completedTickets / selectedTickets`. |

O tempo mede horas corridas desde a criação até a resolução vigente, incluindo espera, noites, fins de semana e tempo anterior à reabertura. Não mede primeira resposta, esforço do técnico ou SLA. Manter precisão no cálculo; arredondar somente na apresentação. Exibir duração em horas e minutos e percentual com uma casa decimal.

Sem conclusões, tempo médio é `null`; sem chamados, taxa é `null`. O frontend exibe “—” em ambos os casos e não confunde ausência de base com tempo zero. Com chamados e nenhuma conclusão, a taxa é 0%. A distribuição inclui “Em espera”, por isso apenas somar Abertos, Em andamento e Resolvidos pode ser menor que o total.

Exemplo de aceite: três chamados selecionados, um aberto, um resolvido em 2 horas e um fechado em 6 horas, devem produzir total 3, abertos 1, em andamento 0, resolvidos 2, média 4 horas e taxa 66,7%.

### RN06 — Histórico e considerações técnicas

Cada movimentação deve identificar chamado, instante, autor quando conhecido, evento e valores anteriores/novos quando aplicáveis. Cada consideração deve identificar chamado, autor, conteúdo e instante. Ordem cronológica usa instante e identificador como desempate; a última consideração da tabela usa a ordem inversa.

Considerações são internas à operação e acessíveis somente aos usuários autorizados do painel. O seed usa dados fictícios. Registros importados sem autor devem mostrar “Autor não informado”, sem atribuir autoria fictícia. Conteúdo textual deve ser renderizado como texto, sem execução de HTML da origem.

### RN07 — Contrato e erros

Rotas de leitura retornam JSON; instantes usam ISO 8601 em UTC e identificadores têm formato único a definir na modelagem. Erros seguem `{ error: { code, message, details } }`; `message` é legível em português e `details` não expõe SQL, credenciais ou stack trace.

Usar 400 para formato ou tipo inválido; 422 para parâmetros bem formados mas semanticamente inválidos, como intervalo invertido, catálogo inexistente ou enumeração não permitida; 404 para chamado inexistente; 500 para falha inesperada, com mensagem genérica e correlação no log. O OpenAPI deve tornar essa distinção reproduzível.

## 6. Requisitos não funcionais

As metas quantitativas abaixo são critérios propostos para validação nas Fases 3 a 5, não resultados já medidos. O ambiente de medição deve ser registrado junto das evidências.

| ID | Área | Requisito e critério de verificação |
| --- | --- | --- |
| RNF01 | Desempenho | Buscar p95 de até 500 ms por consulta de leitura, com 10 mil chamados e 10 usuários concorrentes, após aquecimento, em ambiente de teste documentado. Usar paginação e validar planos das agregações e filtros. |
| RNF02 | Segurança de entrada | Validar parâmetros com lista de campos permitidos e Zod; usar SQL parametrizado, incluindo filtros e paginação. Ordenação só aceita campos previamente mapeados. Testar parâmetros maliciosos e inválidos. |
| RNF03 | Acesso e privacidade | Restringir acesso a usuários internos autorizados no ambiente compartilhado ou de produção, por autenticação corporativa ou proteção no gateway a definir. Ambiente local com seed fictício pode operar sem login. Confirmar a solução antes de expor dados reais; CORS não substitui autenticação. |
| RNF04 | Configuração segura | Credenciais apenas em variáveis de ambiente; disponibilizar `.env.example` sem segredos na implementação. CORS permite origens configuradas; tráfego externo de produção usa HTTPS. Logs não incluem textos de considerações, tokens ou dados pessoais desnecessários. |
| RNF05 | Usabilidade e acessibilidade | Interface e mensagens em pt-BR; filtros com rótulos, navegação por teclado, foco visível, mensagens anunciadas por tecnologias assistivas e status identificados também por texto. Atender contraste WCAG AA e fornecer alternativa textual aos gráficos. |
| RNF06 | Responsividade | Verificar larguras de 360, 768 e 1440 px. Sem rolagem horizontal na página; tabela pode ter rolagem em região própria. Filtros e ações permanecem utilizáveis nessas larguras. |
| RNF07 | Manutenibilidade | TypeScript em API e frontend; módulos pequenos com nomes do domínio; comentários de contexto em pt-BR e cabeçalhos de 1 a 3 linhas nos módulos relevantes. Evitar camadas que apenas repassam chamadas. Build, verificação de tipos e testes devem passar. |
| RNF08 | Confiabilidade | Erros não encerram o processo da API nem deixam carregamento infinito no frontend. Requisições do navegador têm timeout proposto de 15 s e cancelamento ao substituir a seleção. Falhas e respostas fora de ordem têm testes específicos. |
| RNF09 | Observabilidade | Registrar logs estruturados com identificador da requisição, rota, status e duração; falhas internas preservam contexto técnico apenas no servidor. Exibir última atualização no painel. Verificar a correlação de uma falha simulada sem expor informações sensíveis. |
| RNF10 | Reprodutibilidade | Migrations versionadas, seed reproduzível com centenas de chamados distribuídos irregularmente em vários meses e ambiente Docker Compose com banco, API e frontend. Testes de integração usam banco separado e não alteram dados da operação. |
| RNF11 | Documentação e validação | OpenAPI, testes unitários de cálculo, integração contra PostgreSQL, componentes principais, cobertura registrada e matriz RF → endpoint → teste. Não definir percentual arbitrário antes da implementação; todos os caminhos de negócio descritos devem ter cenários verificáveis. |

## 7. Rastreabilidade inicial

Os endpoints abaixo foram implementados na Fase 3. A Fase 4 acrescentou a integração frontend–API, atualização e estados da interface; ver `frontend.md` e `evidencias/fase-4.md`. A Fase 5 consolidou a [matriz com arquivos e cenários aprovados](rastreabilidade.md) e os [resultados de testes e cobertura](evidencias/fase-5.md), incluindo PostgreSQL independente por TCP.

| Requisito | Caso de uso | Rota prevista | Cenário de aceite prioritário |
| --- | --- | --- | --- |
| RF01 | UC01, UC02 | `GET /api/v1/dashboard/summary` | Fórmulas de RN05, fechado incluído e métricas sem base. |
| RF02 | UC03 | `GET /api/v1/dashboard/tickets-by-period` | Três agrupamentos, limites locais, zeros e reabertura. |
| RF03 | UC04, UC05, UC06 | `GET /api/v1/dashboard/status-distribution`, `GET /api/v1/tickets`, `GET /api/v1/tickets/:id` | Soma por status, paginação sem duplicação, considerações, histórico e 404. |
| RF04 | UC04 | `GET /api/v1/dashboard/top-ticket-types` | Conclusões por tipo, desempate e limite. |
| RF05 | UC02, UC05 | `GET /api/v1/filters/options` e rotas filtráveis acima | Filtros combinados, fim do período incluído e parâmetros inválidos. |
| RF06 | UC01–UC07 | Todas as rotas acima | Serviço HTTP consome a API e atualiza a seleção aplicada. |
| RF07 | UC01, UC02, UC07 | Todas as rotas acima | Loading, vazio, erro, nova tentativa, polling e resposta atrasada. |

## 8. Conclusão da fase

Entregues: definição de domínio e escopo, atores, casos de uso, RF01–RF07 detalhados, requisitos não funcionais, regras dos indicadores e rastreabilidade inicial. Premissas, alternativas e pendências estão em `decisoes-de-analise.md`.

Após a autorização do usuário e a inspeção da origem, a Fase 2 foi registrada em `modelagem.md`. A Fase 3 implementou as rotas documentadas em `endpoints.md` e a recepção descrita em `integracao-thindesk.md`. A Fase 4 entregou o dashboard descrito em `frontend.md`, com validação automatizada e no navegador. As limitações dos dados do Thindesk permanecem explícitas; a promoção de legados incompletos não foi implementada. A Fase 5 concluiu testes, cobertura e rastreabilidade. A entrega da Fase 6 fica nas branches de empacotamento e release.
