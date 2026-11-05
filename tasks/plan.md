# Plano de Implementação: Autenticação e Autorização

## Visão geral

Implementar a especificação aprovada em [`SPEC-authentication.md`](../SPEC-authentication.md) em fatias verificáveis: persistência e cadastro de Cliente, sessões e login, autorização por perfil/registro, gestão de perfis pelo Gestor, provisionamento inicial controlado e integração com os protótipos Stitch.

O repositório atualmente contém apenas health checks na API e uma tela inicial no frontend. Não existem ainda endpoints ou modelos de solicitações, ativos e relatórios. Este plano implementa as políticas reutilizáveis de autorização e testa a matriz com essas políticas; os futuros endpoints de domínio devem aplicá-las ao serem criados. Não serão criados endpoints de negócio artificiais neste módulo.

## Decisões de arquitetura

- Manter Express, TypeORM e PostgreSQL na API e React/Vite no frontend; evoluir as convenções já presentes, sem introduzir um framework de servidor ou roteamento sem necessidade.
- Criar entidades e migrations TypeORM versionadas para usuários e sessões; executar migrations explicitamente antes de iniciar a API. `synchronize` permanece desabilitado.
- Representar o catálogo de instituições como configuração validada do ambiente, inicialmente com `UEM` — “Universidade Estadual de Maringá - UEM”. O usuário armazena a chave selecionada; o ambiente continua associado a uma única instituição.
- Hash de senha com bcrypt. Gerar identificador de sessão aleatório com `node:crypto`, guardar somente o hash do identificador no PostgreSQL e comparar sessão/expiração no servidor.
- Usar cookies `HttpOnly`, `SameSite=Lax` e `Secure` em produção; habilitar CORS com credenciais somente para a origem web configurada e validar `Origin` em operações autenticadas que alteram estado para proteção CSRF.
- Aplicar o perfil atual em cada requisição; não codificar permissões em tokens long-lived nem confiar na navegação do frontend.
- Serializar mudanças de perfil no PostgreSQL para impedir que operações concorrentes rebaixem/removam todos os Gestores.
- Não criar cadastro administrativo público. Provisionar o primeiro Gestor por comando operacional restrito, sem credenciais hardcoded, em logs ou na resposta da API.
- Seguir o padrão de testes existente: Vitest, APIs DOM diretas no frontend e `fetch` nativo para testes HTTP da API. Usar testes com PostgreSQL local para migrations, transações e persistência reais.
- Preservar os contratos, limites e critérios de aceite da spec aprovada; qualquer mudança necessária será refletida na spec antes da implementação.

## Grafo de dependências

```text
Entidades/migrations
  ├── Cadastro API ── Cadastro web
  └── Sessões API ── CORS/CSRF ── Login web
        └── Políticas de autorização
              ├── API de gestão de usuários/perfis
              │     ├── Provisionamento do primeiro Gestor
              │     └── Interface de gestão de usuários
              └── Base para proteção de futuros endpoints de domínio

Fluxos completos ── Testes integrados + documentação de operação
```

## Lista de tarefas

### Fase 1: Persistência e cadastro

1. Criar entidades e migration de usuários e sessões.
2. Configurar execução explícita de migrations e dependência de hash bcrypt.
3. Implementar cadastro público de Cliente na API.
4. Implementar o formulário público de cadastro no Stitch.

### Checkpoint: Cadastro

- Migration aplica em PostgreSQL sem sincronização automática.
- Cadastro cria Cliente ativo somente com nome, e-mail, senha e instituição válida; duplicidades e entradas inválidas são rejeitadas.
- Fluxo visual confirma cadastro e encaminha para login, sem autenticar automaticamente.
- Build e testes direcionados de API e web passam.

### Fase 2: Sessões e login

5. Implementar sessões persistentes no servidor e endpoints de sessão.
6. Configurar CORS e proteção CSRF para cookies de sessão.
7. Implementar login, sessão corrente e logout na interface web.

### Checkpoint: Sessões

- Login válido cria sessão opaca; falhas não distinguem e-mail inexistente de senha incorreta.
- Logout revoga sessão; validade normal e “Manter conectado” obedecem à spec.
- Cookies e requisições com credenciais passam pelos controles definidos.
- Build e testes direcionados de API e web passam.

### Fase 3: Autorização e administração

8. Implementar políticas reutilizáveis de autorização por perfil e escopo de solicitação.
9. Implementar listagem de usuários e alteração de perfis pela API.
10. Criar comando operacional para provisionar o primeiro Gestor.
11. Implementar a interface Gestor para administração de usuários e perfis.

### Checkpoint: Autorização

- Testes cobrem a matriz de perfis e o escopo Cliente/próprias solicitações e Manutentor/solicitações atribuídas.
- Somente Gestor lista/gerencia usuários; transições permitidas preservam vínculos e histórico.
- Tentativas concorrentes não conseguem remover o último Gestor.
- O primeiro Gestor não é criado por rota pública e segredos não aparecem no repositório/logs.
- Build e testes direcionados de API e web passam.

### Fase 4: Integração e aceite

12. Verificar os fluxos completos com PostgreSQL e documentar comandos operacionais.

### Checkpoint: Conclusão

- Cadastro → login → sessão corrente → logout funciona no stack local.
- Promoção Cliente → Gestor/Manutentor e transições Gestor ↔ Manutentor funcionam com proteção do último Gestor.
- `npm run build --workspaces --if-present` e `npm test --workspaces --if-present` passam.
- `docker compose config` é válido e o smoke test com PostgreSQL passa.
- Revisão humana dos critérios de aceite antes de considerar o módulo concluído.

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Não existem endpoints/modelos de solicitações, ativos ou relatórios no código atual | Alto | Implementar e testar políticas de autorização reutilizáveis; registrar aplicação nos futuros endpoints como requisito de cada módulo de domínio, sem simular APIs inexistentes. |
| Concorrência em alterações de papel pode remover o último Gestor | Alto | Serializar operações de troca de papel dentro de transação PostgreSQL e testar tentativas concorrentes. |
| Cookie de sessão exige alinhamento de CORS e origem web | Alto | Configurar origem explícita; testar credenciais, `Origin`, flags do cookie e CSRF no browser/HTTP local. |
| Sessões e usuários exigem schema persistente inexistente | Alto | Versionar migrations e validar aplicação/reversão e execução local; manter `synchronize: false`. |
| Dependência nativa bcrypt pode variar entre host e container | Médio | Validar instalação/build nos ambientes Node suportados e imagem Docker antes de avançar. |
| Bootstrap administrativo pode expor credenciais | Alto | Usar comando operacional restrito e entrada sem eco; nunca incluir senha em args, código versionado ou logs. |
| A aprovação da spec não define uma política de bloqueio/remoção de contas | Médio | Não adicionar estados ou operações de bloqueio fora do contrato; se necessário, atualizar a spec antes de ampliar o endpoint. |

## Questões em aberto

- Nenhuma decisão de produto bloqueadora.
- A aplicação inicial não possui rotas de solicitações, ativos ou relatórios. A integração da política de acesso a essas rotas será feita nos respectivos módulos; este plano cobre a política reutilizável e seus testes.

O detalhamento por tarefa, incluindo critérios, verificação, dependências e arquivos prováveis, está em [`tasks/todo.md`](todo.md).
