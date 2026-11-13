# Inspeção do Thindesk fornecido

Análise estática realizada em 11/11/2026 sobre `C:\Users\arthur.randis\Documents\thindesk.zip`. O arquivo original não foi alterado, executado ou extraído integralmente para o projeto. Configurações de acesso não foram copiadas para a documentação.

SHA-256: `CECBA3087577848DF5A975217F42AEE4821DB30B61E3D0DA326F90AB3E2E73C7`.

## Estrutura encontrada

O pacote contém o projeto `com.pfc:thindesk:1.0-alpha`, aplicação Java com Spring Boot 3.4.0, Spring Data MongoDB, Spring Security e páginas Thymeleaf. O `pom.xml` declara empacotamento WAR e compilação com Java 23. Há código-fonte, Maven Wrapper e artefatos em `target`; os compilados não foram tratados como fonte de verdade.

As entidades são `Chamado`, `Cliente` e `HorarioAtendimento`. `MongoInitConfig` cria coleções, incluindo `usuarios`, mas não implementa um cadastro de técnicos nem carrega o JSON de exemplo. Não há testes Java no diretório de testes do pacote inspecionado.

## Contrato encontrado no código

| Endpoint | Comportamento observado | Evidência dentro do ZIP |
| --- | --- | --- |
| `GET /api/chamados` | Devolve lista completa de chamados via `findAll()`, sem filtros ou paginação. | `src/main/java/com/pfc/thindesk/controller/ChamadoController.java` e `service/ChamadoService.java` |
| `POST /api/chamados` | Salva o objeto recebido. | `controller/ChamadoController.java` |
| `PUT /api/chamados/{id}` | Substitui os cinco campos textuais do chamado existente. A ausência é tratada com exceção genérica. | `controller/ChamadoController.java` e `service/ChamadoService.java` |
| `POST /api/chamados/atualizar/{id}` | Processa formulário; retorna texto de redirecionamento dentro de `@RestController`. | `controller/ChamadoController.java` |
| `GET /api/clientes` | Devolve lista completa de clientes. | `controller/ClienteController.java` |
| `POST /api/clientes` | Salva cliente. | `controller/ClienteController.java` |

Os caminhos abreviados da tabela ficam sob `src/main/java/com/pfc/thindesk/`. Não há `GET /api/chamados/{id}`, endpoints analíticos, histórico, considerações técnicas ou OpenAPI no código fornecido. A tela contém links para novo, edição e cancelamento sem os correspondentes mapeamentos de página nos controllers inspecionados; link não comprova operação implementada.

`SecurityConfig` exige autenticação para as rotas da aplicação, salvo login e recursos estáticos. O fluxo configurado é login por formulário e sessão, com CSRF desativado. `application.properties` contém usuário e senha configurados; os valores não foram reproduzidos nem usados. Um cliente de integração precisa validar sessão, redirecionamentos e tipo de conteúdo, para não interpretar a página HTML de login como JSON bem-sucedido. Não há contrato de token encontrado no pacote.

## Campos e capacidade analítica

| Campo da origem | Significado observado | Destino ou limitação |
| --- | --- | --- |
| `id` | Identificador textual MongoDB. | Preservar como `external_id`, associado a `source_system = thindesk`; não converter para UUID local. |
| `descricao` | Único texto do chamado. | Preservar integralmente em descrição. Um título derivado pode ser truncado apenas para apresentação e deve ser identificado como derivado. |
| `status` | Texto livre. | Normalizar apenas variantes reconhecidas; rejeitar códigos desconhecidos. |
| `tipo` | Texto livre. | Mapear para catálogo aprovado; a amostra usa `Tipo` com inicial maiúscula. |
| `tecnico` | Nome textual, sem chave estrangeira. | Não mesclar pessoas por nome nem fabricar identificação de usuário. Exige mapeamento estável. |
| `usuario` | Nome textual, sem vínculo formal com `Cliente`. | Não presumir que corresponde de forma única a `Cliente.nome`. |
| `Cliente.id/nome/telefone/setor` | Cadastro separado de clientes. | Identidade e setor podem apoiar o mapeamento quando a ligação com o chamado for confirmada. Telefone não é necessário no dashboard. |
| Datas de criação, atualização e resolução | Não existem em `Chamado`. | Impedem filtros por período, série temporal e tempo médio com os dados fornecidos. |
| Prioridade | Não existe em `Chamado`. | Não atribuir “Normal” por padrão para fingir informação conhecida. |
| Histórico e considerações técnicas | Não existem no modelo. | Não converter descrição em nota técnica nem inventar eventos ou autoria. |

O arquivo `src/main/resources/chamados.json` é um objeto de exemplo em formato MongoDB Extended JSON, não um export completo nem uma lista da API. Traz `status: Aberto`, `Tipo: Manutenção` e não traz os campos analíticos ausentes. O identificador MongoDB não será usado para estimar datas de negócio.

## Normalização proposta

O formulário `templates/chamados/atualizar.html` sugere `ABERTO`, `EM_ANDAMENTO` e `CONCLUIDO`, mas a entidade e o serviço não restringem o campo. São variantes observadas, não garantia de catálogo completo.

| Entrada reconhecida após remover espaços laterais, normalizar caixa e acentos | Status local |
| --- | --- |
| `aberto` | `open` |
| `em_andamento` ou `em andamento` | `in_progress` |
| `concluido` | `resolved` |

Não inferir `closed`, `waiting` ou cancelamento sem regra explícita da origem. `Manutenção` não será silenciosamente convertido em hardware: é uma classificação mais ampla e exige decisão de catálogo. Se um payload apresentar `tipo` e `Tipo` com conteúdos conflitantes, a importação deve separar o registro para correção.

## Decisão de integração e impacto na entrega

Manter o Thindesk Java/MongoDB como origem e a API analítica Node.js/PostgreSQL como aplicação separada, conforme a stack solicitada. Não substituir o banco original nem tentar convertê-lo por migration do dashboard.

Na Fase 2, criar `ticket_source_records` para guardar o último payload recebido, identidade externa, erros de validação e eventual vínculo ao chamado normalizado. Registros sem datas, prioridade ou identificação confiável permanecem fora de `tickets`. O seed é separado pela origem `demo` e nunca preenche lacunas de um chamado real.

Na Fase 3, foi implementado um conector de leitura, com autenticação configurável, validação de conteúdo, normalização explícita e relatório de registros preservados/rejeitados. Ele não promove os legados para indicadores sem um contrato complementar. Sua existência no código não comprova integração operacional até haver uma instância acessível e homologação. O resumo da API informa a qualidade global da recepção; o painel precisará mostrar a exclusão de registros incompletos e a defasagem da origem para não apresentar um total parcial como o total completo do Thindesk. Ver `integracao-thindesk.md`.

Para que os registros reais sustentem todos os RFs, será necessário evoluir a origem para registrar os campos ausentes e exportá-los, ou obter um export complementar confiável com essas informações. Evoluir a entidade agora permite registrar eventos futuros, mas não recupera o histórico passado. Essa limitação não é resolvida por polling.

Os horários de atendimento existentes não serão usados para calcular horas úteis: a decisão aprovada para o dashboard é tempo corrido, e não há calendário de SLA definido.

## Limites da inspeção

Não houve build nem execução do Thindesk: Java e Maven não estão disponíveis no PATH deste ambiente, e não foi fornecida uma instância MongoDB acessível. Portanto, os endpoints e formatos acima são contratos observados no código, sem comprovação de resposta em execução. Também não há evidência de dados reais além do objeto de exemplo.

Atualização de 12/11/2026: após autorização do usuário, a [etapa de homologação local](homologacao-thindesk.md) compilou uma cópia selecionada do ZIP em Docker e verificou a aplicação Java com MongoDB separado. Os fontes originais e o POM foram preservados; a configuração de acesso foi substituída por um template próprio, com credenciais novas. Login, sessão e listagem foram confirmados em execução com três chamados fictícios. A limitação de campos analíticos permanece, e a instância operacional não foi homologada. Ver [evidências](evidencias/thindesk-local.md).
