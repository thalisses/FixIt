# Tarefas: FixIt Foundation

## Fundação do repositório

### Tarefa 1: Inicializar workspaces npm

**Descrição:** Configurar o monorepo npm e os pacotes `@fixit/web` e `@fixit/api` para instalar dependências e executar scripts a partir da raiz.

**Critérios de aceite:**
- [x] A raiz declara workspaces para `apps/web` e `apps/api` e declara uma faixa de Node.js compatível com as ferramentas.
- [x] Os pacotes possuem nomes e scripts iniciais compatíveis com os comandos especificados.
- [x] Arquivos de ambiente locais são ignorados pelo Git e há lockfile único na raiz.

**Verificação:**
- [x] `npm install` termina com sucesso na raiz.
- [x] `npm pkg get workspaces` lista os dois workspaces.

**Dependências:** Nenhuma.

**Arquivos prováveis:**
- `package.json`
- `package-lock.json`
- `.gitignore`
- `apps/web/package.json`
- `apps/api/package.json`

**Escopo estimado:** Médio.

### Tarefa 2: Configurar ferramentas do frontend

**Descrição:** Configurar Vite, React, TypeScript estrito, Tailwind e Vitest com jsdom para o workspace web.

**Critérios de aceite:**
- [x] O workspace tem scripts de desenvolvimento, build e teste compatíveis com as specs.
- [x] Vitest usa jsdom e não depende de Testing Library.
- [x] Dependências são instaladas pelo lockfile único na raiz.

**Verificação:**
- [x] `npm install` termina com sucesso na raiz.
- [x] `npm run dev --workspace @fixit/web -- --help` confirma que o script encontra o Vite instalado.

**Dependências:** Tarefa 1.

O `package-lock.json` da raiz é atualizado pelo npm como artefato gerado nesta tarefa.

**Arquivos prováveis:**
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `apps/web/tailwind.config.cjs`
- `apps/web/postcss.config.cjs`

**Escopo estimado:** Médio.

### Tarefa 3: Criar a tela inicial e teste do frontend

**Descrição:** Implementar a entrada React, a tela inicial do FixIt e um teste Vitest que verifica sua renderização pelo DOM.

**Critérios de aceite:**
- [x] O app renderiza o título FixIt sem depender da API.
- [x] O teste usa jsdom e APIs DOM diretamente, sem Testing Library.
- [x] Build e teste do workspace web passam.

**Verificação:**
- [x] `npm run build --workspace @fixit/web`.
- [x] `npm test --workspace @fixit/web`.

**Dependências:** Tarefa 2.

**Arquivos prováveis:**
- `apps/web/index.html`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/styles/index.css`
- `apps/web/src/App.test.tsx`

**Escopo estimado:** Médio.

### Tarefa 4: Configurar o workspace da API

**Descrição:** Configurar pacote, compilação TypeScript, validação de ambiente e DataSource TypeORM para PostgreSQL.

**Critérios de aceite:**
- [x] O pacote define scripts dev, build e test para a API.
- [x] Configuração de ambiente valida variáveis obrigatórias sem expor credenciais.
- [x] TypeORM está configurado para PostgreSQL sem sincronização automática de schema.

**Verificação:**
- [x] `npm install` termina com sucesso na raiz.
- [x] `npm run build --workspace @fixit/api`.

**Dependências:** Tarefa 1.

**Arquivos prováveis:**
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/config/env.ts`
- `apps/api/src/config/database.ts`
- `package-lock.json`

**Escopo estimado:** Pequeno.

### Tarefa 5: Implementar servidor e health checks da API

**Descrição:** Criar a aplicação Express e as rotas de vida e prontidão, mantendo a aplicação importável sem abrir porta para os testes.

**Critérios de aceite:**
- [x] `GET /health/live` responde HTTP 200 quando o processo está ativo.
- [x] `GET /health/ready` consulta PostgreSQL e responde HTTP 200 quando disponível.
- [x] Falha no banco retorna HTTP 503 sem expor detalhes internos.

**Verificação:**
- [x] `npm run build --workspace @fixit/api`.
- [ ] Iniciar a API com configuração válida e consultar `/health/live` (integração na tarefa Compose).

**Dependências:** Tarefa 4.

**Arquivos prováveis:**
- `apps/api/src/app.ts`
- `apps/api/src/server.ts`
- `apps/api/src/routes/healthRoutes.ts`

**Escopo estimado:** Pequeno.

### Tarefa 6: Testar os health checks da API

**Descrição:** Cobrir os endpoints com Vitest e `fetch` nativo do Node.js 20, iniciando o Express em porta efêmera e simulando o acesso ao banco.

**Critérios de aceite:**
- [x] Testes verificam o caminho de sucesso para `/health/live` e `/health/ready`.
- [x] Teste verifica HTTP 503 genérico para falha do banco, sem detalhes internos na resposta.
- [x] Servidor temporário é fechado mesmo quando um teste falha; não há dependência de Supertest.

**Verificação:**
- [x] `npm test --workspace @fixit/api`.

**Dependências:** Tarefa 5.

**Arquivos prováveis:**
- `apps/api/src/routes/healthRoutes.test.ts`

**Escopo estimado:** Pequeno.

### Checkpoint: frontend

- [x] Build e teste do workspace web passam.
- [x] Revisar o limite de escopo antes de seguir para a API.

### Checkpoint: aplicações

- [x] `npm run build --workspaces --if-present` passa.
- [x] `npm test --workspaces --if-present` passa.
- [x] Revisar os limites de escopo antes de containerizar.

## Empacotamento e integração local

### Tarefa 7: Criar imagens Docker de desenvolvimento

**Descrição:** Criar imagens para os workspaces web e API, com contexto na raiz para usar o lockfile único e scripts de desenvolvimento acessíveis pelo host.

**Critérios de aceite:**
- [x] Imagens web e API são construídas a partir do monorepo sem copiar `.env` ou outros segredos.
- [x] O Vite escuta em `0.0.0.0` dentro do container.
- [x] Os processos usam os scripts de desenvolvimento definidos nos workspaces.

**Verificação:**
- [x] `docker build -f apps/web/Dockerfile -t fixit-web .`.
- [x] `docker build -f apps/api/Dockerfile -t fixit-api .`.

**Dependências:** Tarefas 3 e 6.

**Arquivos prováveis:**
- `apps/web/Dockerfile`
- `apps/api/Dockerfile`
- `.dockerignore`

**Escopo estimado:** Pequeno.

### Tarefa 8: Orquestrar serviços com Docker Compose

**Descrição:** Definir serviços web, API e PostgreSQL, configuração por ambiente, healthcheck do banco, dependência de prontidão da API e volume nomeado.

**Critérios de aceite:**
- [x] `docker compose up --build` inicia `web`, `api` e `db` com as portas aprovadas.
- [x] A API espera o PostgreSQL ficar saudável antes de iniciar.
- [x] `docker compose down` não apaga o volume de dados.
- [x] `.env` não é versionado; `.env.example` contém apenas valores locais documentados.

**Verificação:**
- [x] `docker compose config`.
- [x] `docker compose up --build --detach`.
- [x] `curl --fail http://localhost:3000/health/ready`.
- [x] Abrir `http://localhost:5173` e confirmar que a tela inicial aparece.
- [x] `docker compose down` e confirmar que o volume nomeado permanece.

**Dependências:** Tarefa 7.

**Arquivos prováveis:**
- `docker-compose.yml`
- `.env.example`

**Escopo estimado:** Pequeno.

### Tarefa 9: Documentar execução e verificar o conjunto

**Descrição:** Atualizar o README com pré-requisitos, inicialização, portas, testes, encerramento e observação de que credenciais Compose são somente locais.

**Critérios de aceite:**
- [x] Um integrante consegue seguir o README para subir o ambiente do zero.
- [x] Os comandos de build, teste, saúde e encerramento correspondem aos scripts reais.
- [x] A documentação alerta que os valores locais não são apropriados para produção.

**Verificação:**
- [x] Executar os comandos documentados em uma sessão limpa.
- [x] Confirmar build e testes dos dois workspaces e smoke test do Compose.

**Dependências:** Tarefa 8.

**Arquivos prováveis:**
- `README.md`

**Escopo estimado:** Pequeno.

### Checkpoint: integração local

- [x] Builds e testes dos workspaces passam.
- [x] Compose inicia os três serviços e a API confirma a conexão com PostgreSQL.
- [x] Tela inicial acessível na porta `5173`.
- [x] Volume persiste após `docker compose down`.
- [ ] Revisão humana antes de considerar a fundação concluída.