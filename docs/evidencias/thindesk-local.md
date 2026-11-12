# Evidências — Thindesk original em ambiente local

Etapa complementar executada em 12/11/2026, na branch `feature/thindesk-homologation`. O usuário autorizou preparar o ZIP localmente. A execução foi aprovada e o ambiente foi mantido para consulta. Procedimento e credenciais locais em [homologacao-thindesk.md](../homologacao-thindesk.md).

## Resultados

- **16 grupos de verificação aprovados**, contra a aplicação Java/MongoDB em execução.
- **Cinco execuções do conector compilado**: três recepções bem-sucedidas e duas falhas controladas de autenticação/sessão.
- Três chamados fictícios lidos; três payloads preservados/rejeitados, zero registros sem identidade e zero promovidos.
- Nenhuma linha em `tickets`; resumo e lista vazios, com três exclusões informadas ao frontend.
- Coleção MongoDB preservada, com snapshot antes/depois idêntico.
- ZIP original com SHA-256 inalterado e 29 arquivos copiados conferidos por hash.
- Login e página inicial autenticada com HTTP 200; API protegida por sessão.
- Serviços saudáveis, com migration concluída com código 0.

| Evidência | Arquivo |
| --- | --- |
| Resumo de execução, versões e imagens | [report.json](thindesk-local/report.json) |
| Grupos, comandos do conector e campos recebidos | [checks.json](thindesk-local/checks.json) |
| Saída dos comandos sem segredos | [validation.txt](thindesk-local/validation.txt) |
| Configuração com credenciais removidas | [compose-config.json](thindesk-local/compose-config.json) |
| Estado dos serviços | [containers.json](thindesk-local/containers.json) |

## Cenários

As verificações cobrem API sem sessão, renderização do login, senha incorreta, emissão de sessão, leitura autenticada dos seis campos legados, receptor sem seed analítico, chamada real de `dist/thindesk-sync.js`, rejeição por incompletude, resumo/listagem, proxy, idempotência, cookie válido, falhas de login/cookie sem alteração de recepção, logout e tabela canônica vazia. A lista exata está no JSON.

O verificador compara os payloads retornados pela API com as fixtures do MongoDB. O código original não foi modificado para acrescentar campos. As três recepções bem-sucedidas mantiveram a mesma identidade e `first_seen_at`; os erros controlados não alteraram `last_seen_at`. A página inicial foi consultada adicionalmente e devolveu 200.

## Isolamento e limites

Projeto Compose: `thindesk-homologation`. Bancos, volumes e credenciais são próprios; as únicas portas publicadas são as do Java e do frontend, no loopback. O ambiente principal continua separado. A cópia do ZIP e os segredos ficam em `.cache`, fora do Git.

O build Java terminou com sucesso, compilando os 16 módulos de origem com release 23. Não havia testes Java no pacote; a validação desta etapa é a integração externa, não uma suíte JUnit. O runtime identificado foi Java 23.0.2 e MongoDB 8.0.38; os digests efetivamente executados estão no resumo.

Essas verificações não são os 99 casos distintos/176 execuções da Fase 5, nem as 27 verificações HTTP do Compose principal. As verificações do Java não são incorporadas à cobertura V8 da Fase 5; suas contagens e percentuais permanecem registrados separadamente. O ZIP não é distribuído no repositório nem enviado à CI; a homologação original precisa do arquivo local autorizado. A CI comum continua validando a aplicação e o Compose principal.

A execução prova compatibilidade local de login, sessão, leitura e preservação. A instância operacional e dados reais continuam pendentes. Os indicadores reais dependem do contrato complementar de campos ausentes; o resultado `promoted: 0` é esperado nesta versão.
