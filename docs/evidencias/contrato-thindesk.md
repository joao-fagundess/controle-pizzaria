# Evidências — proposta de contrato complementar

Registro histórico da proposta: aprovada posteriormente pelo usuário e integrada pelo [PR #6](https://github.com/joao-fagundess/controle-pizzaria/pull/6), commit `6e15ce0ee6e34e8d32d0c39bc3f56040f2156e75`. A [captura/export local](../evolucao-local-thindesk.md) tem evidências próprias. As observações abaixo descrevem o escopo original da etapa do contrato.

Contrato `1.0` em revisão, definido em 12/11/2026. A entrega é uma proposta de formato e regras, com schema, exemplos fictícios e testes. Não foi acrescentado leitor da versão nova, endpoint na origem, migration, promoção de dados ou metadado novo na API em execução.

## Resultado

**44 testes estruturais aprovados** com Node.js 24, Ajv 8.20.0 e ajv-formats 3.0.1. O schema foi compilado em modo estrito, com validação completa dos formatos, sem coerção, aplicação de defaults ou remoção de propriedades.

- [Saída TAP](contrato-thindesk/tests.tap).
- [Resumo JSON](contrato-thindesk/report.json).
- [Schema](../contracts/thindesk-analytics-v1.schema.json).
- [Teste executável](../../integration/thindesk/contract.test.mjs).
- [Proposta e regras semânticas](../contrato-complementar-thindesk.md).

Os cenários aceitam os exemplos resolvido e reaberto/parcial, offset explícito, autoria desconhecida, notas completas vazias, fechamento preservando a resolução e sequência para eventos simultâneos. Recusam estrutura legada, datas impossíveis ou sem fuso, campos principais ausentes, códigos desconhecidos, responsável com papel incorreto, identidade inválida, título longo, texto inválido, campos extras e declarações de cobertura contraditórias.

Os testes verificam também que o validador não modifica payloads. Um teste passa deliberadamente um snapshot com cronologia incoerente, e outro passa identidades duplicadas/tipo não mapeado: eles confirmam que **validade estrutural não é validade de negócio**. Esses casos não são exemplos aprovados para importação. A validação semântica consta da proposta, mas ainda precisa ser implementada após sua aprovação.

## Reprodução e CI

```powershell
npm.cmd --prefix api ci
npm.cmd --prefix api run test:thindesk-contract
```

O comando usa apenas os arquivos da proposta; não conecta bancos nem chama o Thindesk. A dependência do validador é de desenvolvimento. O workflow passa a executar esse comando antes da suíte consolidada da aplicação. As saídas usuais de aplicação/Compose continuam separadas desses 44 casos.

As evidências originais de 99 casos distintos, 176 execuções, 13 verificações HTTP da API compilada, 27 verificações do Compose principal e 16 grupos da homologação Java mantêm seus escopos e datas próprios. Os testes do schema não foram somados às contagens nem à cobertura V8 da Fase 5.

## Próximo passo

Revisar as decisões CP01–CP07, especialmente captura confiável dos campos, cobertura parcial, sequência de eventos, atualização de snapshots vinculados e avisos de completude na interface. A proposta recomenda evoluir a origem para dados futuros e usar complemento histórico apenas com evidência confiável. A implementação da importação nova depende dessa aprovação.
