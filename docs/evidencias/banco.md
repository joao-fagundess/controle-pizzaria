# Validação do banco e do seed

Validação realizada em 11/11/2026 no Windows, com Node.js `v24.21.0`, npm `12.2.0`, `pg` `8.23.1` e PGlite `0.5.16`. O motor utilizado informa PostgreSQL `18.6`, compilado para WebAssembly.

## Artefatos de evidência

- [Saída dos testes em TAP](banco-tests.tap)
- [Perfil do seed em JSON](banco-seed.json)
- [Inspeção do ZIP e hash do arquivo original](../thindesk-inspecao.md)

## Execução dos testes

Na pasta `api`, após `npm.cmd ci`:

```powershell
npm.cmd run test:database
```

Resultado: **14 testes passaram, 0 falharam, 0 ignorados**. A saída TAP foi capturada diretamente do executor de testes do Node; não é uma transcrição manual.

Foram verificados aplicação e repetição das migrations, detecção de checksum divergente, distribuição e repetição do seed, histórico de reaberturas, cronologia da massa, resolução obrigatória, ausência de resolução em chamados abertos, referências a pessoas, bloqueio de exclusão, unicidade da identidade externa, preservação de payload legado sem entrada nos indicadores, vínculos de importação, catálogos, textos obrigatórios e validação da data de referência.

Os testes executam o mesmo SQL e as mesmas funções de migration/seed usados pelo comando de banco. A única adaptação separa consultas parametrizadas de SQL em lote na interface do PGlite. Não há mocks de tabelas ou de constraints.

## Perfil da massa

Referência fixa: `2026-11-11`, interpretada no fuso `America/Sao_Paulo`.

| Entidade | Quantidade |
| --- | ---: |
| Chamados | 480 |
| Pessoas da operação | 6 |
| Solicitantes | 24 |
| Considerações técnicas | 830 |
| Movimentações | 1.438 |

| Status | Chamados |
| --- | ---: |
| Aberto | 39 |
| Em andamento | 52 |
| Em espera | 42 |
| Resolvido | 259 |
| Fechado | 88 |

O intervalo de aproximadamente oito meses atravessa nove meses de calendário na referência escolhida:

| Mês | Chamados |
| --- | ---: |
| Março/2026 | 11 |
| Abril/2026 | 38 |
| Maio/2026 | 34 |
| Junho/2026 | 41 |
| Julho/2026 | 71 |
| Agosto/2026 | 55 |
| Setembro/2026 | 83 |
| Outubro/2026 | 103 |
| Novembro/2026 | 44 |

## Limites desta evidência

Docker está instalado, mas seu serviço não estava disponível. As migrations e o seed foram executados com sucesso em PostgreSQL embarcado em memória; não houve execução em servidor PostgreSQL por rede, teste de concorrência real, benchmark ou homologação contra MongoDB/Thindesk. Essas verificações continuam pendentes para os testes de integração.

Não houve medição de cobertura de código nesta versão. Testes dos endpoints, componentes, cobertura consolidada, screenshots e matriz final RF → endpoint → arquivo de teste pertencem à validação consolidada. Ainda não há dashboard executável para produzir prints.
