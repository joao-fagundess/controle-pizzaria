# Relatórios de validação

Cada relatório registra a data, o ambiente, os comandos executados e os limites da verificação. As contagens pertencem à execução indicada; não representam necessariamente o total de testes da versão atual.

| Assunto | Relatório |
| --- | --- |
| Migrations, integridade e dados de demonstração | [Banco e seed](banco.md) |
| Endpoints, importador legado e consultas SQL | [API](api.md) |
| Navegação, filtros, responsividade e capturas | [Interface](interface.md) |
| Suítes consolidadas e cobertura | [Testes](testes.md) |
| Imagens, proxy, persistência e verificação HTTP | [Docker Compose](compose.md) |
| Execução do Thindesk original | [Homologação local](thindesk-local.md) |
| Schema do contrato complementar | [Contrato Thindesk](contrato-thindesk.md) |
| Importação versionada e qualidade dos dados | [Recepção 1.0](thindesk-import.md) |

Os arquivos brutos de saída foram mantidos com seu conteúdo original. Comandos e caminhos que aparecem neles refletem a configuração usada na data do teste. Os documentos acima apontam para os locais atuais dos arquivos.

Para repetir a validação da aplicação, use `npm --prefix api run validate`. A verificação dos contêineres é executada por `node scripts/validate-compose.mjs`. Os dois comandos usam recursos de teste isolados e substituem os relatórios da respectiva execução; preserve uma cópia se precisar comparar resultados.
