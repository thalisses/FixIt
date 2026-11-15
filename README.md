# FixIt

Base executável do sistema de manutenção patrimonial FixIt.

## Pré-requisitos

- Docker com Docker Compose v2.
- Node.js `20.19+`, `22.12+` ou `24+` para executar scripts diretamente no host.
- Portas `5173`, `3000` e `5432` disponíveis.

## Iniciar com Docker Compose

```sh
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:3000
- API ativa: http://localhost:3000/health/live
- API e banco prontos: http://localhost:3000/health/ready
- PostgreSQL local: `localhost:5432`

O Compose aguarda o PostgreSQL ficar saudável antes de iniciar a API, e o frontend aguarda a API. Os dados do banco ficam em um volume nomeado e são mantidos por `docker compose down`.

As credenciais do `.env.example` são exclusivas para desenvolvimento local. Não use esses valores em produção, não versiona o `.env` e nunca coloque credenciais no frontend.

## Desenvolvimento e verificações

Instale as dependências na raiz:

```sh
npm ci
```

Build de todos os workspaces:

```sh
npm run build
```

Testes de todos os workspaces:

```sh
npm test
```

Para executar o frontend no host, use `npm run dev:web`. Para executar a API no host enquanto o PostgreSQL do Compose está ativo:

```sh
DATABASE_URL=postgresql://fixit:fixit_local_only@localhost:5432/fixit npm run dev:api
```

Para encerrar os containers sem apagar os dados:

```sh
docker compose down
```

## Autenticação e perfis

O cadastro público cria uma conta ativa de Cliente. A instituição é obrigatória
e, no ambiente inicial, corresponde à Universidade Estadual de Maringá (UEM).
O login cria uma sessão opaca armazenada no servidor; o cookie é `HttpOnly`,
`SameSite=Lax` e recebe `Secure` em produção.

A API aplica os perfis Cliente, Manutentor e Gestor. Gestores podem listar
usuários e alterar perfis; a interface confirma a alteração e a API impede
rebaixar o último Gestor ativo. As políticas de solicitação, ativo e relatório
estão prontas para serem aplicadas quando esses módulos de domínio forem
implementados.

Ao promover um usuário a Manutentor, o Gestor deve escolher uma especialidade:
Elétrica, Hidráulica, Informática, Estrutural ou Outros. Especialidades podem
ser alteradas posteriormente e são removidas quando o perfil deixa de ser
Manutentor. Manutentores já cadastrados sem especialidade continuam válidos.
Na atribuição de uma solicitação, todos os Manutentores ativos são exibidos,
com os que correspondem ao tipo do problema priorizados.

Para provisionar o primeiro Gestor, cadastre uma conta pela interface e execute
o comando abaixo em um terminal interativo. Ele solicita uma senha sem exibi-la
e só pode ser usado enquanto não houver Gestor ativo:

```sh
docker compose exec api npm run db:provision-manager --workspace @fixit/api -- gestor@uem.br
```

O comando usa a conexão configurada no container da API e solicita uma senha
sem eco. Para aplicar migrations manualmente no Compose:

```sh
docker compose exec api npm run db:migrate --workspace @fixit/api
```

A API também aplica migrations antes de aceitar requisições. Em produção,
configure `WEB_ORIGIN` com a origem HTTPS real e termine TLS na infraestrutura
de implantação.

## Migrations

A API aplica as migrations pendentes ao subir. Depois de atualizar a `main`, basta rodar `docker compose up --build`.

Para criar uma migration, altere a entidade em `apps/api/src/entities`, deixe o PostgreSQL do Compose ativo e, com o `.env` criado, gere o arquivo:

```sh
npm run migration:generate --workspace @fixit/api -- src/migrations/NomeDaMudanca
```

Confira o arquivo gerado e registre a entidade, se for nova, e a migration em `apps/api/src/config/database.ts`.

**Atenção:** hoje as entidades `User` e `AuthSession` não declaram algumas restrições criadas na migration de autenticação, então o comando gerado também propõe removê-las. Apague do arquivo tudo o que não for da sua mudança antes de fazer o commit.

Para desfazer a última migration aplicada:

```sh
npm run migration:revert --workspace @fixit/api
```

Migration que já entrou na `main` não deve ser editada: crie outra para corrigir.

## Armazenamento de evidências (US009)

`AttachmentStorage` e sua implementação local estão em `apps/api/src/storage`.
O formulário permite selecionar imagens, visualizar miniaturas e remover itens
antes do envio. Primeiro cria a solicitação pelo fluxo da US007 e depois envia
os anexos separadamente. Se o upload falhar, o chamado continua registrado e a
interface permite reenviar o mesmo lote para a mesma solicitação.

Os endpoints exigem sessão autenticada:

| Método | Endpoint | Comportamento |
| --- | --- | --- |
| `POST` | `/api/solicitations/:id/attachments` | Upload multipart, campo repetido `images` e cabeçalho UUID `Idempotency-Key`; exige CSRF e propriedade da solicitação |
| `GET` | `/api/solicitations/:id/attachments` | Lista metadados públicos, respeitando a autorização de consulta da solicitação |
| `GET` | `/api/solicitations/:id/attachments/:attachmentId/content` | Retorna os bytes com MIME validado, verificando autorização e vínculo com a solicitação |

Não há diretório estático ou URL pública para as imagens. Chaves de armazenamento
e caminhos internos não são expostos. Os metadados e os lotes de idempotência
ficam no PostgreSQL; os bytes das imagens ficam no filesystem, fora do banco.

`UPLOAD_DIR` define a raiz absoluta. No host, se omitida fora de produção, o
padrão é `uploads` no diretório de trabalho do processo (normalmente
`apps/api/uploads` ao executar pelo workspace). Em produção a variável é
obrigatória. Valores relativos, vazios ou com byte nulo são rejeitados.
Exemplo PowerShell para execução no host:

```powershell
$env:UPLOAD_DIR = "C:/Users/Sophia/FixIt/uploads"
npm.cmd run dev:api
```

No Compose a variável é `/app/uploads`, com o volume nomeado `attachment_data`
montado nesse caminho. Host e container usam armazenamentos distintos.
`docker compose down` preserva o volume. Para incorporar a configuração e as
dependências, use `docker compose up --build api`, sem remover volumes.
O processo precisa de escrita na raiz; temporários e definitivos devem estar
no mesmo filesystem, com suporte a hard links.

```text
UPLOAD_DIR/
  temporary/<UUID-v4>
  permanent/<UUID-v4>
```

- `prepare(bytes)` valida e grava exclusivamente um temporário com UUID
  aleatório, sem receber nome do usuário. Retorna chave, MIME e tamanho.
- `confirm(key)` publica por hard link exclusivo e remove o temporário, sem
  sobrescrever destinos. A leitura pela API depende dos metadados confirmados
  pelo serviço de anexos.
- `read(key)` lê somente definitivos; o chamador deve autorizar previamente.
- `remove(key)` remove os dois locais da chave para compensação. Ausências são
  toleradas; falhas preservam operação, chave e causa. Se a remoção do temporário
  falhar após a publicação, os dois locais podem existir e devem ser compensados.

A validação usa `sharp`: identifica JPEG, PNG ou WebP pelo conteúdo e decodifica
os pixels com `failOn: "warning"`, incluindo quadros de animação. O upload aceita
de uma a cinco imagens por lote, com máximo total de cinco imagens confirmadas
por solicitação. Cada arquivo pode ter até 5.000.000 bytes e 40.000.000 pixels
totais. Os bytes originais são preservados, sem conversão ou miniaturas físicas.
`busboy` processa o multipart com limites de tamanho e quantidade durante a
leitura, evitando carregar arquivos ilimitados em memória; `@types/busboy` é
uma dependência de desenvolvimento para os tipos TypeScript.
Execute `npm ci` no ambiente de destino; não copie `node_modules` do Windows
para Linux, pois há binários específicos de plataforma.

A raiz deve ser exclusiva da API e não modificável por usuários externos. A
implementação rejeita chaves fora do padrão UUID-v4, symlinks e diretórios
internos fora da raiz canônica. Não é uma sandbox contra administrador local
alterando caminhos simultaneamente. `uploads/` é ignorado no Git e no contexto
Docker; para outro nome de diretório local, acrescente sua regra de exclusão.
Não use pasta pública do frontend. Backups devem abranger metadados PostgreSQL
e volume de arquivos em conjunto.

### Coordenação transacional e idempotência

O serviço prepara e confirma os arquivos e registra os metadados e o lote em
uma transação TypeORM. Um bloqueio na solicitação serializa uploads concorrentes
e protege a verificação do limite total de cinco imagens. A consulta de
idempotência acontece antes da verificação de capacidade.

A mesma chave UUID, na mesma solicitação e para o mesmo autor, com o mesmo
conteúdo retorna os anexos confirmados sem duplicação. Reutilizar a chave com
conteúdo diferente gera conflito. O frontend preserva a chave e o conjunto de
arquivos nas novas tentativas enquanto a tela permanece aberta.

Filesystem e PostgreSQL não compartilham uma transação atômica. Se houver falha,
os metadados são revertidos e o serviço tenta compensar os arquivos novos do
lote, preservando anexos anteriores, a solicitação e seu evento `ABERTURA`.
Falhas de compensação são reportadas. Em caso de commit incerto, o serviço tenta
reconciliar o resultado no banco; se não puder determinar se houve confirmação,
preserva os arquivos e informa resultado incerto (HTTP 503). O reenvio deve usar
a mesma chave e o mesmo conteúdo.

### Plano de limpeza — proposta, sem execução automática

Não há varredura ou remoção automática de órfãos. Apenas o arquivo criado pela
própria operação pode ser compensado após falha; `remove` exige uma chave explícita.

Plano para revisão antes de implementar manutenção:

1. Inventariar arquivos e referências no banco em modo somente leitura.
2. Aprovar uma janela de segurança (proposta: 24 horas), duração máxima de upload
   e mecanismo de identificação de operações ativas. Idade isolada não comprova
   que um arquivo é órfão.
3. Coordenar limpeza e uploads com lock/registro de atividade. Sem esse mecanismo,
   executar manutenção apenas com uploads suspensos e sem operações em andamento.
4. Rechecar referências e atividade sob essa coordenação antes de remover; nunca
   remover arquivo referenciado ou de upload ativo.
5. Somente após aprovação, implementar remoção das chaves elegíveis com relatório
   e possibilidade de recuperação a partir de backup.

Verificações focadas:

```sh
npm test --workspace @fixit/api -- src/storage/localAttachmentStorage.test.ts src/validators/attachmentImageValidator.test.ts src/config/env.test.ts
npm run build --workspace @fixit/api
docker compose config --quiet
```

Os testes de armazenamento usam filesystem real em diretórios temporários
exclusivos e falhas injetadas. Não removem dados de desenvolvimento.

Os testes com PostgreSQL e volume Docker reais dependem de um runner separado;
não são executados pelo `npm test` padrão. Com Docker ativo e autorização para
criar recursos temporários, execute na raiz:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-attachments-postgres.ps1
```

O runner usa `docker-compose.attachments-test.yml` com projeto aleatório, banco
e volumes isolados, sem portas publicadas, volumes externos ou bind mounts.
A fase de escrita exige banco vazio e aplica as migrations somente nesse banco
de teste. A fase de leitura recria o container da API de teste e verifica os
metadados e bytes preservados. Os recursos são mantidos para inspeção; o runner
não remove volumes nem usa o banco de desenvolvimento.

Consulte [o README de integração](apps/api/src/integration/README.md) para os
detalhes de isolamento, fases, recursos preservados e limitações. A integração
não simula perda de energia nem queda de conexão durante um commit real; a
reconciliação de commit incerto é coberta pelos testes unitários.

## Escopo atual

Esta fundação contém cadastro, login, sessões, autorização por perfil,
administração de usuários e provisionamento controlado do primeiro Gestor. As
rotas de solicitações, ativos e relatórios ainda não foram implementadas.

O mapa de capacidades e as especificações aprovadas estão em [CAPABILITY-MAP.md](CAPABILITY-MAP.md) e nos arquivos `SPEC-*.md`.
