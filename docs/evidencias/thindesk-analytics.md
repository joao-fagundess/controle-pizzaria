# Evidências da captura e export local

A evolução foi verificada com o WAR Java 23 compilado e MongoDB 8 reais, em projeto Docker separado. Passaram **17 grupos HTTP** e os **44 testes estruturais** do contrato. O [relatório de execução](thindesk-analytics/report.json) contém os cenários, contagens, hashes do código/build e identificação da imagem testada. O [export produzido](thindesk-analytics/export.json) contém somente dados fictícios.

O teste verifica autenticação, catálogo idempotente e imutável, rejeição de entradas inválidas, captura com datas da origem, quatro transições simultâneas ordenadas, notas concorrentes com uma revisão aceita e um conflito, fechamento, reabertura, nova resolução, edição descritiva, repetição sem alteração e preservação de fatos. Confirma compatibilidade das escritas legadas, proteção `409` das complementares, título Unicode e limite de 5 MiB sem truncamento. Repete o export, verifica o schema e compara identidades, cronologia, sequências e estado final produzido.

As datas da criação são verificadas entre duas leituras do relógio da própria origem. O relógio do Windows não é usado como limite exato para timestamps do container. Isso não substitui sincronização de relógios e monitoramento em implantação operacional. A origem bloqueia edições/exports quando seu relógio está anterior a um snapshot já aceito.

Foi corrigido um defeito observado na compilação original: sem nomes dos parâmetros no bytecode, as rotas legadas com `@PathVariable` retornavam `500`. Com `maven.compiler.parameters=true`, a atualização de registros antigos passa e a proteção dos complementares responde `409`.

O ZIP e os 29 arquivos originais foram verificados e preservados. As três fixtures legadas no banco separado não mudaram. O painel anterior continuou com **zero chamados canônicos e três rejeitados**. Nenhum dado novo foi recebido/promovido no PostgreSQL.

O computador local tem 8 GB de RAM. A validação exigiu limitar heap/cache e pausar temporariamente containers das demonstrações deste projeto. Os serviços anteriores são restaurados após a execução; os containers de outros projetos não foram alterados. O [registro de restauração](thindesk-analytics/restoration.json) informa o estado final. O ambiente derivado é encerrado após os testes para liberar memória, mantendo seu volume e a imagem compilada para a próxima etapa.

- [Build Maven e execução](thindesk-analytics/build.txt).
- [Reprodução e limites da implementação](../evolucao-local-thindesk.md).
- [Testes HTTP executáveis](../../integration/thindesk/analytics.verify.mjs).

A CI pública executa o schema, sintaxe dos scripts e as suítes/Compose do painel. O ZIP não foi publicado: a compilação e os testes do Java derivado são locais, e CI verde isoladamente não os comprova. O export ainda depende do leitor versionado, validação semântica do consumidor, migrations, mapeamento e metadados de completude antes de alimentar os indicadores.
