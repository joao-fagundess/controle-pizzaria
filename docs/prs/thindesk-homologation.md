# test: homologar conector com o Thindesk original em ambiente local

A validação do conector passa a incluir o código Java fornecido no ZIP, compilado em Docker e executado com MongoDB separado. O fluxo existente de login/sessão e recepção é exercitado pelo comando Node.js compilado. O novo ambiente tem bancos, credenciais e portas próprios, com três chamados fictícios; a demonstração da versão 0.1.0 permanece separada.

A preparação copia 29 arquivos selecionados e verifica seus hashes. As configurações de acesso originais, dados de exemplo e compilados do ZIP ficam fora do build. Um template versionado recebe credenciais geradas em runtime; o código original copiado e os segredos permanecem no cache local ignorado pelo Git.

Validação local: [16 grupos aprovados](../evidencias/thindesk-local.md), cinco execuções do conector compilado, MongoDB preservado e ZIP com hash inalterado. Foram verificados login, cookie existente/inválido, logout, idempotência, falhas sem escrita, proxy e exclusão dos registros incompletos. Os três chamados ficam preservados/rejeitados, com `promoted: 0`, e a tabela canônica permanece vazia.

Os módulos de produção do conector/dashboard não foram alterados. A CI comum verifica a aplicação e o Compose principal; a homologação do Java original depende do ZIP local e tem evidência própria. A instância operacional e o contrato complementar para datas, prioridade e identidades permanecem pendentes.

Integrado em `develop` pelo [PR #5](https://github.com/joao-fagundess/controle-pizzaria/pull/5), após autorização do usuário no chat em 12/11/2026 e CI aprovada do head. A tag `v0.1.0` permanece no commit já entregue.
