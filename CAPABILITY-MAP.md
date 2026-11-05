# Mapa de Capacidades: FixIt Foundation

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `web-foundation` | Aplicação React/TypeScript inicial, servida localmente com uma tela inicial | — |
| `api-foundation` | API Express/TypeScript, configuração e endpoint de saúde com verificação da conexão ao PostgreSQL | — |
| `local-stack` | Docker Compose, PostgreSQL, rede, variáveis de ambiente e comandos para subir o conjunto | `web-foundation`, `api-foundation` |
| `authentication` | Cadastro público de Cliente, sessões e autorização por papel | `web-foundation`, `api-foundation`, `local-stack` |

Ordem de construção: `web-foundation` e `api-foundation` podem ser desenvolvidos em paralelo; `local-stack` integra os dois com o PostgreSQL; `authentication` depende da base integrada.

Cada módulo possui uma especificação própria em `SPEC-web-foundation.md`, `SPEC-api-foundation.md`, `SPEC-local-stack.md` e `SPEC-authentication.md`. As especificações de fundação permanecem limitadas à base executável; `authentication` introduz o primeiro fluxo de produto.