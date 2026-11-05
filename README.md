# FixIt

Base executável do sistema de manutenção patrimonial FixIt.

## Pré-requisitos

- Docker com Docker Compose v2.
- Node.js `20.19+`, `22.12+` ou `24+` para executar scripts diretamente no host.
- Portas `5173`, `3000` e `5432` disponíveis.

## Iniciar com Docker Compose

```sh
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:3000
- API ativa: http://localhost:3000/health/live
- API e banco prontos: http://localhost:3000/health/ready
- PostgreSQL local: `localhost:5432`

O Compose aguarda o PostgreSQL ficar saudável antes de iniciar a API, e o frontend aguarda a API. Os dados do banco ficam em um volume nomeado e são mantidos por `docker compose down`.

As credenciais do `.env.example` são exclusivas para desenvolvimento local. Não use esses valores em produção, não versiona o `.env` e nunca coloque credenciais no frontend.

## Desenvolvimento e verificações

Instale as dependências na raiz:

```sh
npm ci
```

Build de todos os workspaces:

```sh
npm run build
```

Testes de todos os workspaces:

```sh
npm test
```

Para executar o frontend no host, use `npm run dev:web`. Para executar a API no host enquanto o PostgreSQL do Compose está ativo:

```sh
DATABASE_URL=postgresql://fixit:fixit_local_only@localhost:5432/fixit npm run dev:api
```

Para encerrar os containers sem apagar os dados:

```sh
docker compose down
```

## Migrations

A API aplica as migrations pendentes ao subir. Depois de atualizar a `main`, basta rodar `docker compose up --build`.

Para criar uma migration, altere a entidade em `apps/api/src/entities`, deixe o PostgreSQL do Compose ativo e, com o `.env` criado, gere o arquivo:

```sh
npm run migration:generate --workspace @fixit/api -- src/migrations/NomeDaMudanca
```

Confira o arquivo gerado e registre a entidade, se for nova, e a migration em `apps/api/src/config/database.ts`. Para desfazer a última migration aplicada:

```sh
npm run migration:revert --workspace @fixit/api
```

Migration que já entrou na `main` não deve ser editada: crie outra para corrigir.

## Escopo atual

Esta fundação contém uma tela inicial, os endpoints de saúde e a conexão ao PostgreSQL. Autenticação e funcionalidades do backlog ainda não fazem parte do escopo.

O mapa de capacidades e as especificações aprovadas estão em [CAPABILITY-MAP.md](CAPABILITY-MAP.md) e nos arquivos `SPEC-*.md`.
