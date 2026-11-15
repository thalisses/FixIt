# Integração de anexos com PostgreSQL real

Execute na raiz, com Docker ativo e autorização para criar recursos temporários:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-attachments-postgres.ps1
```

O runner usa somente `docker-compose.attachments-test.yml`, com projeto novo
`fixit-us009-it-<12 caracteres aleatórios>`. Não usa os containers, volumes,
portas ou credenciais da stack de desenvolvimento. Não há portas publicadas,
volumes externos ou bind mounts. A rede de execução é interna ao projeto.

O teste recusa configuração fora do banco `fixit_us009_integration`, host `db`,
usuário de teste `fixit_it`, diretório `/app/uploads` e projeto com o prefixo
esperado. A fase de escrita exige banco vazio antes de aplicar migrations.
Não usa `DATABASE_URL` nem carrega `.env` de desenvolvimento no processo de teste.

## Duas fases

1. **write:** sobe PostgreSQL 14 e o container da API de teste, aplica migrations,
   cria fixtures exclusivas e executa HTTP contra `createApp`, repositórios
   TypeORM, sessões PostgreSQL, sharp e filesystem reais. Falhas de armazenamento
   e de metadados são injetadas; a de metadados ocorre depois do `INSERT` real.
   A concorrência observa uma espera real por lock em `pg_stat_activity`.
2. **read:** recria o container que hospeda a API de teste e relê metadados,
   sessão e arquivos no mesmo banco/volume. Confere SHA-256 dos bytes via
   filesystem e HTTP. O runner verifica que o ID do container mudou.

O volume de anexos contém `integration-evidence.json` com identificadores e uma
sessão exclusiva de teste para a segunda fase. Esse arquivo não pertence ao
armazenamento público nem contém credenciais de desenvolvimento.

Sem `FIXIT_ATTACHMENT_INTEGRATION=1`, a suíte é ignorada, inclusive em `npm test`.
Não habilite manualmente contra um banco existente. Use o runner isolado.

## Recursos preservados

O runner informa o nome do projeto e preserva seus recursos para inspeção.
Não executa remoção de volumes, limpeza de banco ou remoção da stack de
desenvolvimento. O container da API de teste termina após cada fase; o PostgreSQL
de teste pode continuar ativo para inspeção. Se o build falhar, a execução para
e informa o projeto.

Cada execução usa recursos novos. A remoção posterior dos recursos preservados
é uma decisão operacional separada; não há rotina automática de exclusão.

## Limites

Não simula perda de energia ou corrupção do volume. As falhas de disco e de
aplicação são injetadas em fronteiras controladas, mantendo transações e arquivos
reais. Os testes unitários existentes continuam cobrindo reconciliação de commit
incerto; estes testes não provocam queda da conexão durante um commit real.
