# Especificação: Gestão da Fila e Filtros

**Status:** Proposta para revisão do time.

**Fonte:** histórias US012, US013, US014, US015, US016, US019 e US021 da Etapa 1;
`DESIGN.md`; protótipo Stitch (`imagens_stitch/screen2.png`, `screen3.png`,
`screen5.png`, `screen6.png`).

## Status de implementação

| História | Status |
|---|---|
| US013 — listagem e filtros | Concluída no PR #10 |
| US014 — mudança de status | Concluída no PR #11 |
| US015 — prioridade | Concluída no PR #12 |
| US016 — atribuição de responsável | Concluída (implementação da Thalisses) |
| US012 — cancelamento | Concluída no PR #14 |
| US019 — triagem | Em implementação nesta branch |
| US021 — filtros do relatório | Pendente (depende da US020) |

## Objetivo

Transformar a lista de solicitações em uma fila de trabalho operacional. O
Gestor precisa enxergar todas as solicitações, filtrar por status, setor, tipo
de problema e período, definir prioridade, atribuir um manutentor responsável,
acompanhar a triagem, mudar o status e cancelar solicitações improcedentes sem
apagar o histórico. O Manutentor precisa enxergar e movimentar apenas as
solicitações atribuídas a ele. O Cliente precisa enxergar apenas as próprias.

## Escopo incluído

- US013: listagem paginada com filtros combinados.
- US014: mudança de status com histórico e data de conclusão.
- US015: prioridade de atendimento distinta da urgência declarada.
- US016: atribuição de manutentor responsável, com especialidade e histórico.
- US012: cancelamento com motivo, sem exclusão do registro.
- US019: contador de solicitações em aberto sem responsável.
- US021: filtros do relatório de manutenções.

## Fora do escopo

- SLA, MTTR, custos, depreciação, disponibilidade da equipe, QR Code e
  configurações mostrados no protótipo Stitch.
- Prioridade P1–P4. O modelo já possui três níveis: `BAIXA`, `MEDIA` e `ALTA`.
- Status "Aguardando peça". O modelo possui `EM_ABERTO`, `EM_ATENDIMENTO`,
  `CONCLUIDO` e `CANCELADA`.
- Anexos (US009), exportação/impressão (US022) e aplicativo nativo (US023).
- Criação de solicitação (US007), detalhe/acompanhamento (US010/US011) e painel
  gerencial (US020). Esses itens são dependências ou histórias de outros
  integrantes.

## Dependências e contratos compartilhados

| Dependência | Dono | Contrato necessário |
|---|---|---|
| US007 — criação de solicitação | Sophia | Criar a solicitação e o registro inicial `ABERTURA` no histórico, na mesma transação. |
| US010 — detalhe da solicitação | Sophia | `GET /api/solicitations/:id` com escopo por papel. Pode ser compartilhado com US014–US016. |
| US018 — histórico de status | Joaquim | `GET /api/solicitations/:id/history`, já implementado no backend. |
| US020 — painel | Thalisses | Endpoint/serviço de indicadores compartilhado com US021. |
| `User.especialidade` | Thalisses/Kendy | Campo nullable para ordenar manutentores compatíveis (US016 CA2). |
| Vínculo com o bem | Joaquim | `Solicitation.bemId` e relação `bem`, já implementados. |

### Regra de ouro

Não criar tabelas paralelas para histórico. A entidade `StatusHistory` já possui
`TipoRegistro.ATRIBUICAO`, `TipoRegistro.CANCELAMENTO` e
`TipoRegistro.OBSERVACAO`. Devemos reutilizá-la.

## Modelo de dados

### Existente e reutilizado

```text
Solicitation
  id, data, local, tipoProblema, setorResponsavel, descricaoProblema,
  observacoes, urgencia, prioridade, status, dataConclusao,
  solicitanteId, responsavelId, bemId

StatusHistory
  id, tipo, statusAnterior, statusNovo, descricao, dataHora,
  solicitacaoId, autorId

User
  id, fullName, email, role, isActive, institutionId, ...

Asset
  id, codigoPatrimonial, descricao, localizacao, estadoConservacao, ...
```

### Alterações propostas

1. Índices em `solicitations` para os filtros e a ordenação:
   - `status`, `data`, `prioridade`, `tipo_problema`,
     `setor_responsavel`, `solicitante_id`, `responsavel_id`.
2. `User.especialidade` nullable, com os mesmos valores de `AreaTecnica`
   (`ELETRICA`, `HIDRAULICA`, `INFORMATICA`, `ESTRUTURAL`, `OUTROS`).
   - A migration deve reutilizar o tipo `area_tecnica` já criado pela migration
     de solicitações ou criar um tipo separado; revisar o SQL gerado.
   - O gerenciamento de usuários deve permitir que o Gestor defina a
     especialidade de um Manutentor. Se a UI não entrar nesta sprint, o seed de
     demonstração deve preencher o campo para a US016 CA2.
3. Nenhuma tabela nova para atribuição/cancelamento. Usar `StatusHistory`:
   - `ATRIBUICAO`: `descricao` com responsável anterior/novo;
   - `CANCELAMENTO`: `statusAnterior = EM_ABERTO`, `statusNovo = CANCELADA`,
     `descricao = motivo`.

## Autorização

| Ação | Cliente | Manutentor | Gestor |
|---|---|---|---|
| Listar solicitações | Próprias | Atribuídas | Todas |
| Consultar detalhe | Próprias | Atribuídas | Todas |
| Alterar status | Não | Atribuídas | Sim |
| Definir prioridade | Não | Não | Sim |
| Atribuir responsável | Não | Não | Sim |
| Cancelar | Não | Não | Sim |
| Ver contador de triagem | Não | Não | Sim |
| Ver relatório | Não | Não | Sim |

A autorização é aplicada na API. O frontend apenas esconde controles.

## Contrato da API

### `GET /api/solicitations`

Lista paginada, com escopo por papel.

**Query params:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `status` | enum | Não | `EM_ABERTO`, `EM_ATENDIMENTO`, `CONCLUIDO`, `CANCELADA` |
| `setor` | texto | Não | Filtra `setorResponsavel` por trecho, sem diferenciar caixa |
| `tipo` | enum | Não | `AreaTecnica` |
| `prioridade` | enum | Não | `BAIXA`, `MEDIA`, `ALTA` |
| `responsavelId` | uuid | Não | Filtra por responsável |
| `de` | data `YYYY-MM-DD` | Não | Data inicial (inclusive) |
| `ate` | data `YYYY-MM-DD` | Não | Data final (inclusive) |
| `semResponsavel` | `true`/`false` | Não | Filtra `responsavelId IS NULL` |
| `page` | inteiro | Não | Padrão 1 |
| `pageSize` | inteiro | Não | Padrão 20, máximo 100 |

**Resposta 200:**

```json
{
  "data": [
    {
      "id": 1,
      "data": "2026-11-07T12:00:00.000Z",
      "local": "Bloco C, sala 12",
      "tipoProblema": "INFORMATICA",
      "setorResponsavel": "TI",
      "urgencia": "ALTA",
      "prioridade": "MEDIA",
      "status": "EM_ABERTO",
      "dataConclusao": null,
      "solicitante": { "id": "uuid", "fullName": "Ana Silva" },
      "responsavel": null,
      "bem": {
        "id": 1,
        "codigoPatrimonial": "PAT-1",
        "descricao": "Projetor Epson"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

**Erros:** 401 sem sessão; 422 validação; 500 erro interno.

### Endpoints das próximas fatias

| Método | Rota | Acesso | História |
|---|---|---|---|
| `GET` | `/api/solicitations/:id` | Escopo por papel | US010 (compartilhado) |
| `PATCH` | `/api/solicitations/:id/status` | Gestor/Manutentor atribuído | US014 |
| `PATCH` | `/api/solicitations/:id/priority` | Gestor | US015 |
| `PATCH` | `/api/solicitations/:id/assignee` | Gestor | US016 |
| `POST` | `/api/solicitations/:id/cancel` | Gestor | US012 |
| `GET` | `/api/solicitations/triage-count` | Gestor | US019 |
| `GET` | `/api/reports/maintenance` | Gestor | US021 |

Rotas fixas devem ser declaradas antes de `/:id` para não serem interpretadas
como identificador.

### Erros padronizados

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados da solicitação inválidos.",
    "fields": { "status": "Status inválido." }
  }
}
```

| Código | HTTP | Quando |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Entrada inválida |
| `UNAUTHENTICATED` | 401 | Sem sessão |
| `FORBIDDEN` | 403 | Papel/escopo insuficiente |
| `SOLICITATION_NOT_FOUND` | 404 | Id inexistente |
| `INVALID_STATUS_TRANSITION` | 409 | Transição não permitida |
| `SOLICITATION_NOT_CANCELABLE` | 409 | Cancelamento inválido |
| `MAINTAINER_NOT_FOUND` | 422/404 | Usuário não é Manutentor ativo |
| `INVALID_PERIOD` | 422 | Data inicial posterior à final |
| `INTERNAL_SERVER_ERROR` | 500 | Erro inesperado |

## Máquina de estados

| Status atual | Próximo permitido | Quem |
|---|---|---|
| `EM_ABERTO` | `EM_ATENDIMENTO` | Gestor ou Manutentor atribuído |
| `EM_ATENDIMENTO` | `CONCLUIDO` | Gestor ou Manutentor atribuído |
| `EM_ABERTO` | `CANCELADA` | Gestor, via cancelamento com motivo |
| `CONCLUIDO` | — | Não reabre, não cancela |
| `CANCELADA` | — | Não muda |
| mesmo status | 409 | Evita histórico duplicado |

- `dataConclusao` é preenchida pelo servidor ao entrar em `CONCLUIDO`.
- Toda transição grava `StatusHistory` com autor e data.
- Cancelamento não preenche `dataConclusao`.
- Urgência é declarada pelo solicitante; prioridade é definida pelo Gestor.

## Telas e fluxos

### Lista (US013)

- Cabeçalho com título, contagem total e ações.
- Filtros: status, setor, tipo, período, responsável e "sem responsável".
- Tabela: protocolo/data, solicitante, bem, tipo, urgência, prioridade,
  responsável, status, ação.
- Paginação.
- Estado vazio com mensagem e botão "Limpar filtros".
- No celular, tabela vira cartões com `data-label`.
- Ação "Abrir" leva ao detalhe (quando US010 estiver disponível).

### Detalhe/ações (US014–US016/US012)

- Cabeçalho com protocolo, status, data, local, solicitante e bem.
- Bloco de ações do Gestor: prioridade, responsável e status.
- Bloco do Manutentor: status, se atribuído.
- Histórico/timeline com `StatusHistory`.
- Cancelamento com motivo, somente `EM_ABERTO`.
- Confirmações acessíveis e mensagens de erro/sucesso.

### Triagem (US019)

- Card no topo da lista (ou no painel US020) com a contagem de
  `EM_ABERTO` sem responsável.
- Botão "Ver fila" aplica `status=EM_ABERTO&semResponsavel=true`.
- Estado zero com mensagem.

### Relatório (US021)

- Filtros de período, setor, tipo e status.
- Indicadores: contagem por status, tempo médio até conclusão e top 5 bens.
- Período inválido não executa a consulta.
- Sem dados, mensagem informativa.

## Tarefas

### US013 — listagem e filtros

- T013.1 Contrato da API e validação Zod dos filtros.
- T013.2 Repositório com joins, filtros combinados, escopo e paginação.
- T013.3 Serviço/controller/rota `GET /api/solicitations`.
- T013.4 Índices e migration.
- T013.5 Testes de API.
- T013.6 Cliente web e tipos.
- T013.7 Tela de lista, filtros, paginação e estado vazio.
- T013.8 Navegação, acessibilidade e responsividade.
- T013.9 Testes web.

### US014 — status

- T014.1 Repositório transacional de mudança de status.
- T014.2 Serviço com máquina de estados e autorização.
- T014.3 Rota `PATCH /api/solicitations/:id/status`.
- T014.4 Testes de API.
- T014.5 Ações de status no detalhe.
- T014.6 Testes web.

### US015 — prioridade

- T015.1 Rota `PATCH /api/solicitations/:id/priority`.
- T015.2 Ordenação da fila por prioridade.
- T015.3 Controle de prioridade no detalhe.
- T015.4 Testes API/web.

### US016 — responsável

- T016.1 `User.especialidade` + migration.
- T016.2 Listagem de manutentores com ordenação por especialidade.
- T016.3 Repositório transacional de atribuição + `StatusHistory`.
- T016.4 Rota `PATCH /api/solicitations/:id/assignee`.
- T016.5 UI de atribuição e histórico.
- T016.6 Testes API/web.

### US012 — cancelamento

- T012.1 Repositório transacional de cancelamento.
- T012.2 Rota `POST /api/solicitations/:id/cancel`.
- T012.3 UI de cancelamento com motivo.
- T012.4 Testes API/web.

### US019 — triagem

- T019.1 Query de contagem.
- T019.2 Rota `GET /api/solicitations/triage-count`.
- T019.3 Card de triagem.
- T019.4 Testes API/web.

### US021 — relatório

- T021.1 Contrato compartilhado com US020.
- T021.2 Queries de agregação com filtros.
- T021.3 Rota `GET /api/reports/maintenance`.
- T021.4 UI de filtros e indicadores.
- T021.5 Testes API/web.

## Estratégia de testes

- API: Vitest, `createApp`, repositórios falsos, `fetch` nativo.
- Web: Vitest, jsdom, `fetch` stub.
- Cada critério de aceitação deve ter ao menos um teste de caminho feliz e um
  de caminho alternativo.
- Testar autorização por papel/escopo, validação, paginação, estado vazio,
  transições inválidas, período inválido e concorrência relevante.
- Smoke manual com PostgreSQL: migrations, login, lista, filtros, ações.

## Critérios de sucesso

- Gestor vê todas; Manutentor vê atribuídas; Cliente vê próprias.
- Filtros combinados funcionam e a paginação informa o total.
- Estado vazio é informativo, não uma tabela vazia.
- Status só muda por quem pode; histórico registra autor/data.
- Prioridade e urgência são distintas.
- Atribuição valida Manutentor ativo e registra histórico.
- Cancelamento só em `EM_ABERTO`, com motivo, sem apagar registro.
- Triagem conta `EM_ABERTO` sem responsável e diminui após atribuição.
- Relatório recalcula todos os indicadores com os filtros.
- Build e testes passam.

## Questões em aberto

- Quem implementa `GET /api/solicitations/:id` (US010) e em qual sprint?
- A especialidade será editável na tela de usuários ou apenas no seed nesta
  sprint?
- O painel US020 e os filtros US021 serão uma única tela?
- O protocolo visual `#CH-AAAA-0001` será apenas formatação de frontend?
