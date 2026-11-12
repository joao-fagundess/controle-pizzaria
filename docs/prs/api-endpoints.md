# build: empacotar API TypeScript para PostgreSQL

A API já implementada ganha uma imagem em múltiplos estágios, com dependências de execução separadas das ferramentas de teste e compilação. O processo usa o usuário `node` e preserva os comandos existentes de migrations e seed; arquivos de ambiente privados ficam fora do contexto de build.

Validação local: build da imagem com `npm ci` e `tsc` em Linux; suíte de integração do Compose descrita nas [evidências](../evidencias/fase-6.md). As regras e endpoints têm [176 execuções consolidadas](../evidencias/fase-5.md), com repetição do backend em dois bancos.

O comando `start:demo` continua disponível fora da imagem de produção, com dependência de desenvolvimento. O Compose usa PostgreSQL independente. A homologação com Thindesk real e autenticação corporativa permanece pendente.

Base prevista: `develop`. Este arquivo é a descrição preparada, não um PR publicado.
