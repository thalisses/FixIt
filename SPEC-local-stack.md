# Spec: Local Stack

## Objetivo

Permitir que a equipe execute o frontend, a API e o PostgreSQL localmente com Docker Compose, com configuração previsível e sem exigir instalações locais desses serviços.

### Critérios de aceite

- `docker compose up --build` inicia os serviços `web`, `api` e `db`.
- O PostgreSQL usa a versão 14 ou superior, volume nomeado e healthcheck próprio.
- A API só é considerada pronta após conectar ao banco; sua checagem usa `/health/ready`.
- A tela web fica disponível em `http://localhost:5173` e a API em `http://localhost:3000`.
- A porta do PostgreSQL é publicada em `localhost:5432` para acesso de desenvolvimento.
- `docker compose down` encerra os serviços sem apagar o volume de dados.

## Stack

- Docker Compose e imagens oficiais Node.js 20 LTS e PostgreSQL 14 ou superior.
- Monorepo npm com workspaces `@fixit/web` e `@fixit/api`.
- Configurações de conexão fornecidas por variáveis de ambiente; o host do banco na rede Compose é `db`.

## Comandos

- Iniciar: `docker compose up --build`.
- Iniciar em segundo plano: `docker compose up --build --detach`.
- Verificar a API e o banco: `curl --fail http://localhost:3000/health/ready`.
- Build dos módulos: `npm run build --workspaces --if-present`.
- Testes dos módulos: `npm test --workspaces --if-present`.
- Encerrar sem apagar dados: `docker compose down`.

## Estrutura do projeto

```text
apps/
  api/
  web/
docker-compose.yml
package.json
CAPABILITY-MAP.md
SPEC-web-foundation.md
SPEC-api-foundation.md
SPEC-local-stack.md
```

O Compose deve definir healthcheck para o banco e dependência de prontidão da API em relação ao banco. O frontend deve vincular o servidor de desenvolvimento a `0.0.0.0` para expor a porta ao host.

## Estilo de configuração

Usar nomes de serviço estáveis e variáveis explícitas. Credenciais locais devem ter valores de desenvolvimento e poder ser substituídas por ambiente, sem serem tratadas como segredos de produção.

```yaml
services:
  api:
    depends_on:
      db:
        condition: service_healthy
```

## Estratégia de testes

- `docker compose config` valida a configuração do Compose.
- `npm run build --workspaces --if-present` compila os workspaces.
- Teste de fumaça: iniciar o conjunto e executar `curl --fail http://localhost:3000/health/ready`.
- Confirmar manualmente que `http://localhost:5173` exibe a página inicial.

## Limites

- Sempre: manter portas e configurações documentadas; usar volume nomeado para persistência local; manter credenciais fora do código da aplicação.
- Perguntar antes: adicionar serviços de infraestrutura, publicar para acesso externo ou alterar a estratégia de persistência.
- Nunca: usar credenciais de produção no Compose, apagar volumes como parte do fluxo normal ou incluir arquivos `.env` com segredos no controle de versão.

## Critérios de sucesso

- `docker compose up --build` inicia os três serviços sem erro.
- `curl --fail http://localhost:3000/health/ready` retorna sucesso quando o banco está pronto.
- A página inicial responde em `http://localhost:5173`.
- `docker compose down` mantém os dados no volume nomeado.

## Questões em aberto

- Nenhuma. As portas `5173`, `3000` e `5432` foram confirmadas como disponíveis.