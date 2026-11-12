# Execução com Docker Compose

O Compose entrega PostgreSQL 18, API Node.js e dashboard estático servido pelo Nginx. É um ambiente **local**, com apenas `127.0.0.1:8080` publicado. Banco e API não publicam portas no host. Os dados ficam em um volume nomeado; encerrar os contêineres não apaga os chamados.

## Iniciar

Pré-requisitos: Docker Desktop com engine Linux em execução e Compose com suporte a `--wait`. Node.js 24+ é usado pelos scripts de configuração e validação. Executar na raiz:

```powershell
node scripts/prepare-compose.mjs
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 120
```

O script gera `.env` com senha e token aleatórios e não sobrescreve um arquivo existente. Ele não imprime credenciais. O `.env` é ignorado pelo Git e pelos contextos de build. O Compose interrompe a configuração se senha ou token estiverem ausentes.

Abrir [dashboard](http://127.0.0.1:8080/) ou [Swagger](http://127.0.0.1:8080/docs/). O banco começa sem chamados, com os catálogos das migrations. Para carregar a demonstração:

```powershell
docker compose --profile demo run --rm seed
```

O seed cria 480 chamados fictícios e pode ser repetido sem duplicação. Atualizar o painel depois da carga. Não executar seed em um ambiente com dados reais. `SEED_REFERENCE_DATE` vazio usa hoje em São Paulo; fixar uma data em `.env` torna a demonstração reproduzível. Se usar `2026-11-11`, selecionar no dashboard um período que inclua essa data.

## Configuração

| Variável na raiz | Uso |
| --- | --- |
| `POSTGRES_PASSWORD` | Senha do banco exclusivo do Compose. Usar hexadecimal gerado pelo script, porque a senha integra a URL de conexão. |
| `API_ACCESS_TOKEN` | Token hexadecimal de pelo menos 32 caracteres, compartilhado somente entre API e Nginx. O gerador produz 64 caracteres. |
| `DASHBOARD_PORT` | Porta local do frontend, padrão `8080`. Também compõe as origens permitidas pela API. |
| `SEED_REFERENCE_DATE` | Calendário opcional do seed; não dispara uma carga automática. |

O `.env` da raiz pertence ao Compose. Os arquivos `api/.env` e `web/.env` são apenas da execução fora de contêineres e não são copiados para as imagens. As configurações públicas do build usam `/api/v1` e polling de 60 segundos. O token só é interpolado no arquivo de configuração do Nginx durante a inicialização, por `NGINX_ENVSUBST_FILTER`; não há segredo `VITE_*` nem credencial em asset estático.

## Inicialização e manutenção

`db` precisa estar saudável antes de `migrate`. O serviço `migrate` executa as migrations com checksum e lock; a API só inicia se ele terminar com sucesso. O frontend aguarda a saúde da API. `migrate` terminar com código 0 é esperado. A API e o Nginx executam com usuários sem root e sem capabilities adicionais.

```powershell
docker compose ps --all
docker compose logs --tail 100 api web migrate
docker compose stop
docker compose start
```

Para reconstruir após alterações, usar novamente `docker compose up --build -d --wait --wait-timeout 120`. Alterar a senha em `.env` não altera a senha de um cluster já inicializado; manter a configuração original ou realizar uma troca administrada no PostgreSQL antes de atualizar os consumidores.

Para remover os contêineres e a rede, preservando o volume:

```powershell
docker compose down
```

Não usar `down --volumes` no ambiente de trabalho se os dados precisarem ser preservados. O validador usa essa opção somente no projeto aleatório criado por ele, com banco descartável.

## Validação da entrega

```powershell
node scripts/validate-compose.mjs
```

O validador cria projeto, credenciais, porta e volume separados do ambiente habitual. Confere migrations, saúde, estado vazio, seed, sete rotas, filtros, erros, Swagger, acesso direto sem bearer, execução sem root e ausência de credenciais nos assets. Reaplica migrations/seed, reinicia o banco e verifica persistência e reconexão. Ao terminar, remove somente os recursos de teste. Saídas em [evidências da Fase 6](evidencias/fase-6.md).

As tags de base são `node:24-bookworm-slim`, `nginx:stable-alpine` e `postgres:18-bookworm`; recebem atualizações dentro dessas linhas. Os lockfiles fixam dependências npm, e os relatórios registram IDs/digests das imagens efetivamente testadas. Uma implantação que exija builds idênticos deve fixar os digests aprovados e repetir a validação ao atualizá-los.

## Limite para uso compartilhado

O proxy local injeta uma credencial técnica para a API e permite acesso aos dados fictícios a quem usa o computador. Isso não autentica uma pessoa. Para acesso de equipe ou dados reais, configurar gateway com autenticação corporativa e HTTPS, revisar origens e gestão de segredos, usar papel de banco com os privilégios necessários e definir backup. Não trocar a publicação de `127.0.0.1` por `0.0.0.0` sem concluir essa configuração. O conector real do Thindesk ainda depende de acesso e de contrato complementar para os campos ausentes.

## Referências

- [Docker — ordem e condições de inicialização](https://docs.docker.com/compose/how-tos/startup-order/).
- [Docker — interpolação e variáveis obrigatórias](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
- [Imagem oficial PostgreSQL — volume e configuração](https://github.com/docker-library/docs/blob/master/postgres/README.md).
- [Imagem oficial Nginx — substituição dos templates](https://github.com/nginx/docker-nginx/blob/master/entrypoint/20-envsubst-on-templates.sh).
