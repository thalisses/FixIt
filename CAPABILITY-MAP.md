# Mapa de Capacidades: FixIt Foundation

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `web-foundation` | Aplicação React/TypeScript inicial, servida localmente com uma tela inicial | — |
| `api-foundation` | API Express/TypeScript, configuração e endpoint de saúde com verificação da conexão ao PostgreSQL | — |
| `local-stack` | Docker Compose, PostgreSQL, rede, variáveis de ambiente e comandos para subir o conjunto | `web-foundation`, `api-foundation` |

Ordem de construção: `web-foundation` e `api-foundation` podem ser desenvolvidos em paralelo; `local-stack` integra os dois com o PostgreSQL.

Cada módulo possui uma especificação própria em `SPEC-web-foundation.md`, `SPEC-api-foundation.md` e `SPEC-local-stack.md`. O escopo se limita à fundação executável, sem autenticação ou funcionalidades do backlog do FixIt.