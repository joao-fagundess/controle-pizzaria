# Interface do painel

Interface React/TypeScript com Vite, Recharts e TanStack Query, concluída em 12/11/2026. Consome os sete endpoints da API própria; não usa respostas fixas nem calcula os indicadores com dados locais. A origem real do Thindesk continua sujeita às limitações descritas em [integracao-thindesk.md](integracao-thindesk.md).

## Executar localmente

Pré-requisito: Node.js 24 ou superior. Abrir dois terminais na raiz do projeto.

Terminal da API, para uma demonstração com banco descartável e dados fictícios:

```powershell
Set-Location api
npm.cmd ci
npm.cmd run build
npm.cmd run start:demo
```

Terminal do frontend:

```powershell
Set-Location web
npm.cmd ci
npm.cmd run dev
```

Abrir [dashboard local](http://127.0.0.1:5173/). O Vite encaminha `/api` para `http://127.0.0.1:3000`. A API de demonstração cria 480 chamados e perde o banco ao encerrar. Os últimos 30 dias exibem um subconjunto dessa massa.

Para um PostgreSQL independente, preparar o backend conforme [endpoints.md](endpoints.md) e usar `npm.cmd start` no lugar de `start:demo`. O frontend continua consumindo o mesmo contrato.

Para verificar o pacote de produção, com a API em execução:

```powershell
Set-Location web
npm.cmd run build
npm.cmd run preview
```

Prévia em `http://127.0.0.1:4173/`. O build gera os arquivos em `web/dist`. Para servir a aplicação com Nginx e proxy, consulte [implantação](implantacao.md).

## Variáveis de ambiente

Copiar `web/.env.example` para `web/.env` apenas quando precisar alterar os padrões.

| Variável | Padrão e uso |
| --- | --- |
| `API_PROXY_TARGET` | `http://127.0.0.1:3000`; destino do proxy local, sem exposição automática no bundle. |
| `API_ACCESS_TOKEN` | Opcional, somente no servidor Vite. O proxy injeta bearer se a API estiver protegida. Deve corresponder ao token do backend. |
| `VITE_API_BASE_URL` | `/api/v1`; URL pública consumida pelo navegador. Aceita uma API separada se ela autorizar a origem por CORS. |
| `VITE_POLL_INTERVAL_SECONDS` | `60`; inteiro de 0 a 3600. Zero desativa. Valor inválido restaura 60 segundos. |

Somente as variáveis `VITE_*` podem ser públicas. Não criar `VITE_API_ACCESS_TOKEN`, nem colocar senhas ou cookies do Thindesk no frontend. O token técnico não é uma credencial de usuário: uma implantação estática deve ter gateway/reverse proxy com autenticação corporativa, TLS e injeção da credencial no servidor. Essa infraestrutura ainda não foi homologada.

## Comportamentos entregues

| Requisito | Implementação |
| --- | --- |
| RF01 | Seis cards: total, abertos, em andamento, resolvidos incluindo fechados, tempo médio em horas/minutos e taxa percentual. Valores sem base aparecem como “—”. |
| RF02 | Série por dia, semana ou mês, com agrupamento remoto e tabela textual dos valores em uma seção expansível. Semanas começam na segunda-feira e meses usam o calendário da operação. |
| RF03 | Distribuição por status com legenda textual; tabela paginada com última consideração; detalhe com solicitante, datas, todas as considerações e histórico. |
| RF04 | Ranking de até cinco tipos concluídos, com quantidade e barras proporcionais. |
| RF05 | Datas, status, tipo, prioridade e responsável; opções vêm da API. Aplicar combina os filtros e retorna à página 1. Limpar restaura os últimos 30 dias e remove restrições de dimensão. |
| RF06 | Serviço HTTP centralizado, respostas validadas com Zod, consultas por seleção e conexão com a API própria. Mudar agrupamento refaz a série; paginação e ordenação refazem somente a lista. |
| RF07 | Atualização manual e automática configurável, cancelamento, timeout, loading, vazio, erro por seção com tentativa e conteúdo anterior identificado quando aplicável. |

A edição dos filtros é um rascunho até clicar em “Aplicar filtros”. Datas inválidas não disparam consulta. A interface sempre envia início e fim juntos; a data padrão considera hoje em `America/Sao_Paulo`, independentemente do fuso do computador que acessa o painel.

Indicadores, distribuição e listagem usam a **criação**. Série e ranking usam a **resolução vigente**; seus títulos deixam essa distinção visível. Um agrupamento semanal/mensal pode começar antes do filtro, mas sua contagem inclui somente resoluções dentro do intervalo aplicado. Os totais das duas bases podem diferir.

Tempo médio é tempo corrido, incluindo espera, noites, fins de semana e tempo anterior à reabertura. Não representa SLA, esforço do técnico ou primeira resposta. A interface apenas arredonda para apresentação.

## Atualização e consistência

Cada combinação de filtros, agrupamento, página e ordenação tem uma chave própria de consulta. O `AbortSignal` da consulta é consumido no `fetch`; trocar a seleção cancela requisições substituídas. Uma resposta atrasada não substitui o conteúdo da seleção atual. Não é usado conteúdo de outra chave como placeholder.

Na atualização da mesma seleção, conteúdo válido pode permanecer visível durante a consulta. Se uma seção falhar, ela mantém seu conteúdo anterior com data/hora e erro; o cabeçalho informa “Atualização incompleta”. Uma falha inicial mostra apenas erro e nova tentativa naquela seção. As outras seções continuam disponíveis. “Atualizar dados” fica desativado durante consultas ativas; a verificação de requisições em andamento também impede dois ciclos disparados antes de o React renderizar.

O relógio espera o intervalo após as consultas terminarem, suspende em aba oculta e só agenda quando não há ciclo ativo. Ao voltar à aba, aguarda o intervalo configurado. O seletor oferece desativação, 30 segundos, 1, 2 e 5 minutos; um intervalo inicial personalizado também é exibido. A escolha vale apenas para a sessão, sem persistir chamados ou credenciais no armazenamento do navegador.

O horário no cabeçalho corresponde à consulta mais antiga entre as cinco seções analíticas/listagem da seleção atual, quando todas estão válidas e o catálogo está disponível. Isso evita apresentar uma seção mais antiga como se tivesse sido atualizada junto da mais recente. Cada erro em conteúdo preservado informa o horário próprio da seção.

O resumo identifica base fictícia ou mista e registros recebidos que ficaram fora dos indicadores. Recebimento local não comprova sincronização completa com o Thindesk. O polling não executa o conector da origem.

## Layout e acessibilidade

Paleta de neutros com destaque verde, cores semânticas nos status, fonte do sistema e gráficos sem animação. Não há imagens decorativas, gradientes ou navegação para funcionalidades inexistentes.

Os filtros têm rótulos; erros e carregamento têm estados anunciáveis; existe link para pular ao conteúdo e foco visível. Os gráficos possuem equivalentes textuais, e status não depende somente de cor. O detalhe usa `dialog` nativo, fecha com Escape e devolve o foco ao acionador após encerrar a modalidade. Se o acionador tiver sido removido, o foco retorna ao conteúdo principal.

As larguras de 360, 768 e 1440 pixels foram verificadas no navegador. A tabela tem rolagem própria e pode ser acessada por teclado; a página não precisa rolar horizontalmente. Durações longas podem quebrar dentro do card em celular. Textos secundários foram escurecidos para melhorar o contraste. Essas verificações não constituem uma auditoria completa de acessibilidade.

## Estrutura

```text
web/
  src/
    components/             Filtros, cards, gráficos, tabela, estados e detalhe
    services/               HTTP e contratos Zod
    App.tsx                 Composição e seleção da consulta
    use-dashboard.ts        Consultas e polling
    ticket-format.ts        Datas e apresentação pt-BR
    styles.css              Layout e responsividade
  tests/                    Componentes, serviço e relógio de atualização
  vite.config.ts            Proxy de desenvolvimento/prévia e testes
```

TanStack Query foi acrescentado para tratar cache por seleção, cancelamento e refetch sem criar um gerenciador próprio de requisições. Gráficos e detalhe usam importação dinâmica; a compilação separa essas dependências do JavaScript inicial. Schemas Zod derivam os tipos usados nos componentes, sem uma segunda coleção manual de interfaces de resposta.

## Verificação

```powershell
Set-Location web
npm.cmd run test
npm.cmd run build
```

Os testes desta versão usam respostas controladas apenas em `web/tests`. A aplicação não importa fixtures. A verificação no navegador usa o backend real do projeto com PostgreSQL embarcado e seed; ver [evidências](evidencias/interface.md).

Os [testes e relatórios de cobertura](evidencias/testes.md) e a [matriz de rastreabilidade](rastreabilidade.md) registram os cenários aprovados. A execução com Nginx e proxy de mesma origem está em [implantação](implantacao.md). A homologação operacional do Thindesk ainda depende do acesso à instância real e dos dados fornecidos por ela.

## Referências técnicas

- [React — efeitos e limpeza](https://react.dev/reference/react/useEffect).
- [TanStack Query — cancelamento](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).
- [TanStack Query — padrões de consulta](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).
- [Vite — proxy e servidor local](https://vite.dev/config/server-options).
- [Recharts — contêiner responsivo](https://recharts.github.io/en-US/api/ResponsiveContainer/).
