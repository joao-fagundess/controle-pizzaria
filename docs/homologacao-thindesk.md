# Homologação local do Thindesk fornecido

Etapa complementar autorizada em 12/11/2026, após a entrega `v0.1.0`. O usuário escolheu executar o ZIP em ambiente local. A aplicação Java original foi compilada e sua integração foi verificada com MongoDB, PostgreSQL receptor e conector Node.js reais, usando apenas dados fictícios.

## Ambientes disponíveis

| Endereço | Conteúdo |
| --- | --- |
| [Thindesk local](http://127.0.0.1:8081/login) | Aplicação Java `1.0-alpha` do ZIP, com três chamados fictícios. |
| [Dashboard de homologação](http://127.0.0.1:8180/) | Receptor separado: três registros excluídos e nenhum chamado canônico. |
| [Demonstração anterior](http://127.0.0.1:8080/) | Ambiente entregue na versão 0.1.0, com seu banco e seed independentes. |

Login do Thindesk: usuário `homologacao`. A senha gerada está no campo `THINDESK_LOGIN_PASSWORD` de `.cache/thindesk-homologation/.env`. Esse arquivo é local e ignorado pelo Git; seus valores não constam das evidências. A preparação preserva as credenciais existentes ao ser repetida.

O dashboard de homologação estar sem chamados é o resultado esperado: a origem não fornece datas, prioridade, identidade estável do solicitante, histórico ou notas. Os três payloads são preservados em `ticket_source_records`, com motivos explícitos de rejeição e sem vínculo a `tickets`. Nenhum campo ausente recebe valor fictício para permitir a promoção.

## Preparação e execução

Requer Docker com engine Linux, Compose, Node.js 24+ e PowerShell 7. Não exige Java, Maven ou MongoDB instalados no Windows. Na raiz:

```powershell
./scripts/prepare-thindesk.ps1 -ZipPath 'C:\Users\arthur.randis\Documents\thindesk.zip'
node scripts/validate-thindesk.mjs --zip 'C:\Users\arthur.randis\Documents\thindesk.zip'
```

O primeiro comando seleciona o código necessário do ZIP e gera a configuração de homologação. O segundo compila/inicia os serviços, cria as fixtures apenas se a coleção estiver vazia e executa as verificações. Uma coleção existente com conteúdo diferente das fixtures causa falha de validação; seus dados não são substituídos. O ambiente fica em execução para consulta posterior.

Para iniciar novamente um ambiente já preparado:

```powershell
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk.yml up --build -d --wait --wait-timeout 180
```

Para executar somente a recepção:

```powershell
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk.yml --profile tools run --rm sync
```

Relatório esperado para as três fixtures:

```json
{ "received": 3, "preserved": 3, "rejected": 3, "unidentified": 0, "promoted": 0 }
```

Para inspecionar ou encerrar preservando os bancos:

```powershell
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk.yml ps --all
docker compose --env-file .cache/thindesk-homologation/.env -f docker-compose.thindesk.yml down
```

Os volumes e a rede pertencem ao projeto `thindesk-homologation`. As portas padrão são 8081 e 8180, restritas a `127.0.0.1`; MongoDB, PostgreSQL e API receptora não publicam portas. Alterar as portas no `.env` próprio se houver outro serviço usando esses endereços. O Compose principal e seu volume não são usados por esses comandos.

## Tratamento do ZIP

Foi utilizado o SHA-256 `CECBA3087577848DF5A975217F42AEE4821DB30B61E3D0DA326F90AB3E2E73C7`, já registrado na inspeção. A preparação recusa outro arquivo até sua análise. O ZIP original permanece intacto.

A cópia de build contém 29 arquivos originais: `pom.xml`, Java, templates e recursos estáticos selecionados. Os hashes desses arquivos são conferidos antes do build. `application.properties` original, `chamados.json`, `target` e o Maven Wrapper não são copiados. A configuração usada é o [template versionado](../integration/thindesk/application.properties), que recebe URI e credenciais novas em runtime. Arquivos extras ou mudanças nos arquivos preparados são recusados pelo validador.

O POM e os módulos Java são preservados. O [Dockerfile](../integration/thindesk/Dockerfile) usa Maven 3.9.9 e Java 23, conforme o compilador declarado no ZIP. O comando acrescenta explicitamente o goal `spring-boot:repackage` para produzir um WAR executável; isso não altera os fontes nem o POM. A execução observada usa Temurin 23.0.2, Spring Boot 3.4.0 e MongoDB 8.0.38. Essas versões reproduzem o pacote recebido para este teste local; uma implantação operacional exige avaliação própria de versões e acesso.

O código Java copiado fica no cache local e não é publicado no repositório. O repositório contém o processo de preparação e os testes, sem o ZIP, seus compilados ou suas configurações de acesso.

## Verificações executadas

O [teste de integração](../integration/thindesk/verify-thindesk.mjs) roda dentro da imagem da API e invoca `dist/thindesk-sync.js`, o comando compilado existente. Confere login correto/incorreto, sessão, JSON real da origem, preservação, motivos de exclusão, resumo/listagem, proxy, repetição sem duplicidade, uso de cookie existente, falha de cookie e logout. A página inicial autenticada também respondeu HTTP 200.

O serviço de teste compartilha a namespace de rede do Java. Assim, a origem é acessada por `http://127.0.0.1:8080` dentro dos contêineres, respeitando a política de HTTP somente em loopback. A exigência de HTTPS para origens remotas não foi flexibilizada.

O validador compara a coleção MongoDB antes/depois e confirma que a leitura não alterou seus registros. Ele também verifica saúde dos serviços, versões, digest das imagens, acesso pelo host e integridade do arquivo original. Os bancos são exclusivos do ambiente de homologação. Não há carga do seed analítico de 480 chamados nesse receptor.

Saídas completas, contagens e identificação das imagens estão nas [evidências](evidencias/thindesk-local.md). São verificações de integração adicionais, sem alterar a contagem ou a cobertura V8 registradas na Fase 5.

## Limite da homologação

Esta etapa confirma o funcionamento local do código original e do fluxo de recepção. Não comprova acesso à instância operacional, qualidade de dados reais, desempenho sob carga, autenticação corporativa ou completude analítica. A conta local existe para o teste; o código original não implementa um papel específico de leitura para a integração.

Para alimentar os indicadores com dados da origem, o próximo passo é definir um contrato complementar: datas de criação/atualização/resolução, prioridade, identidades estáveis e, para detalhe completo, histórico e considerações técnicas. Só depois desse contrato deve ser implementada a promoção para `tickets`. Uma evolução da origem registra eventos futuros, mas não recupera por si só as informações históricas ausentes.

## Referências

- [Spring Boot — empacotamento executável](https://docs.spring.io/spring-boot/maven-plugin/packaging.html).
- [Spring Boot — configuração externa](https://docs.spring.io/spring-boot/reference/features/external-config.html).
- [Imagem oficial Maven](https://github.com/docker-library/docs/blob/master/maven/README.md).
- [Imagem oficial MongoDB](https://github.com/docker-library/docs/blob/master/mongo/README.md).
