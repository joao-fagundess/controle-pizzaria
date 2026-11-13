# Painel de chamados Thindesk

Dashboard para acompanhar a fila de suporte, consultar o histórico dos chamados e entender onde a equipe concentra seus atendimentos. O painel consome uma API REST própria e recebe dados do Thindesk por uma integração de leitura.

O projeto trata de **chamados técnicos de TI**, conforme a introdução e os requisitos funcionais da atividade. A referência a pizzaria no objetivo do enunciado e no nome do repositório não corresponde ao domínio implementado.

## O que o painel oferece

- Indicadores de total, abertos, em andamento, resolvidos, tempo médio e taxa de resolução.
- Gráfico de conclusões por dia, semana ou mês, distribuição por status e ranking dos tipos mais atendidos.
- Filtros por período, status, tipo, prioridade e responsável.
- Lista paginada com detalhes, histórico e considerações técnicas de cada chamado.
- Atualização manual ou automática, com mensagens de carregamento, ausência de resultados e falhas de conexão.

O painel é de consulta. Abertura de chamados, mudança de status e atribuição de técnicos continuam no Thindesk.

## Como executar

### Com Docker Compose

É preciso ter Node.js 24+ e Docker Desktop com o engine Linux e o Compose em execução. Na raiz do projeto:

```powershell
node scripts/prepare-compose.mjs
docker compose up --build -d --wait --wait-timeout 120
docker compose --profile demo run --rm seed
```

Abra o [painel](http://127.0.0.1:8080/) ou a [documentação interativa da API](http://127.0.0.1:8080/docs/).

O último comando carrega **480 chamados fictícios** e deve ser usado apenas na base de demonstração. As credenciais ficam no `.env`, gerado pelo script de preparação. O banco usa um volume persistente e a aplicação só fica acessível neste computador. Para parar sem apagar os dados, execute `docker compose down`.

### Sem Docker

Com Node.js 24+, inicie a API na raiz do projeto:

```powershell
npm.cmd --prefix api ci
npm.cmd --prefix api run build
npm.cmd --prefix api run start:demo
```

Em outro terminal, inicie o frontend:

```powershell
npm.cmd --prefix web ci
npm.cmd --prefix web run dev
```

O painel fica em [localhost:5173](http://127.0.0.1:5173/) e o Swagger em [localhost:3000/docs](http://127.0.0.1:3000/docs/). Nesse modo, o banco de demonstração é temporário: os dados são recriados ao reiniciar a API.

Para usar um PostgreSQL persistente, configurar autenticação ou ajustar portas e proxy, consulte [execução da API](docs/endpoints.md), [frontend](docs/frontend.md) e [implantação](docs/implantacao.md). Senhas e tokens devem ficar no servidor; nunca em variáveis `VITE_*`.

## Arquitetura

O frontend usa React, TypeScript e Vite, com Recharts nos gráficos e TanStack Query nas consultas. A API usa Node.js, Express e TypeScript, valida os parâmetros e calcula os indicadores no PostgreSQL. O contrato dos endpoints está disponível em OpenAPI e Swagger.

Essa separação mantém as regras de negócio no backend e permite evoluir a interface sem acessar diretamente o banco ou o Thindesk. O PostgreSQL concentra filtros e agregações, enquanto o navegador cuida da apresentação. As escolhas e suas justificativas estão em [decisões de projeto](docs/decisoes-de-analise.md).

## Integração com o Thindesk

O Thindesk fornecido usa Java e MongoDB. Seus chamados originais não trazem datas, prioridade, histórico ou considerações técnicas suficientes para todos os indicadores. O importador legado preserva esses registros e informa por que ficaram fora dos cálculos.

Uma cópia local do Thindesk foi ampliada para registrar e exportar os campos necessários no contrato `1.0`. O comando `thindesk:sync:v1` valida o conteúdo, identifica cada registro e importa os chamados válidos em transação. Registros incompletos ficam separados dos indicadores; datas, autores e eventos ausentes não são inventados.

Na homologação local foram aceitos três chamados, dois deles concluídos, e preservados seis registros rejeitados. A interface distingue informações completas, parciais e não fornecidas. O ZIP e o código original foram mantidos sem alterações.

A integração foi verificada **localmente, com dados fictícios**. O uso operacional ainda exige validar a instância real, autenticação, HTTPS e infraestrutura. Os testes funcionais não substituem uma medição de carga. Os comandos e limites estão em [recepção Thindesk 1.0](docs/recepcao-versionada-thindesk.md) e nas [evidências da integração](docs/evidencias/thindesk-import.md).

## Testes

Depois de instalar as dependências de `api` e `web`, execute a validação completa na raiz:

```powershell
npm.cmd --prefix api run validate
```

O comando compila os dois projetos, verifica os tipos, executa os testes em bancos descartáveis e gera os relatórios de cobertura. Ele não usa o banco configurado em `DATABASE_URL`. Os binários do PostgreSQL nativo são instalados como dependência de desenvolvimento; no Windows, execute com um usuário sem privilégios de administrador.

Para conferir apenas o frontend ou o empacotamento em contêineres:

```powershell
npm.cmd --prefix web test
npm.cmd --prefix web run build
node scripts/validate-compose.mjs
```

O workflow do [GitHub Actions](https://github.com/joao-fagundess/controle-pizzaria/actions) verifica aplicação, PostgreSQL e Compose. Os resultados por requisito estão na [matriz de rastreabilidade](docs/rastreabilidade.md); os testes mais recentes da integração estão nas [evidências Thindesk 1.0](docs/evidencias/thindesk-import.md).

## Documentação e entrega

| Assunto | Documento |
| --- | --- |
| Requisitos e regras de negócio | [Requisitos](docs/requisitos.md) |
| Modelo de dados, constraints e índices | [Modelagem](docs/modelagem.md) |
| Rotas, filtros e respostas da API | [Endpoints](docs/endpoints.md), [OpenAPI](docs/openapi.json) e [requisições HTTP](docs/requisicoes.http) |
| Comportamento e configuração do painel | [Frontend](docs/frontend.md) |
| Origem e integração | [Inspeção do ZIP](docs/thindesk-inspecao.md), [homologação local](docs/homologacao-thindesk.md) e [recepção 1.0](docs/recepcao-versionada-thindesk.md) |
| Testes, capturas e histórico da entrega | [Índice da entrega](docs/entrega.md) e [encerramento local](docs/encerramento.md) |
| Execução e versionamento | [Implantação](docs/implantacao.md) e [Gitflow](docs/gitflow.md) |

A `main` reúne a entrega atual, incluindo a integração local do Thindesk. A tag `v0.1.0` mantém o registro da primeira versão. Os relatórios estão organizados por assunto no [índice de validações](docs/evidencias/README.md).
