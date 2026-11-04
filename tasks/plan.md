# Plano de Implementação: FixIt Foundation

## Visão geral

Construir um monorepo npm executável localmente, com frontend React/TypeScript, API Express/TypeScript e PostgreSQL, orquestrados pelo Docker Compose. O resultado desta etapa é uma tela inicial, verificações de saúde da API e conexão real com o banco; não inclui autenticação nem funcionalidades do backlog.

## Decisões de arquitetura

- Organizar o monorepo com workspaces npm em `apps/web` e `apps/api`, mantendo comandos e lockfile na raiz.
- Manter a API independente da infraestrutura local: Express recebe configuração por ambiente e TypeORM usa PostgreSQL; o Compose fornece o banco local, sem dependência de SDK Supabase.
- Expor `GET /health/live` para a vida do processo e `GET /health/ready` para verificar o banco, sem vazar detalhes internos.
- Usar Vitest como único framework/test runner nos dois módulos. O frontend usa `jsdom` e APIs DOM; a API usa `fetch` nativo do Node 20 e mocks do Vitest, sem Testing Library ou Supertest.
- Executar frontend, API e banco em serviços Compose; usar volume nomeado e credenciais exclusivamente locais para desenvolvimento.
- Usar versões compatíveis dentro das faixas aprovadas nas specs: Node 20 LTS, React 18, Vite 5+, TypeScript 5, Express 4.18+, PostgreSQL 14+ e TypeORM 0.3.

## Grafo de dependências

```text
Workspace npm e scripts da raiz
  ├── Frontend: configuração → tela inicial e teste
  └── API: configuração → servidor e health checks → testes HTTP
        └── Dockerfiles
              └── Docker Compose: web + API + PostgreSQL
                    └── README e verificação integrada
```

Frontend e API podem avançar em paralelo após a configuração dos workspaces. Imagens e Compose dependem dos dois módulos compilarem e passarem seus testes.

## Ordem de execução

### Fundação do repositório

1. Criar os workspaces npm e comandos de raiz.
2. Configurar as ferramentas do app web; depois implementar a tela e seu teste.
3. Configurar a API; depois implementar os endpoints e seus testes de saúde. As trilhas do web e da API podem ser paralelizadas após a tarefa 1.

### Empacotamento e integração

7. Criar Dockerfiles para os dois apps.
8. Orquestrar web, API e PostgreSQL pelo Docker Compose, incluindo healthcheck do banco e persistência por volume.
9. Documentar os comandos e validar o fluxo integrado.

### Checkpoint: aplicações

- Builds e testes de web e API passam.
- Os dois endpoints de saúde possuem cobertura para sucesso e falha do banco.

### Checkpoint: integração local

- `docker compose config` é válido.
- `docker compose up --build` inicia os três serviços.
- A tela abre em `http://localhost:5173` e `/health/ready` retorna sucesso em `http://localhost:3000`.
- `docker compose down` não remove o volume nomeado.

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Versões divergentes no PDF entre a tabela de stack e exemplos de dependências | Médio | Usar as faixas aprovadas nas specs e fixar versões compatíveis no lockfile. |
| TypeORM 0.3.31 traz advisories moderados transitivos em `glob`/`minimatch` | Médio | Manter a versão 0.3 aprovada, não usar padrões de entidades fornecidos por usuário e reavaliar a atualização antes de introduzir carregamento de metadados por glob. |
| Inicialização da API antes do banco estar pronto | Alto | Healthcheck do PostgreSQL e `depends_on` com condição `service_healthy`. |
| Credenciais locais confundidas com credenciais de produção | Alto | Usar somente valores locais de desenvolvimento, documentar o limite e não versionar `.env`. |
| Testes HTTP deixarem servidores temporários abertos | Baixo | Iniciar em porta efêmera e sempre fechar o servidor no teardown do Vitest. |
| Imagem de desenvolvimento não expor Vite para o host | Médio | Vincular Vite a `0.0.0.0` no container e publicar a porta aprovada. |

## Questões em aberto

Nenhuma. As portas, stack e ferramentas de teste foram aprovadas.

## Lista de tarefas

O detalhamento com critérios de aceite, verificação, dependências e arquivos está em [`tasks/todo.md`](todo.md).