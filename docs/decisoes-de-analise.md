# Premissas e decisões de análise

Registro da Fase 1 em 11/11/2026, atualizado até 12/11/2026 após as autorizações das Fases 2, 3 e 4. Modelo, API HTTP, recepção legada e frontend estão implementados; homologação operacional permanece pendente.

## Premissas

- O domínio é helpdesk de TI. O dashboard é de consulta e não altera chamados.
- A operação usa o fuso `America/Sao_Paulo`. Instantes são persistidos em UTC.
- Supervisor e técnico podem consultar o mesmo conjunto de chamados. Restrição por equipe, organização ou solicitante não foi solicitada; se necessária, deve ser definida antes de usar dados reais.
- A pasta de trabalho estava vazia ao iniciar a análise. Depois, o usuário forneceu `thindesk.zip`; a inspeção encontrou código Java/Spring Boot/MongoDB, endpoints, um objeto de exemplo e login por formulário/sessão. Não foi fornecida uma instância acessível para homologação.
- O desenvolvimento inicial pode usar PostgreSQL e seed fictício, com exemplos verossímeis de chamados e pessoas brasileiras. Isso permite validar a API própria e o frontend, mas não comprova sincronização com o Thindesk.
- Não se presume disponibilidade de acesso ao GitHub ou de remoto Git configurado. Gitflow e PRs pertencem à Fase 6; publicação depende de um repositório acessível.

## Decisões propostas

### DA01 — Manter a stack sugerida

Usar Express e TypeScript na API, PostgreSQL, React com Vite e Recharts, Zod, Vitest e Supertest. A stack atende às consultas e permite compartilhar a linguagem entre frontend e backend, sem exigir uma arquitetura adicional.

Fastify é uma alternativa válida, com validação e serialização integradas, mas não resolve uma necessidade específica deste escopo. Recomenda-se Express pela simplicidade do conjunto solicitado; a meta de desempenho será medida, não presumida.

### DA02 — Distinguir integração interna e integração externa

O frontend consumirá a API própria versionada em `/api/v1`, e a API consultará o PostgreSQL. O ZIP confirmou `GET /api/chamados` e `GET /api/clientes`, sem paginação. O conector de leitura será projetado a partir desses contratos observados, sem inventar campos ou garantia de atualização incremental.

| Alternativa para a origem real | Vantagem | Custo ou limitação |
| --- | --- | --- |
| Consulta direta à API do Thindesk | Menos cópia local de dados. | Dashboard depende da disponibilidade, limites e capacidade de agregação da origem. |
| Sincronização para PostgreSQL | Agregações previsíveis e histórico local consultável. | Exige processo de ingestão, identidade externa, política de atualização e monitoramento de defasagem. |

Decisão: manter a origem Java/MongoDB e receber os registros no PostgreSQL, coerente com a persistência solicitada. A Fase 2 acrescentou `ticket_source_records`, e a Fase 3 implementou login/leitura e recepção transacional de payloads incompletos, fora dos indicadores. Datas, prioridade, histórico e considerações não existem no modelo fornecido; a promoção para chamados normalizados exige evolução da origem ou contrato complementar. O conector legado não implementa essa promoção, e sua homologação exige instância acessível. Polling do dashboard atualiza a consulta à API própria; ele não sincroniza o Thindesk.

### DA03 — Definir atendido como concluído

Contar os status `resolved` e `closed` como atendidos. Isso representa entregas concluídas e impede que simples atribuições a técnicos aumentem o indicador. O formulário original sugere `ABERTO`, `EM_ANDAMENTO` e `CONCLUIDO`, mapeáveis para `open`, `in_progress` e `resolved`. `closed` e `waiting` fazem parte do modelo próprio, sem afirmar que já existem na origem.

Alternativa: contar qualquer chamado que recebeu uma interação. Essa interpretação mede atividade e inclui chamados ainda pendentes; não é recomendada para os indicadores de resolução pedidos.

### DA04 — Medir tempo corrido até a resolução vigente

“Tempo médio de atendimento” será a média entre criação e resolução vigente dos chamados atualmente concluídos da população selecionada. A regra inclui espera e reabertura; pode ser calculada e auditada sem um calendário de jornada ou política de SLA.

Alternativas: tempo até primeira resposta, horas úteis ou esforço efetivo. Elas medem fenômenos diferentes e exigem eventos ou calendários ainda não fornecidos. Não serão inferidas a partir de `updated_at`.

### DA05 — Dar significado explícito ao período

Usar criação para total, indicadores, distribuição e lista; usar resolução para série e ranking de atendimentos. Essa combinação responde tanto à entrada de demanda quanto às conclusões realizadas e será identificada nos títulos ou textos de apoio da interface.

| Alternativa | Vantagem | Custo ou limitação |
| --- | --- | --- |
| Criação em todas as consultas | Todas as visualizações usam a mesma população. | Exclui do atendimento do mês chamados criados anteriormente; agrupar por criação mede entrada, não entrega. |
| Data conforme o indicador, recomendada | Mostra entradas e conclusões em suas datas próprias. | Totais entre visualizações podem diferir; exige explicação visível e testes separados. |

Não acrescentar um seletor de base temporal nesta entrega. Os filtros de dimensões sempre usam a situação atual. A taxa de resolução é da população criada no período, e não a divisão entre o gráfico de conclusões e o total de entradas.

### DA06 — Consultar situação atual, preservando eventos

A série considera a resolução vigente de cada chamado. Reaberturas retiram o chamado do conjunto concluído até uma nova resolução; eventos anteriores permanecem consultáveis no histórico.

Alternativa: contar eventos de resolução, inclusive várias conclusões do mesmo chamado. Isso produz uma métrica histórica de eventos diferente da contagem de chamados e depende de histórico completo da origem. Fica fora da proposta atual.

### DA07 — Agregar no banco e manter a estrutura pequena

As agregações devem ocorrer no PostgreSQL para evitar transportar todos os chamados à API e ao navegador. Índices serão definidos conforme filtros e consultas na Fase 2; sua eficácia deverá ser verificada nos planos de execução.

Separar rotas, validação e acesso a banco quando houver responsabilidade concreta. Não criar services ou controllers que apenas repassem a chamada. Consultas envolvendo histórico e considerações devem preservar uma linha por chamado antes de contar ou paginar.

### DA08 — Padrões de consulta e atualização

Iniciar a interface nos últimos 30 dias, listagem com 25 itens e atualização a cada 60 segundos, configurável e desativável. Esses padrões oferecem contexto recente sem exigir consulta a todo o histórico a cada ciclo.

Polling é suficiente para uma tela analítica sem exigência de tempo real. WebSocket acrescentaria complexidade sem requisito correspondente. A interface deve expor a última consulta bem-sucedida e, havendo sincronização externa, distinguir a idade da origem da idade da consulta.

Na Fase 4, TanStack Query foi adotado para cache por seleção, cancelamento e refetch. O frontend valida as respostas com Zod; gráficos e detalhe são carregados em chunks separados. As seções têm estados próprios e não reaproveitam dados de outros filtros como placeholder. O polling espera o término das consultas e pausa em aba oculta, com configuração inicial de 60 segundos e seletor para desativar ou alterar o intervalo.

### DA09 — Segurança sem ampliar o produto para gestão de usuários

Prever acesso interno autenticado em ambiente compartilhado ou de produção, preferindo a infraestrutura corporativa existente. Não criar cadastro, recuperação de senha ou administração de permissões dentro desta entrega.

A alternativa local com seed fictício pode funcionar sem autenticação para desenvolvimento e demonstração. A política para dados reais precisa ser confirmada antes da disponibilização, especialmente porque considerações técnicas podem conter informações internas.

Na Fase 3, a API exige bearer configurado para produção ou escuta fora do loopback. É uma proteção técnica para acesso direto ou por gateway, sem implementar usuários/senhas do produto; autenticação corporativa e TLS ainda precisam de homologação. A demonstração embarcada é restrita ao loopback e não pode usar `NODE_ENV=production`.

### DA10 — Empacotar o ambiente local sem publicar dados reais

Na Fase 6, o Compose reúne PostgreSQL, migrations, API e frontend. O seed é explícito, o volume é persistente e só o Nginx publica porta no loopback. O token técnico fica no proxy; o navegador não recebe credenciais da API. Essa configuração atende à demonstração local, enquanto autenticação de pessoas, HTTPS e acesso corporativo continuam dependentes do ambiente real.

O diretório não possuía histórico Git. O baseline registra a implementação existente com data real; as features da Fase 6 registram seu empacotamento. O usuário informou a autoria de João Pedro Flor e o repositório `joao-fagundess/controle-pizzaria`; a autenticação da conta de destino foi confirmada. Não simular commits históricos ou revisão humana de PRs.

## Pontos a validar

Esses pontos não impedem a análise. A aprovação das premissas permite iniciar a modelagem e os dados fictícios; os itens de integração e acesso bloqueiam apenas o uso real correspondente.

| ID | Informação pendente | Momento em que é necessária |
| --- | --- | --- |
| PV01 | Parcialmente resolvido pelo ZIP: versão `1.0-alpha`, listagens sem paginação e login por sessão. Faltam URL operacional, acesso autorizado e limites de consumo. | Antes de homologar o conector real. |
| PV02 | O [contrato 1.0](contrato-complementar-thindesk.md), captura/export e [recepção versionada](recepcao-versionada-thindesk.md) foram homologados localmente. Mapeamento operacional e proveniência dos dados reais continuam pendentes; referências históricas não resolvidas são excluídas. | Antes de importar chamados reais para os indicadores completos. |
| PV03 | O ZIP original não possui considerações técnicas; a evolução local captura notas futuras com autoria do login. Confirmar produção operacional e quais usuários poderão acessá-las, com restrições por equipe se aplicáveis. | Antes de disponibilizar dados reais aos usuários do painel. |
| PV04 | Mecanismo corporativo de autenticação, ambiente de implantação e origens permitidas por CORS. | Antes da configuração do ambiente compartilhado ou de produção. |
| PV05 | Volume esperado, usuários simultâneos, infraestrutura e tolerância à defasagem dos dados do Thindesk. | Antes de validar desempenho e definir sincronização operacional. |
| PV06 | Regras da Fase 1 mantidas após a autorização para avançar; nova limitação de completude da origem registrada em `thindesk-inspecao.md`. | Revisar antes de homologar indicadores com a operação. |
| PV07 | Resolvido: repositório e autoria informados; autenticação como `joao-fagundess` confirmada. O usuário autorizou a integração e a tag em 12/11/2026, e os quatro PRs foram integrados. | Concluído no encerramento da Fase 6. |

## Conteúdo disponível para o vídeo final

As decisões de análise que podem ser explicadas no vídeo são: foco em helpdesk técnico; consulta pela API própria; definição de concluído; distinção entre criação e resolução; tempo corrido e tratamento de reaberturas; escolha de agregação no PostgreSQL; preservação de dados legados incompletos sem inventar datas. O [roteiro de 2min55s](roteiro-video.md) foi elaborado na Fase 6 com as evidências efetivamente produzidas.
