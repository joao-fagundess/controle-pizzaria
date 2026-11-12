# Gitflow e revisão da entrega

O diretório foi inicializado como repositório Git com branch inicial `main`; não havia histórico anterior. O usuário informou João Pedro Flor (`joaopedroflor123@hotmail.com`) como autor e [joao-fagundess/controle-pizzaria](https://github.com/joao-fagundess/controle-pizzaria) como destino. A autoria e a seleção da conta foram configuradas somente neste repositório. A autenticação confirmou o login `joao-fagundess` e acesso de escrita. O estado efetivamente executado está nas [evidências da Fase 6](evidencias/fase-6.md).

## Organização adotada

| Branch | Responsabilidade |
| --- | --- |
| `main` | Versões entregues após revisão e validação. |
| `develop` | Integração da próxima entrega. |
| `feature/api-endpoints` | Empacotamento e documentação de execução da API já implementada. |
| `feature/dashboard-ui` | Empacotamento do dashboard e proxy Nginx. |
| `feature/delivery` | Compose, validação de contêineres, CI e documentação final. |
| `release/0.1.0` | Candidata de entrega, documentação e ajustes de estabilização. |
| `hotfix/*` | Correção urgente originada de `main`, integrada também em `develop`. Só criar quando houver uma correção concreta. |

Como as Fases 1 a 5 aconteceram antes do Git, o primeiro commit registrou esse conjunto como **baseline existente**, com data real. As branches de feature registram o empacotamento desta fase, sem reconstruir uma cronologia fictícia de desenvolvimento. Não criar commits vazios para simular trabalho nas branches.

As descrições objetivas estão em [API](prs/api-endpoints.md), [dashboard](prs/dashboard-ui.md), [entrega](prs/delivery.md) e [release](prs/release-0.1.0.md). Os links e estados reais dos PRs ficam nas evidências. Um PR precisa de uma branch com diferença real em relação à base.

## Encerramento da versão 0.1.0

O usuário autorizou a integração dos PRs e a criação da tag em 12/11/2026. Os PRs #1, #2 e #3 foram integrados em `develop`, e o PR #4 em `main`, com merges que preservam o histórico. A documentação de encerramento foi registrada em `main` e sincronizada com `develop`. As branches de feature e release foram mantidas para consulta.

A integração da entrega precisou ser atualizada com os merges remotos já realizados. A junção local não apresentou conflitos nem alterou arquivos; os novos heads passaram novamente pela CI antes dos merges restantes. A tag anotada `v0.1.0` é publicada no commit final de `main` após seus checks. O [relatório dos PRs](evidencias/fase-6/github-prs.json) registra a integração real; a autorização no chat não é apresentada como uma revisão registrada na interface do GitHub.

## Sequência de integração

1. Configurar `user.name` e `user.email` **somente neste repositório**, conforme os dados fornecidos. Conferir o remoto escolhido e se já possui histórico antes de adicionar `origin` ou enviar commits. Nunca usar force push para contornar divergência.
2. Registrar o baseline das Fases 1 a 5 em `main`, excluindo `.env`, caches, dependências e builds. Criar `develop` a partir desse commit.
3. Criar `feature/api-endpoints` a partir de `develop`; adicionar `api/Dockerfile` e `api/.dockerignore`. Mensagem sugerida: `build: empacotar API TypeScript para PostgreSQL`. Abrir PR para `develop` com o texto preparado, executar verificações e integrar após revisão.
4. Criar `feature/dashboard-ui` a partir de `develop`; adicionar `web/Dockerfile`, `web/.dockerignore` e `web/nginx/`. Mensagem sugerida: `build: servir dashboard com proxy Nginx`. Abrir PR para `develop`.
5. Criar `feature/delivery` com Compose, scripts, CI, atributos Git, documentos e evidências da Fase 6. Mensagem sugerida: `build: integrar ambiente Compose e validar entrega`. Abrir PR para `develop`.
6. Após integrar as features, criar `release/0.1.0`; conferir documentação/pendências e executar as validações. Abrir PR para `main`. Integrar também em `develop` os ajustes da release. Criar tag `v0.1.0` somente quando a entrega estiver efetivamente aprovada.

O Git Credential Manager confirmou a conta de destino depois da autenticação feita pelo usuário. As operações remotas usam o repositório escolhido. A conexão do plugin GitHub não foi necessária; a autenticação usa o gerenciador padrão do Git e a API oficial, sem gravar tokens no projeto ou nos relatórios.

## Commits e revisão

Usar Conventional Commits em português, com mensagens específicas. Exemplos: `fix: corrigir inclusão do último dia do período`, `test: validar reabertura sem dupla contagem`, `docs: registrar limitações da origem Thindesk`. Preservar as branches durante a primeira entrega facilita a inspeção; em mudanças futuras, remover a branch de feature apenas depois da integração.

O [template de PR](../.github/pull_request_template.md) pede comportamento final, validação efetivamente executada e limitações. Revisar regras temporais, contagens sem duplicação, filtragem parametrizada, ausência de segredos no cliente, migrations e condições de inicialização.

## CI preparada

O [workflow](../.github/workflows/validation.yml) executa dois jobs independentes em Ubuntu: aplicação com as suítes consolidadas e PostgreSQL nativo, e contêineres com Docker Compose e HTTP. O usuário sem privilégios do runner permite iniciar o PostgreSQL; o runner Windows hospedado, que executa como administrador, foi substituído após a falha real de inicialização. A instalação normal das dependências restaura os links de bibliotecas do pacote PostgreSQL Linux. A validação Windows permanece registrada localmente na Fase 5.

A CI usa Node.js 24, permissões de leitura e publica somente artefatos de teste, por 14 dias. Não publica imagens nem implanta a aplicação. Resultados remotos devem ser consultados no GitHub; a evidência local não substitui esses checks. A concorrência por branch cancela execuções substituídas de push/PR para a mesma seleção de código.

Os gatilhos cobrem pushes nas branches do fluxo, PRs para `main`/`develop` e execução manual. Depois de obter resultados reais no repositório, configurar proteção de `main`/`develop` com revisão e checks obrigatórios conforme a política da equipe; isso não foi habilitado nesta sessão.

Referências: [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) e [upload-artifact](https://github.com/actions/upload-artifact). O workflow está preparado para GitHub.com; GitHub Enterprise Server precisa de revisão da compatibilidade das actions e dos runners.
