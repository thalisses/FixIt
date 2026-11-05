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

## Autenticação e perfis

O cadastro público cria uma conta ativa de Cliente. A instituição é obrigatória
e, no ambiente inicial, corresponde à Universidade Estadual de Maringá (UEM).
O login cria uma sessão opaca armazenada no servidor; o cookie é `HttpOnly`,
`SameSite=Lax` e recebe `Secure` em produção.

A API aplica os perfis Cliente, Manutentor e Gestor. Gestores podem listar
usuários e alterar perfis; a interface confirma a alteração e a API impede
rebaixar o último Gestor ativo. As políticas de solicitação, ativo e relatório
estão prontas para serem aplicadas quando esses módulos de domínio forem
implementados.

Para provisionar o primeiro Gestor, cadastre uma conta pela interface e execute
o comando abaixo em um terminal interativo. Ele solicita uma senha sem exibi-la
e só pode ser usado enquanto não houver Gestor ativo:

```sh
docker compose exec api npm run db:provision-manager --workspace @fixit/api -- gestor@uem.br
```

O comando usa a conexão configurada no container da API e solicita uma senha
sem eco. Para aplicar migrations manualmente no Compose:

```sh
docker compose exec api npm run db:migrate --workspace @fixit/api
```

A API também aplica migrations antes de aceitar requisições. Em produção,
configure `WEB_ORIGIN` com a origem HTTPS real e termine TLS na infraestrutura
de implantação.

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

Esta fundação contém cadastro, login, sessões, autorização por perfil,
administração de usuários e provisionamento controlado do primeiro Gestor. As
rotas de solicitações, ativos e relatórios ainda não foram implementadas.

O mapa de capacidades e as especificações aprovadas estão em [CAPABILITY-MAP.md](CAPABILITY-MAP.md) e nos arquivos `SPEC-*.md`.
