# Tarefas: Autenticação e Autorização

## Fase 1: Persistência e cadastro

### Tarefa 1: Criar entidades e migration de usuários e sessões

**Status:** Concluída.

**Descrição:** Definir a persistência versionada para contas e sessões, incluindo unicidade do e-mail normalizado, perfil, instituição e expiração/revogação de sessões.

**Critérios de aceite:**
- [x] Entidades TypeORM representam usuários e sessões com papéis/tipos compatíveis com a spec.
- [x] Migration cria as tabelas, índices de unicidade/consulta e restrições necessárias; não habilita `synchronize`.
- [x] Identificadores de sessão armazenados permitem revogação sem guardar o segredo do cookie em texto aberto.

**Verificação:**
- [x] `npm run build --workspace @fixit/api`.
- [x] `npm test --workspace @fixit/api`.
- [x] Aplicar a migration no PostgreSQL local e confirmar tabelas e índices.

**Dependências:** Nenhuma.

**Arquivos prováveis:**
- `apps/api/src/entities/User.ts`
- `apps/api/src/entities/AuthSession.ts`
- `apps/api/src/migrations/<timestamp>-CreateAuthenticationTables.ts`
- `apps/api/src/config/database.ts`

**Escopo estimado:** Médio.

### Tarefa 2: Configurar migrations e hash bcrypt

**Status:** Concluída.

**Descrição:** Adicionar comandos explícitos para aplicar migrations e a dependência de produção necessária para gerar e validar hashes bcrypt.

**Critérios de aceite:**
- [x] API executa migrations antes de aceitar requisições, sem sincronização automática de schema.
- [x] Existe comando documentado de migration adequado aos workspaces e ao TypeScript do projeto.
- [x] A dependência bcrypt e seus tipos são instalados pelo lockfile da raiz e funcionam nas imagens suportadas.

**Verificação:**
- [x] `npm run build --workspace @fixit/api`.
- [x] `npm test --workspace @fixit/api`.
- [x] `DATABASE_URL=... npm run db:migrate --workspace @fixit/api` confirma que a migration já aplicada não é executada novamente.
- [x] Build Docker da API com Node 20 instala bcrypt e inicia a API; `/health/ready` retorna sucesso.
- [x] bcrypt faz hash e verificação com sucesso no Node 20 do container.

**Dependências:** Tarefa 1.

**Arquivos prováveis:**
- `apps/api/package.json`
- `package-lock.json`
- `apps/api/src/server.ts`
- `apps/api/src/config/database.ts`

**Escopo estimado:** Médio.

### Tarefa 3: Implementar cadastro público de Cliente na API

**Status:** Concluída.

**Descrição:** Criar endpoint e serviço de cadastro com validação de dados, instituição UEM configurada, hash bcrypt e resposta sem credenciais.

**Critérios de aceite:**
- [x] `POST /api/users` exige nome, e-mail válido, senha de no mínimo 8 caracteres e no máximo 72 bytes UTF-8, e instituição configurada; atribui `CLIENTE` e estado ativo.
- [x] E-mail normalizado duplicado retorna HTTP 409; instituição ausente/desconhecida ou entrada inválida é rejeitada; CPF e cidade/UF são opcionais.
- [x] Resposta HTTP 201 contém somente perfil público e não cria sessão nem expõe senha/hash.

**Verificação:**
- [x] `npm test --workspace @fixit/api` cobre entradas válidas, inválidas, duplicidade e perfil/hash.
- [x] `npm run build --workspace @fixit/api`.
- [x] Smoke test integrado com PostgreSQL confirmou conta ativa, perfil Cliente, hash bcrypt válido e remoção do usuário de teste.

**Dependências:** Tarefa 2.

**Arquivos prováveis:**
- `apps/api/src/routes/userRoutes.ts`
- `apps/api/src/services/userService.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/userRoutes.test.ts`
- `apps/api/src/config/institutions.ts`

**Escopo estimado:** Médio.

### Tarefa 4: Implementar o formulário público de cadastro

**Status:** Concluída.

**Descrição:** Construir o fluxo de cadastro Stitch no React, com instituição obrigatória, campos opcionais, confirmação de senha e redirecionamento ao login após sucesso.

**Critérios de aceite:**
- [x] Nome, e-mail, senha, confirmação e instituição são validados no formulário; CPF e cidade/UF são opcionais e UEM não vem pré-selecionada.
- [x] Formulário chama a API, mostra erros de validação/duplicidade e, em sucesso, confirma cadastro e encaminha à tela de login sem criar sessão.
- [x] Interface é responsiva, acessível e consistente com o protótipo/design system Stitch.

**Verificação:**
- [x] `npm test --workspace @fixit/web` cobre seleção obrigatória, campos, erro e sucesso do cadastro.
- [x] `npm run build --workspace @fixit/web`.

**Dependências:** Tarefa 3.

**Arquivos prováveis:**
- `apps/web/src/App.tsx`
- `apps/web/src/pages/RegistrationPage.tsx`
- `apps/web/src/lib/authApi.ts`
- `apps/web/src/App.test.tsx`
- `apps/web/src/styles/index.css`

**Escopo estimado:** Médio.

### Checkpoint: Cadastro

- [x] Migration aplica em PostgreSQL sem sincronização automática.
- [x] Cadastro cria Cliente ativo somente com dados obrigatórios válidos e rejeita duplicidade.
- [x] Build/testes direcionados de API e web passam.

## Fase 2: Sessões e login

### Tarefa 5: Implementar sessões e endpoints de autenticação

**Status:** Concluída.

**Descrição:** Criar login, sessão atual e logout com tokens opacos aleatórios, persistência de hash do token, expiração e revogação no servidor.

**Critérios de aceite:**
- [x] `POST /api/sessions` autentica contas ativas por e-mail/senha e emite cookie `HttpOnly`; erros de credenciais usam resposta genérica.
- [x] Sessão padrão é de navegador; `rememberMe` limita validade a 7 dias; sessão guarda apenas hash do token no PostgreSQL.
- [x] Consulta de sessão retorna papel atual; logout revoga a sessão e limpa o cookie; requisições seguintes deixam de estar autenticadas.

**Verificação:**
- [x] `npm test --workspace @fixit/api` cobre login, falhas uniformes, validade, leitura e revogação com `fetch`.
- [x] `npm run build --workspace @fixit/api`.

**Dependências:** Tarefa 3.

**Arquivos prováveis:**
- `apps/api/src/routes/sessionRoutes.ts`
- `apps/api/src/services/authService.ts`
- `apps/api/src/services/sessionService.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/sessionRoutes.test.ts`

**Escopo estimado:** Médio.

### Tarefa 6: Configurar CORS e proteção CSRF para sessões

**Status:** Concluída.

**Descrição:** Restringir requisições com credenciais à origem web configurada e rejeitar operações autenticadas com cookie sem origem autorizada.

**Critérios de aceite:**
- [x] CORS permite credenciais apenas para a origem web explicitamente configurada, sem curingas.
- [x] Requisições autenticadas que alteram estado validam `Origin`; origem ausente ou não permitida é rejeitada.
- [x] Cookies têm `SameSite=Lax`, `HttpOnly` e `Secure` em produção; flags são cobertas por testes.

**Verificação:**
- [x] `npm test --workspace @fixit/api` cobre origens permitidas/não permitidas e flags de cookie.
- [x] `npm run build --workspace @fixit/api`.

**Dependências:** Tarefa 5.

**Arquivos prováveis:**
- `apps/api/src/config/env.ts`
- `apps/api/src/middleware/cors.ts`
- `apps/api/src/middleware/csrf.ts`
- `apps/api/src/app.ts`
- `apps/api/src/middleware/csrf.test.ts`

**Escopo estimado:** Médio.

### Tarefa 7: Implementar login e ciclo de sessão na interface

**Status:** Concluída.

**Descrição:** Construir tela de login baseada no Stitch, manter estado da sessão por consulta à API e disponibilizar logout e opção “Manter conectado”.

**Critérios de aceite:**
- [x] Login envia e-mail, senha e `rememberMe` com credenciais/cookies, exibe falha genérica e direciona a pessoa autenticada à área compatível com seu perfil.
- [x] Estado inicial consulta a sessão atual; sessão ausente direciona para login e logout encerra sessão no servidor.
- [x] Interface responsiva inclui mostrar/ocultar senha e controles acessíveis do protótipo.

**Verificação:**
- [x] `npm test --workspace @fixit/web` cobre login válido/inválido, consulta de sessão, “Manter conectado” e logout.
- [x] `npm run build --workspace @fixit/web`.
- [x] Fluxo no browser confirmou cadastro, login, reidratação após recarga e logout; a sessão revogada no PostgreSQL e o usuário de teste foram removidos.

**Dependências:** Tarefa 6.

**Arquivos prováveis:**
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/context/AuthContext.tsx`
- `apps/web/src/lib/authApi.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`

**Escopo estimado:** Médio.

### Checkpoint: Sessões

- [x] Cadastro → login → sessão atual → logout está coberto nos testes.
- [x] Cookie e proteção de origem funcionam com o frontend e a API locais.
- [x] Build/testes direcionados de API e web passam.

## Fase 3: Autorização e administração

### Tarefa 8: Implementar políticas reutilizáveis de autorização

**Status:** Concluída.

**Descrição:** Codificar regras de papel e escopo de registro da spec em funções/middleware independentes dos endpoints de domínio ainda inexistentes.

**Critérios de aceite:**
- [x] Política permite Cliente criar solicitação e consultar somente próprias, Manutentor consultar/atualizar somente atribuídas e Gestor consultar/gerenciar todas.
- [x] Política permite Gestor e Manutentor cadastrar/editar ativos; somente Gestor administra perfis e consulta relatórios.
- [x] Chamadas sem sessão retornam 401 e perfil/escopo insuficiente retorna 403; testes verificam políticas sem criar APIs de domínio fictícias.

**Verificação:**
- [x] `npm test --workspace @fixit/api` verifica a matriz completa de papéis e ownership/assignment.
- [x] `npm run build --workspace @fixit/api`.

**Dependências:** Tarefa 5.

**Arquivos prováveis:**
- `apps/api/src/auth/authorization.ts`
- `apps/api/src/auth/authorization.test.ts`
- `apps/api/src/middleware/requireAuth.ts`
- `apps/api/src/middleware/requireRole.ts`

**Escopo estimado:** Médio.

### Tarefa 9: Implementar API de usuários e mudança de perfil

**Status:** Concluída.

**Descrição:** Permitir que Gestores listem usuários e mudem perfis pelas transições aprovadas, protegendo a operação concorrente sobre o último Gestor.

**Critérios de aceite:**
- [x] `GET /api/users` pagina e retorna apenas campos necessários; `PATCH /api/users/:userId/role` aceita somente transições autorizadas por Gestor.
- [x] Cliente pode virar Manutentor ou Gestor; Manutentor e Gestor podem alternar entre si; Cliente não muda o próprio perfil; vínculos/histórico são preservados.
- [x] Transações serializadas rejeitam rebaixamento próprio ou concorrente que deixe a instituição sem Gestor, com erro explicativo.

**Verificação:**
- [x] `npm test --workspace @fixit/api` cobre permissões, transições, paginação e preservação.
- [x] `npm run build --workspace @fixit/api`.
- [x] Smoke test com PostgreSQL confirmou a proteção do último Gestor em duas alterações simultâneas.

**Dependências:** Tarefas 5 e 8.

**Arquivos prováveis:**
- `apps/api/src/routes/userRoutes.ts`
- `apps/api/src/services/userService.ts`
- `apps/api/src/repositories/userRepository.ts`
- `apps/api/src/routes/userRoutes.test.ts`
- `apps/api/src/app.ts`

**Escopo estimado:** Médio.

### Tarefa 10: Criar provisionamento controlado do primeiro Gestor

**Status:** Concluída.

**Descrição:** Implementar comando operacional de uso único para promover uma conta existente a Gestor antes de haver um Gestor na instituição.

**Critérios de aceite:**
- [x] Comando não cria endpoint público e exige acesso operacional ao banco/processo da API.
- [x] Senha inicial é coletada sem eco no terminal, armazenada somente como bcrypt e nunca aparece em argumentos/logs.
- [x] Comando é idempotente/seguro contra uso acidental quando já existe Gestor e informa claramente como sair sem expor dados sensíveis.

**Verificação:**
- [x] Teste do serviço/CLI cobre primeiro provisionamento, conta inexistente e tentativa após Gestor já existir.
- [x] `npm run build --workspace @fixit/api`.

**Dependências:** Tarefas 2 e 9.

**Arquivos prováveis:**
- `apps/api/package.json`
- `apps/api/src/commands/provisionManager.ts`
- `apps/api/src/commands/provisionManager.test.ts`

**Escopo estimado:** Pequeno.

### Tarefa 11: Criar interface Gestor para administrar usuários

**Status:** Concluída.

**Descrição:** Apresentar lista paginada de usuários e ações de mudança de perfil conforme as transições disponíveis.

**Critérios de aceite:**
- [x] Apenas Gestor vê a área de administração; API continua sendo a autoridade e recusa acesso direto por outros perfis.
- [x] Interface permite promover Cliente a Manutentor ou Gestor e alternar cargos administrativos, com confirmação e tratamento de conflito do último Gestor.
- [x] Perfil atualizado aparece após a operação; nomes e badges seguem o design system e os controles são acessíveis.

**Verificação:**
- [x] `npm test --workspace @fixit/web` cobre visibilidade por perfil, transições, atualização e erro de conflito.
- [x] `npm run build --workspace @fixit/web`.
- [x] Smoke test responsivo validou a interface Gestor em 320, 390, 768, 1024 e 1440 px, sem overflow horizontal.

**Dependências:** Tarefas 7 e 9.

**Arquivos prováveis:**
- `apps/web/src/pages/UserManagementPage.tsx`
- `apps/web/src/lib/authApi.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/UserManagementPage.test.tsx`
- `apps/web/src/styles/index.css`

**Escopo estimado:** Médio.

### Checkpoint: Autorização

- [x] Matriz de autorização e escopo de registros verificada por testes da API.
- [x] Gestor lista usuários e executa transições permitidas, incluindo Cliente → Gestor.
- [x] Último Gestor permanece protegido sob operações concorrentes.
- [x] Build/testes direcionados de API e web passam.

## Fase 4: Integração e aceite

### Tarefa 12: Verificar fluxo integrado e documentar operação

**Status:** Verificada; revisão humana pendente.

**Descrição:** Validar migrations e fluxos completos em Compose/PostgreSQL e documentar setup, primeiro Gestor, ambiente e limitações.

**Critérios de aceite:**
- [x] Cadastro, login, sessão corrente, logout, gestão de usuário e controle de último Gestor funcionam com PostgreSQL real.
- [x] README descreve migration, origens web/API, comando de provisionamento inicial, testes e que TLS deve ser terminado na infraestrutura de produção.
- [x] Políticas de autorização ficam identificadas como requisito de integração quando forem criados endpoints de solicitações, ativos e relatórios.

**Verificação:**
- [x] `docker compose config`.
- [x] `npm run build --workspaces --if-present`.
- [x] `npm test --workspaces --if-present`.
- [x] Smoke tests integrados com PostgreSQL foram executados; não foi registrado nenhum segredo.

**Dependências:** Tarefas 4, 6, 7, 8, 9, 10 e 11.

**Arquivos prováveis:**
- `README.md`
- `docker-compose.yml`
- `apps/api/src/**/*.test.ts`
- `apps/web/src/**/*.test.tsx`

**Escopo estimado:** Médio.

### Checkpoint: Conclusão

- [x] Critérios de aceite da spec aprovados nos fluxos e testes integrados.
- [x] Build e testes completos passam.
- [ ] Revisão humana antes de considerar o módulo concluído.
