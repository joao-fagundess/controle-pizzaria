# build: servir dashboard com proxy Nginx

O dashboard React já implementado passa a ser servido como assets estáticos por Nginx, com `/api/v1` na mesma origem. O token técnico é aplicado no proxy durante a inicialização e fica fora do JavaScript. O Nginx usa usuário sem root, healthcheck próprio e validação do formato do token.

Validação local: build do frontend em Linux e execução das rotas pelo proxy no [validador do Compose](../evidencias/fase-6.md), incluindo inspeção dos assets para ausência das credenciais de teste. Os [testes e capturas anteriores](../evidencias/fase-4.md) cobrem os componentes e a responsividade; a Fase 5 acrescentou cobertura consolidada.

A publicação padrão é somente no loopback. O proxy local não autentica usuários; acesso compartilhado com dados reais exige gateway corporativo e HTTPS.

Base de revisão: `develop`. PR publicado em rascunho: [#2](https://github.com/joao-fagundess/controle-pizzaria/pull/2). Revisar após a API; revisão e integração pendentes.
