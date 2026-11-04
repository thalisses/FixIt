# Spec: API Foundation

## Objetivo

Criar a base da API do FixIt em Express e TypeScript, conectada ao PostgreSQL via TypeORM. Ela deve responder a verificações de disponibilidade sem expor detalhes internos.

### Critérios de aceite

- A API escuta na porta `3000` e possui `GET /health/live` para confirmar que o processo está ativo.
- `GET /health/ready` executa uma consulta simples ao PostgreSQL e retorna HTTP 200 quando o banco está acessível.
- Se o banco estiver indisponível, `/health/ready` retorna HTTP 503 com uma resposta genérica, sem detalhes da conexão.
- O build termina sem erros de TypeScript.
- Não inclui autenticação, entidades de domínio, migrações ou endpoints das histórias de usuário.

## Stack

- Node.js 20 LTS, Express 4.18 ou superior e TypeScript 5.
- PostgreSQL 14 ou superior e TypeORM 0.3.
- Vitest como único framework/test runner de testes da API; usar o `fetch` nativo do Node.js 20 para chamadas HTTP de teste, sem Supertest.

## Comandos

- Desenvolvimento integrado: `docker compose up --build`.
- Desenvolvimento isolado: `npm run dev --workspace @fixit/api`.
- Build: `npm run build --workspace @fixit/api`.
- Testes: `npm test --workspace @fixit/api`.
- Verificar prontidão: `curl --fail http://localhost:3000/health/ready`.
- Encerrar serviços: `docker compose down`.

## Estrutura do módulo

```text
apps/api/
  src/
    app.ts
    server.ts
    config/
      database.ts
      env.ts
    routes/
      healthRoutes.ts
  package.json
  tsconfig.json
```

## Estilo de código

Separar a criação da aplicação do início do servidor para permitir testes sem abrir uma porta. Usar nomes em camelCase para valores e funções e PascalCase para tipos.

```ts
app.get("/health/ready", async (_request, response) => {
  await dataSource.query("SELECT 1");
  response.status(200).json({ status: "ok", database: "ok" });
});
```

Falhas da consulta devem ser tratadas sem devolver mensagem, endereço ou credenciais do banco ao cliente.

## Estratégia de testes

- Vitest para testes automatizados e `fetch` nativo do Node.js 20 para testar respostas HTTP. Iniciar o servidor Express em uma porta efêmera durante os testes e encerrá-lo ao final.
- Usar os mocks do Vitest para simular a consulta ao banco e cobrir os caminhos saudável e indisponível sem depender de um banco real.
- A consulta real ao PostgreSQL é verificada pela checagem integrada `curl --fail http://localhost:3000/health/ready` após iniciar o Compose.
- `npm run build --workspace @fixit/api` verifica compilação e tipos.

## Limites

- Sempre: validar a configuração obrigatória na inicialização; não retornar detalhes internos em respostas de erro.
- Perguntar antes: adicionar dependências fora da stack descrita, criar entidades ou alterar o modelo de dados.
- Nunca: habilitar sincronização automática de schema para produção, incluir credenciais no código ou implementar autenticação nesta etapa.

## Critérios de sucesso

- Com o PostgreSQL disponível, `/health/live` e `/health/ready` retornam HTTP 200.
- Sem conexão com o PostgreSQL, `/health/ready` retorna HTTP 503 sem expor detalhes internos.
- `npm run build --workspace @fixit/api` termina com código de saída zero.
- Os testes automatizados da API passam.

## Questões em aberto

- Nenhuma.