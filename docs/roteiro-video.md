# Roteiro do vídeo — até três minutos

Duração planejada: **2min55s**, com cinco segundos de margem. O vídeo demonstra o projeto e dados fictícios; não apresentar a origem Thindesk real como homologada.

| Tempo | Tela | Fala e ação |
| --- | --- | --- |
| 0:00–0:20 | Dashboard aberto | “Este painel acompanha chamados técnicos de helpdesk. Ele reúne volume, situação, atendimento e considerações técnicas para apoiar o responsável pela operação.” Apontar o aviso de demonstração. |
| 0:20–0:45 | Modelo em `docs/modelagem.md` | “A API própria usa PostgreSQL, com catálogos, responsáveis, solicitantes, histórico e notas. Mantive o histórico separado da situação atual para preservar reaberturas sem duplicar chamados nos indicadores.” Mostrar o Mermaid já renderizado. |
| 0:45–1:10 | KPIs e gráficos | “Resumo e lista usam a data de criação. Série e ranking usam a resolução vigente. Resolvidos inclui fechados; a média considera horas corridas desde a criação. Reaberturas retiram o chamado das conclusões até uma nova resolução.” Mostrar os textos de base temporal. |
| 1:10–1:55 | Filtros, série e detalhe | Alterar período e status, clicar **Aplicar filtros**, observar cards/lista. Alternar **Dia**, **Semana** e **Mês**. Abrir um chamado com nota e mostrar considerações e histórico; fechar. Limpar os filtros. |
| 1:55–2:15 | Atualização e Swagger | Clicar **Atualizar dados**, apontar a última consulta e o seletor de polling. Abrir o Swagger para mostrar as sete rotas, filtros validados e erros padronizados. |
| 2:15–2:40 | Relatórios de teste e matriz | “Passaram 99 casos distintos, repetindo o backend em dois bancos: 176 execuções e mais 13 verificações HTTP da API compilada. A cobertura de linhas foi 80,45% na API e 91,50% no frontend.” Mostrar o resumo da validação consolidada e um RF na matriz. Mostrar também o resultado real da validação do Compose, conforme a evidência disponível. |
| 2:40–2:55 | README e limitações | “O Compose reúne banco, API e frontend, com seed opcional. O Thindesk fornecido não possui os campos analíticos completos: preservei os registros incompletos fora dos indicadores. A homologação real depende do acesso à origem e desses campos.” |

## Preparação

1. Iniciar o ambiente conforme [implantacao.md](implantacao.md), carregar o seed e selecionar um período com dados. Usar resolução de 1440 × 900 ou equivalente e zoom legível.
2. Escolher antecipadamente um chamado com consideração técnica e histórico, para abrir sem procurar durante a gravação.
3. Deixar abas locais para dashboard, Swagger, Mermaid renderizado, [resumo de testes](evidencias/testes/summary.json), [matriz](rastreabilidade.md) e [relatório do Compose](evidencias/compose/compose-report.json).
4. Executar as verificações antes de gravar. Mostrar resultados já concluídos; instalações e builds não cabem em três minutos.
5. Manter `.env`, tokens, cookies, conexão de banco e credenciais fora das telas. Não abrir a configuração interpolada completa do Compose.

Não afirmar cumprimento de p95, integração com Thindesk real, autenticação corporativa ou PRs publicados sem evidência correspondente. O vídeo em si não foi produzido por este roteiro.
