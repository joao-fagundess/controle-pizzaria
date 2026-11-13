# Verificação da interface

Verificação final em 12/11/2026. O trabalho iniciado em 11/11 foi retomado após a interrupção, preservando os arquivos já implementados.

## Verificações

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run test` em `web` | 20 testes passaram; zero falhas. |
| `npm.cmd run build` em `web` | TypeScript e Vite concluídos; gráficos e detalhe separados em chunks. |
| Integração pelo navegador | Interface consultando a API própria em execução com PostgreSQL embarcado e seed fictício. |
| Filtros combinados | A seleção foi reduzida de 121 para 1 chamado, com indicadores, tabela, responsável e consideração consistentes. |
| Agrupamento, paginação e ordenação | Dia, semana e mês; página 2 e retorno à página 1 ao mudar a ordenação; prioridade por severidade. |
| Detalhe | Considerações, autoria, resolução vigente e histórico incluindo reabertura exibidos; Escape e retorno de foco conferidos. |
| Responsividade | Viewports CSS de 360, 768 e 1440 pixels sem rolagem horizontal na página; tabela com rolagem interna. |
| Indisponibilidade | API de demonstração interrompida propositalmente; erros por seção, horário do conteúdo anterior e estado global incompleto conferidos. Recuperação após reinício e atualização manual. |
| Polling no navegador | Intervalo de 30 segundos ativado com aba visível; horário da visão geral atualizado sem nova interação manual. |

Artefatos:

- [Saída dos testes](interface-tests.txt)
- [Saída da compilação](interface-build.txt)
- [Verificações do navegador](interface-browser-checks.json)
- [Dashboard desktop](interface-desktop.jpg)
- [Dashboard tablet](interface-tablet.jpg)
- [Celular com filtros e duração longa](interface-mobile-filtrado.jpg)
- [Detalhe do chamado](interface-detalhe.jpg)
- [API indisponível com conteúdo anterior](interface-erro-api.jpg)

## Testes automatizados

`dashboard.test.tsx` verifica indicadores e bases temporais, rascunho/aplicação dos seis filtros, período inválido, limpeza, agrupamento, paginação/ordenação, detalhe e foco, falha inicial, falha de atualização, estado vazio, aviso de registros excluídos e resposta atrasada de seleção antiga.

`polling.test.ts` usa relógio controlado para verificar intervalo, ausência de sobreposição, pausa em aba oculta e desativação.

`api-service.test.ts` verifica parâmetros HTTP, validação do payload, erro de rede/HTTP/autorização, cancelamento, timeout e formatação pt-BR/fuso. O jsdom fornece apenas o ambiente dos testes; os cenários de layout e modalidade nativa foram verificados separadamente no navegador.

## Ajustes encontrados na inspeção real

O diálogo precisava encerrar sua modalidade antes de restaurar foco, pois o restante da página fica inerte enquanto ele está aberto. A correção foi verificada no navegador, além do teste de componente. Em celular, uma duração de 123h 30min ultrapassava a largura disponível; a tipografia e a quebra desse card foram ajustadas. Textos secundários foram escurecidos para melhorar o contraste.

As capturas foram feitas pelo navegador, sem montagem ou substituição dos indicadores. As dimensões CSS foram medidas no documento; o controle de viewport precisou compensar o zoom já existente no navegador. A configuração temporária foi restaurada ao concluir a verificação.

## Limites

Todos os dados demonstrados são fictícios. A API real do projeto foi usada, mas não houve homologação com uma instância operacional do Thindesk, nem com um servidor PostgreSQL independente. Também não houve auditoria completa WCAG, implantação ou configuração do gateway corporativo.

Os relatórios de [banco](banco.md), [API](api.md) e [testes consolidados](testes.md) têm escopos próprios. Suas execuções não foram somadas às verificações de navegador descritas aqui.
