# Especificação: Autenticação e Autorização

**Status:** Aprovada

## Objetivo

Oferecer cadastro institucional e acesso seguro ao FixIt, aplicando as permissões de Cliente, Manutentor e Gestor na API e na interface web. O cadastro público cria uma conta ativa de Cliente; o Gestor controla a promoção para os perfis operacionais.

O sucesso significa que uma pessoa pode se cadastrar, entrar com e-mail e senha, permanecer autenticada conforme a opção de sessão escolhida e acessar somente os dados e ações permitidos pelo seu perfil atual.

## Escopo e decisões de produto

### Incluído

- Cadastro público de contas ativas de Cliente.
- Login, logout, consulta da sessão atual e sessões gerenciadas pelo servidor.
- Alteração de perfis exclusiva do Gestor, incluindo a proteção contra a remoção do último Gestor.
- Autorização na API por perfil, autoria e atribuição de solicitações.
- Campos de perfil opcionais presentes no protótipo e seleção obrigatória de instituição.
- Provisionamento controlado e não público do primeiro Gestor.

### Fora do escopo

- Confirmação de e-mail ou aprovação antes do primeiro login.
- Recuperação ou redefinição de senha.
- Caixa de aceite das diretrizes de acesso e seu texto legal.
- Escolha pública de perfil, cadastro de contas pelo Gestor ou autopromoção.
- Múltiplas instituições por ambiente, provedores externos de identidade e OAuth/SSO.

### Conciliação com os documentos de origem

O fluxo público de cadastro aprovado substitui o cadastro de usuários pelo Gestor previsto em RFGU002/US002. Permanecem os requisitos do PDF para restrição de funcionalidades por perfil, proteção de credenciais, alteração de cargo e preservação do último Gestor. As transições de perfil aprovadas permitem Cliente → Manutentor ou Gestor.

## Requisitos funcionais

### Cadastro

- `POST /api/users` recebe `fullName`, `email`, `password` e `institutionId` como campos obrigatórios. `cpf` e `cityUf` são opcionais.
- O seletor de instituição não tem opção pré-selecionada; a pessoa deve escolher uma opção válida para concluir o cadastro. O catálogo inicial contém `UEM` — “Universidade Estadual de Maringá - UEM”.
- O identificador da instituição deve corresponder a uma opção configurada para o ambiente; valor ausente ou desconhecido é rejeitado pela API. A seleção registra o vínculo no perfil, mas não altera o escopo de acesso: cada ambiente continua associado a uma única instituição.
- A API atribui o perfil `CLIENTE` e estado ativo; a requisição não pode definir perfil nem solicitar privilégios elevados.
- O e-mail é o único identificador de login. Deve ter formato válido e ser único, com comparação sem distinção entre maiúsculas e minúsculas após normalização.
- A recomendação do Stitch por domínios `.edu` ou `.gov` é apenas informativa; qualquer e-mail válido será aceito. Não há envio de e-mail de confirmação.
- A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes em UTF-8, sem regras adicionais de composição. O limite superior evita o truncamento do bcrypt. O campo de confirmação no formulário deve corresponder à senha e não será armazenado.
- Após o cadastro, a interface exibe uma confirmação e encaminha a pessoa para a tela de login. O cadastro não cria uma sessão automaticamente.
- E-mail duplicado retorna conflito e não cria a conta. Os campos opcionais não podem bloquear a conclusão do cadastro.

### Login e sessões

- `POST /api/sessions` recebe `email`, `password` e `rememberMe` opcional.
- Somente contas ativas podem criar sessões. Combinações inválidas de e-mail/senha retornam a mesma mensagem genérica, sem revelar qual valor está incorreto.
- O login bem-sucedido cria uma sessão opaca gerenciada pelo servidor e envia seu identificador em um cookie `HttpOnly`. O navegador não armazena token de autenticação em `localStorage` ou `sessionStorage`.
- Sem `rememberMe`, o cookie é de sessão do navegador. Quando selecionado, a sessão tem validade máxima absoluta de 7 dias.
- As sessões são armazenadas no PostgreSQL para permitir revogação e persistência após reinicializações da API. O perfil e o estado atual da conta são consultados no servidor a cada requisição autenticada.
- `GET /api/sessions/current` retorna o perfil público e o cargo atual da pessoa autenticada, ou HTTP 401 quando não há sessão válida.
- `DELETE /api/sessions/current` revoga a sessão atual e limpa o cookie.
- Em produção, toda comunicação entre cliente e API usa HTTPS/TLS. Cookies usam `Secure`, `HttpOnly` e `SameSite=Lax`. Requisições autenticadas por cookie que alterem estado devem ter proteção contra CSRF; CORS com credenciais deve usar uma lista explícita de origens permitidas.

### Perfis e limites de autorização

| Ação ou dado | Cliente | Manutentor | Gestor |
|---|---|---|---|
| Criar solicitação de manutenção | Sim | Sim | Sim |
| Listar ou consultar detalhes de solicitação | Somente as próprias | Somente as atribuídas | Todas |
| Alterar status ou registrar execução | Não | Somente as atribuídas | Gerenciar solicitações |
| Definir prioridade, atribuir Manutentor ou cancelar solicitação | Não | Não | Sim |
| Buscar/selecionar ativo durante a criação de solicitação | Campos mínimos para seleção | Sim | Sim |
| Cadastrar ou editar ativos | Não | Sim | Sim |
| Administrar usuários e alterar perfis | Não | Não | Sim |
| Consultar relatórios/painel gerencial | Não | Não | Sim |

A API aplica autorização em toda operação protegida e consulta de registro. Ocultar menus ou rotas no frontend não é um controle de autorização. Clientes não podem acessar solicitações de outras pessoas alterando URL ou identificador. Manutentores não podem consultar solicitações não atribuídas a eles nem acessar o painel gerencial.

As alterações de perfil seguem estas regras:

- Um Gestor pode promover Cliente para Manutentor.
- Um Gestor pode promover Cliente diretamente para Gestor.
- Um Gestor pode alterar Manutentor para Gestor ou Gestor para Manutentor.
- A inscrição pública nunca aceita um perfil fornecido pela pessoa. Uma alteração do próprio Gestor só é permitida se outro Gestor permanecer ativo.
- Uma alteração de perfil preserva a identidade, o histórico de solicitações e as atribuições existentes; as novas permissões valem na próxima requisição à API.
- Uma alteração que deixe a instituição sem Gestor é rejeitada com explicação clara.
- O primeiro Gestor é provisionado por um processo controlado, fora do cadastro público. Suas credenciais não podem ser incluídas no repositório, registradas em logs ou retornadas em texto aberto.

Dados pessoais só são retornados quando necessários à operação autorizada. Nenhum endpoint retorna senhas ou hashes de senha. Respostas de listagem de usuários expõem apenas os campos necessários à administração de usuários e perfis.

## Contrato da API

Todas as respostas de erro JSON seguem o mesmo formato:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "E-mail ou senha inválidos."
  }
}
```

| Método e caminho | Acesso | Contrato |
|---|---|---|
| `POST /api/users` | Público | Entrada: `{ "fullName", "email", "password", "institutionId", "cpf?", "cityUf?" }`. `institutionId` deve identificar uma instituição configurada (inicialmente `UEM`). Cria Cliente ativo e retorna HTTP 201 com `{ "data": { "user": { "id", "fullName", "email", "institutionId", "role" } } }`. Nunca cria sessão nem retorna hash. |
| `POST /api/sessions` | Público | Entrada: `{ "email", "password", "rememberMe?" }`. Autentica, define cookie e retorna HTTP 201 com `{ "data": { "user": { "id", "fullName", "email", "role" } } }`. |
| `GET /api/sessions/current` | Autenticado | Retorna HTTP 200 com `{ "data": { "user": { "id", "fullName", "email", "role" } } }`. |
| `DELETE /api/sessions/current` | Autenticado | Revoga a sessão atual, limpa o cookie e retorna HTTP 204. |
| `GET /api/users?page=1&pageSize=20` | Gestor | Retorna `{ "data": [ ... ], "pagination": { "page", "pageSize", "totalItems", "totalPages" } }`, com somente os campos necessários à administração. |
| `PATCH /api/users/:userId/role` | Gestor | Entrada: `{ "role": "<perfil>" }`, em que `<perfil>` é `CLIENTE`, `MANUTENTOR` ou `GESTOR`. Retorna o perfil público atualizado; permite apenas transições definidas e rejeita tentativas de remover o último Gestor. |

Valide entradas nos limites da API. Use HTTP 422 para entrada inválida, 409 para e-mail duplicado ou conflito de estado/perfil, 401 para autenticação ausente/inválida, 403 para ação não autorizada e uma resposta HTTP 500 genérica que não exponha detalhes internos.

## Stack

- Node.js 20 LTS, TypeScript 5, Express, PostgreSQL e TypeORM, conforme a fundação da API.
- React 18, TypeScript 5, Vite e Tailwind CSS, conforme a fundação web.
- Vitest como test runner dos dois workspaces.
- Hash de senha com bcrypt, conforme NFSEG003.
- A comunicação de produção entre cliente e API deve usar HTTPS/TLS, conforme NFSEG004.
- A inclusão de biblioteca de sessão ou migration deve respeitar o limite existente do projeto para aprovação de dependências e alterações no schema.

## Comandos

- Iniciar a stack integrada: `docker compose up --build`
- Iniciar o workspace web: `npm run dev --workspace @fixit/web`
- Iniciar o workspace da API: `npm run dev --workspace @fixit/api`
- Build de todos os workspaces: `npm run build --workspaces --if-present`
- Testes de todos os workspaces: `npm test --workspaces --if-present`
- Build somente da API: `npm run build --workspace @fixit/api`
- Testes somente da API: `npm test --workspace @fixit/api`
- Build somente do web: `npm run build --workspace @fixit/web`
- Testes somente do web: `npm test --workspace @fixit/web`

## Estrutura do projeto

```text
apps/
  api/
    src/             → Rotas/controladores/serviços de autenticação e sessão, persistência e migrations
    src/**/*.test.ts → Testes de API junto ao código, conforme o padrão existente
  web/
    src/             → Cadastro, login, estado de sessão e navegação por perfil
    src/**/*.test.tsx → Testes de formulários, sessão e proteção de rotas junto ao código
docs/                → Especificações do sistema e das funcionalidades
```

A API é a autoridade para identidade, sessões, transições de perfil e autorização por registro. O frontend apresenta os fluxos correspondentes e navegação por perfil, mas não é a fonte de verdade das permissões.

## Estilo de código

Usar TypeScript estrito, camelCase para valores/funções, PascalCase para tipos/componentes e aspas duplas, conforme o código existente. Manter tratamento HTTP nas rotas/controladores e regras de negócio nos serviços; validar entradas externas nos limites da API.

```ts
app.post("/api/sessions", async (request, response) => {
  const session = await authService.createSession(request.body);
  setSessionCookie(response, session);
  response.status(201).json({ data: { user: session.user } });
});
```

## Estratégia de testes

- Usar Vitest e os comandos existentes dos workspaces.
- Testes de API cobrem atribuição automática do perfil no cadastro, exigência e validação de `institutionId`, rejeição de instituição desconhecida, campos opcionais, unicidade de e-mail sem distinção de caixa, hash da senha, falhas genéricas de login, criação/expiração/logout de sessão, atributos do cookie e consulta da sessão atual.
- Testes de API verificam também senha menor que 8 caracteres, transmissão segura em produção e ausência de senha/hash em qualquer resposta.
- Testes de autorização chamam rotas protegidas diretamente e verificam a matriz de perfil/registro, incluindo escopo próprio versus atribuído, permissão de edição de ativos, bloqueio do painel e bloqueio de administração de usuários/perfis para não-Gestores.
- Testes de gerenciamento de perfis verificam transições permitidas, preservação de histórico/atribuições, aplicação do novo perfil na próxima requisição e rejeição de rebaixamento do último Gestor.
- Testes web cobrem campos obrigatórios/opcionais, instituição sem pré-seleção e opção UEM, confirmação de senha, confirmação do cadastro seguida de login, erros de login, opção “Manter conectado” e navegação/proteção de rotas por perfil.
- Verificar o armazenamento de sessão e migrations com PostgreSQL na stack local; simular dependências externas em testes unitários, não as decisões de autorização.
- Os builds do frontend e da API verificam compilação e tipos TypeScript.

## Limites

- **Sempre:** Aplicar autenticação e escopo de perfil/registro na API; normalizar e impor unicidade do e-mail; usar bcrypt; exigir HTTPS/TLS em produção; nunca retornar material de credencial; configurar cookies com segurança e mensagens genéricas de falha de login.
- **Perguntar antes:** Adicionar dependências, alterar schema/migrations, incluir provedores de identidade externos, alterar validade de sessão ou ampliar as transições de perfil aprovadas.
- **Nunca:** Aceitar perfil no cadastro público, armazenar senha em texto aberto ou token acessível ao navegador, depender apenas de verificações no frontend ou incluir/registrar credenciais de bootstrap.

## Critérios de sucesso

- Um cadastro público com nome, e-mail, senha e uma instituição configurada cria exatamente um Cliente ativo; omitir a instituição ou enviar um identificador desconhecido impede o cadastro, enquanto CPF e cidade/UF podem ser omitidos.
- O seletor exige uma escolha explícita e oferece inicialmente “Universidade Estadual de Maringá - UEM”.
- O cadastro não cria sessão; a pessoa vê uma confirmação e é encaminhada à tela de login.
- E-mail duplicado é rejeitado sem criar outra conta, independentemente de maiúsculas/minúsculas.
- O login aceita e-mail/senha cadastrados, cria o cookie de sessão esperado e retorna a mesma falha genérica para e-mail inexistente e senha incorreta.
- Senhas são armazenadas somente como hashes bcrypt. Nenhum endpoint retorna senha ou hash.
- O tráfego de produção entre cliente e API usa HTTPS/TLS.
- Sessão normal usa cookie não persistente; sessão “Manter conectado” não ultrapassa 7 dias; logout revoga a sessão.
- O acesso à API corresponde à matriz de perfis para solicitações e ativos, inclusive quando uma rota protegida é chamada diretamente.
- Somente Gestor executa transições permitidas, inclusive Cliente → Gestor, e o último Gestor não pode ser rebaixado.
- `npm run build --workspaces --if-present` e `npm test --workspaces --if-present` terminam com sucesso.
- Cadastro e login seguem o design system Stitch e funcionam em larguras de desktop e dispositivos móveis.

## Questões em aberto

Nenhuma bloqueadora. O mecanismo operacional concreto para provisionar o primeiro Gestor e a dependência específica de armazenamento de sessão serão definidos no planejamento, sem criar um fluxo público de cadastro de contas administrativas.

## Fontes

- [Especificação do Sistema Fixit](<./docs/Especificação do Sistema Fixit - CS (2).pdf>), especialmente RFGU001–RFGU003, NFSEG001, NFSEG003–NFSEG005 e US001–US020.
- [Protótipo de login institucional](<./docs/stitch_fixit_gest_o_patrimonial/autentica_o_institucional/code.html>).
- [Protótipo de cadastro público](<./docs/stitch_fixit_gest_o_patrimonial/cadastro_de_usu_rio_fixit/code.html>).
- [Design system FixIt](<./docs/stitch_fixit_gest_o_patrimonial/institutional_asset_maintenance_system/DESIGN.md>).
- Especificações da fundação: [API](./SPEC-api-foundation.md), [Web](./SPEC-web-foundation.md) e [Stack local](./SPEC-local-stack.md).
