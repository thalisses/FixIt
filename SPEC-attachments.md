# Especificação: Anexar Evidência à Solicitação

**Status:** Proposta técnica para revisão do time; implementação pendente.

**Fonte:** história US009 e decisões técnicas fornecidas para esta etapa;
[SPEC-solicitations.md](./SPEC-solicitations.md),
[SPEC-authentication.md](./SPEC-authentication.md) e
[SPEC-local-stack.md](./SPEC-local-stack.md).

## Objetivo

Como solicitante, quero anexar uma foto do problema para que o manutentor
entenda a situação antes de se deslocar e não precise de uma segunda visita
só para diagnosticar.

Permitir selecionar imagens durante o preenchimento da solicitação, visualizar
miniaturas e enviá-las após a criação do chamado. Uma falha nos anexos não
deve desfazer a solicitação nem seu registro inicial no histórico.

## Critérios de aceitação

- **CA1:** O solicitante pode selecionar uma ou mais imagens e visualizar
  miniaturas antes do envio.
- **CA2:** Arquivos que não sejam imagens ou que ultrapassem o limite permitido
  devem ser recusados com uma explicação clara.
- **CA3:** Se houver falha ao salvar os anexos, a solicitação deve ser registrada
  normalmente e o usuário deve ser informado da falha.

## Escopo incluído

- Seleção múltipla opcional, pré-visualização e remoção antes do envio.
- Validação de formato, tamanho e quantidade no navegador e na API.
- Upload separado, com autenticação e proteção CSRF existentes.
- Armazenamento local em volume persistente do Docker.
- Confirmação integral de cada lote e reenvio ao mesmo chamado após falha.
- Consulta protegida de metadados e conteúdo para integração com a US010.

## Fora do escopo

- Anexos obrigatórios, vídeos, documentos, SVG, GIF e HEIC.
- Armazenamento em nuvem, edição de imagens e geração de miniaturas no servidor.
- Exclusão ou substituição de anexos já confirmados por meio de interface pública.
- Mudanças de status, prioridade, atribuição ou regras gerais de consulta.
- Registro de um novo tipo de evento em `StatusHistory`.

## Formatos e limites

| Regra | Contrato proposto |
|---|---|
| JPEG | `image/jpeg`, extensões `.jpg` e `.jpeg` |
| PNG | `image/png`, extensão `.png` |
| WebP | `image/webp`, extensão `.webp` |
| Tamanho por imagem | Até 5 MB, inclusive |
| Convenção de unidade | Nesta proposta, 1 MB = 1.000.000 bytes; máximo de 5.000.000 bytes por imagem |
| Quantidade por solicitação | Até 5 imagens confirmadas, somadas às novas imagens do lote |
| Quantidade por upload | De 1 a 5 imagens, respeitando a capacidade restante do chamado |
| Soma máxima dos arquivos de um lote | 25.000.000 bytes; o limite do corpo multipart deve considerar também seu overhead |
| Imagens na criação | Opcionais; solicitação sem imagem continua válida |

A convenção de bytes torna o limite verificável e deve ser refletida nas
mensagens e testes. O limite total de transporte multipart e os limites de
campos/cabeçalhos serão definidos ao escolher o parser, sem reduzir os limites
de arquivos válidos acima.

O navegador deve informar formatos, tamanho máximo e quantidade disponível.
Arquivos recusados recebem mensagem com nome e motivo, por exemplo:
"foto.jpg excede o limite de 5 MB". A seleção de arquivos válidos pode continuar;
o usuário deve saber quais arquivos não entraram no conjunto a enviar.

`accept` e MIME informado pelo navegador são apenas auxílio. A API deve validar
os bytes e a integridade da imagem, aceitar somente os formatos permitidos e
aplicar limites durante a leitura. Renomear um arquivo não o torna válido.
Uma imagem inválida enviada diretamente à API invalida todo o lote recebido.

## Fluxo de criação e upload

1. O usuário autenticado preenche os quatro campos da US007 e, opcionalmente,
   seleciona imagens. O frontend mantém `File` e URLs de pré-visualização apenas
   em memória; libera as URLs ao remover arquivos ou desmontar o componente.
2. O frontend valida o formulário e os arquivos selecionados, exibe erros e
   permite revisar as miniaturas antes de enviar.
3. Envia somente os quatro campos para `POST /api/solicitations`, como hoje.
4. A API cria `Solicitation` e `StatusHistory.ABERTURA` na mesma transação,
   preservando o contrato da US007. Se a criação falhar, não inicia o upload.
5. Após HTTP 201, o frontend guarda o ID do chamado criado. Se houver imagens,
   envia um `FormData` para o endpoint de anexos desse ID. O navegador define
   o cabeçalho multipart com seu delimitador; não usar JSON/base64.
6. A API verifica sessão, origem e propriedade do chamado antes de armazenar
   arquivos. Valida e prepara o lote inteiro antes de confirmá-lo.
7. O frontend apresenta sucesso completo ou confirma o chamado com um aviso
   específico de falha nos anexos. Bloqueia envios duplicados durante as duas
   fases e distingue "Registrando solicitação" de "Enviando imagens".

## Comportamento em caso de falha

### Separação da solicitação e dos anexos

O upload ocorre depois do commit da US007 e usa operação independente.
Erros de validação, disco, metadados, sessão ou rede nessa fase nunca provocam
exclusão ou rollback da solicitação e de `ABERTURA`.

Exemplo de mensagem quando a falha é conhecida:
"Solicitação registrada. As imagens não foram salvas. Tente enviar novamente."
A confirmação deve manter o protocolo e permitir voltar à listagem.

### Lote integral

- Se qualquer imagem falhar na validação ou gravação, nenhuma imagem nova do
  lote deve ficar confirmada ou disponível para leitura.
- Anexos confirmados em lotes anteriores permanecem intactos.
- Metadados do lote são confirmados em uma única transação PostgreSQL.
- Arquivos são preparados em área temporária e movidos para o destino antes
  de confirmar os metadados. A leitura depende dos metadados confirmados.
- Se a gravação dos arquivos ou o commit dos metadados falhar, reverter os
  metadados e remover somente os arquivos novos desse lote.
- Filesystem e PostgreSQL não compartilham uma transação ACID. Falhas de limpeza
  ou interrupção do processo exigem reconciliação de temporários e arquivos
  órfãos; a rotina não pode remover arquivos de uploads ainda em andamento ou
  anexos confirmados. O mecanismo e prazo de limpeza precisam ser definidos
  na implementação do armazenamento.
- Serializar a verificação da capacidade e confirmação por solicitação, para
  impedir que uploads concorrentes ultrapassem 5 imagens no total. O lock pode
  reutilizar a linha de `Solicitation`, sem alterar seus dados de negócio.

### Reenvio e resposta perdida

Permitir reenviar ao mesmo ID; nunca repetir `POST /api/solicitations` para
recuperar falha de anexos. Preservar os arquivos selecionados enquanto o
formulário permanece montado e informar que recarregar a página perde essa
seleção local.

Uma falha de rede pode ocorrer depois de o servidor ter confirmado os anexos.
Nesse caso, informar que não foi possível confirmar o resultado, em vez de
afirmar que nada foi salvo. Antes de reenviar, reconciliar o resultado com a API.
O contrato de identificação/idempotência do lote deverá ser fechado antes de
implementar o reenvio automático, para evitar duplicatas e consumo indevido
do limite de cinco imagens.

## Modelo de dados proposto

Nova entidade `SolicitationAttachment`, tabela `solicitation_attachments`:

| Campo | Tipo proposto | Regra |
|---|---|---|
| `id` | UUID | Gerado pelo servidor |
| `solicitacaoId` | integer | FK obrigatória para `Solicitation.id`, com índice |
| `autorId` | UUID | FK obrigatória para `User.id`, obtida da sessão |
| `nomeOriginal` | texto | Nome para apresentação, nunca usado como caminho |
| `mimeType` | texto | Tipo validado: JPEG, PNG ou WebP |
| `tamanhoBytes` | integer | Positivo e limitado a 5.000.000 bytes |
| `storageKey` | texto único | Identificador interno gerado pelo servidor |
| `criadoEm` | timestamptz | Gerado pelo servidor |

Uma solicitação tem zero a cinco anexos confirmados. Não armazenar bytes,
base64, caminhos absolutos ou URLs públicas em `Solicitation`. A nova tabela
deverá ser criada por migration explícita, mantendo `synchronize: false`.
Não alterar a entidade `StatusHistory` para representar anexos.

Campos adicionais para rastrear lotes dependerão da decisão de idempotência.

## Endpoints propostos

| Método | Caminho | Acesso e resultado |
|---|---|---|
| `POST` | `/api/solicitations/:id/attachments` | Solicitante autenticado; multipart com campo repetido `images`; HTTP 201 somente após confirmação integral do lote |
| `GET` | `/api/solicitations/:id/attachments` | Autorização de consulta da solicitação; HTTP 200 com lista de metadados, vazia quando não houver anexos |
| `GET` | `/api/solicitations/:id/attachments/:attachmentId/content` | Mesma autorização; retorna bytes com MIME validado |

Exemplo de metadados públicos na resposta de envio/listagem:

```json
{
  "data": [
    {
      "id": "uuid",
      "nomeOriginal": "problema.jpg",
      "mimeType": "image/jpeg",
      "tamanhoBytes": 1200000,
      "criadoEm": "2026-11-14T12:00:00.000Z",
      "contentUrl": "/api/solicitations/1/attachments/uuid/content"
    }
  ]
}
```

`contentUrl` é derivada pela API e continua protegida por sessão. Não retornar
`storageKey`, caminhos físicos ou dados pessoais desnecessários. O endpoint de
conteúdo deve confirmar que o anexo pertence ao `:id`, além da autorização.
Não publicar o diretório via rota estática sem controle de acesso; evitar cache
público e servir conteúdo com `X-Content-Type-Options: nosniff`.

Erros JSON seguem `{ "error": { "code", "message", "fields"? } }`, conforme
as rotas existentes. Para arquivos, identificar também o nome/índice recusado
na mensagem ou no detalhamento por campo.

| HTTP | Código proposto | Situação |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Sessão ausente ou inválida |
| 403 | `ORIGIN_NOT_ALLOWED` | Origem ausente ou não permitida no upload |
| 403 | `FORBIDDEN` | Sem propriedade para upload ou sem acesso para leitura |
| 404 | `SOLICITATION_NOT_FOUND` | Solicitação inexistente |
| 404 | `ATTACHMENT_NOT_FOUND` | Anexo inexistente ou sem vínculo com o chamado consultado |
| 422 | `VALIDATION_ERROR` | Formato/conteúdo inválido, lote vazio ou quantidade excedida |
| 413 | `ATTACHMENT_TOO_LARGE` | Limite de tamanho excedido |
| 500 | `ATTACHMENT_SAVE_FAILED` | Falha ao salvar o lote; não altera a solicitação |

## Regras de autorização

| Operação | Cliente | Manutentor | Gestor |
|---|---|---|---|
| Enviar/reenviar | Somente se solicitante | Somente se solicitante | Somente se solicitante |
| Listar/ler imagens | Solicitações próprias | Solicitações atribuídas | Todas |

A API aplica as regras; controles escondidos no frontend não bastam.
O autor e o vínculo com o chamado não são aceitos livremente no corpo.
O ID da rota identifica o chamado e o servidor verifica seu proprietário.

Upload não pode exigir exclusivamente `request:read`: um Manutentor pode criar
um chamado que ainda não lhe foi atribuído e, mesmo assim, deve conseguir anexar
as evidências como solicitante. Sua leitura posterior continua obedecendo à
matriz existente. Ações novas podem ter políticas específicas reutilizáveis,
sem ampliar as permissões gerais de consulta.

Não introduzir restrição por status sem decisão explícita de produto.

## Estratégia de armazenamento persistente

- Montar um volume nomeado, por exemplo `attachment_data`, no serviço `api`, em
  um diretório configurável, por exemplo `/app/uploads` com `UPLOAD_DIR`.
- Manter temporários e arquivos finais dentro do volume, em subdiretórios
  separados, sem depender da camada gravável do container.
- Gerar nomes internos aleatórios e validar caminhos dentro da raiz configurada.
  Nomes fornecidos pelo usuário nunca determinam o destino de gravação.
- Criar uma interface de armazenamento injetável, com implementação local e
  substitutos de teste para simular escrita, movimentação e remoção com falha.
- Recriar/reiniciar o container e executar `docker compose down` deve preservar
  arquivos, assim como o volume PostgreSQL. Não apagar volumes no fluxo normal.
- Backup e restauração precisam abranger tanto metadados PostgreSQL como volume
  de arquivos. O desenho inicial assume uma API com acesso a esse volume local.

Alterações futuras envolvem `docker-compose.yml`, `.env.example`, configuração
da API e documentação operacional; esta etapa não altera esses arquivos.

## Integração futura com a US010

Adicionar uma seção independente de anexos em `SolicitationDetail`, com
miniaturas e abertura da imagem. Consultar os endpoints protegidos usando a
sessão existente; falha na galeria não impede visualizar os dados do chamado.

Apresentar carregamento, ausência de imagens e erro com nova tentativa.
Fornecer nomes/textos alternativos, foco e controles acessíveis, e layout
responsivo. Evidências seguem a consulta do chamado e não a permissão mais
restrita da timeline de `StatusHistory`, que atualmente exclui Clientes.

## Casos de teste necessários

Usar Vitest e os padrões existentes: `createApp` e `fetch` na API, jsdom e APIs
DOM no web, dependências de armazenamento injetáveis.

| Área | Casos mínimos |
|---|---|
| CA1 | Uma e várias imagens; miniaturas antes do envio; remoção; liberação de URLs temporárias; criação sem imagem |
| CA2 | JPEG/PNG/WebP válidos; formato recusado; extensão/MIME falsificados; conteúdo corrompido; tamanho exatamente no limite e um byte acima; lote vazio; seis imagens; capacidade restante |
| CA3 | Falha de armazenamento e de metadados depois da criação; chamado e `ABERTURA` permanecem; aviso claro com protocolo; nenhuma confirmação parcial do lote |
| Lote | Falha na segunda imagem após preparar a primeira; remoção dos novos arquivos; preservação dos anexos anteriores; falha na limpeza e reconciliação |
| Reenvio | Mesmo chamado, sem duplicar solicitação; arquivos preservados na tela; reconciliação após resposta perdida e idempotência conforme contrato final |
| Autorização | Upload próprio pelos três perfis; bloqueio de outro solicitante; sessão inválida; CSRF; leitura própria/atribuída/Gestor; troca de IDs do chamado e anexo |
| Concorrência | Dois uploads simultâneos não ultrapassam cinco imagens confirmadas |
| US010 | Galeria autorizada, vazia, erro e nova tentativa; falha da galeria não esconde o detalhe |
| Persistência | Arquivos permanecem após recriação do container e correspondem aos metadados |
| Regressão | Criação, validação, listagem, detalhe e histórico existentes continuam funcionando |

Mocks comprovam a ordem das operações, o gerenciador transacional usado e a
propagação de falhas; não comprovam commit/rollback PostgreSQL ou persistência
do volume. Esses comportamentos exigem testes de integração com PostgreSQL e
filesystem reais em ambiente isolado, além da verificação com Docker.

## Ordem de implementação

1. Revisar esta especificação e fechar os detalhes pendentes abaixo.
2. Criar entidade/migration e repositório de metadados.
3. Implementar armazenamento local, validação multipart e compensação de falhas.
4. Implementar envio/listagem/leitura protegidos e testes da API.
5. Implementar seleção e miniaturas, com testes web.
6. Integrar criação seguida de upload, aviso de falha e reenvio ao mesmo chamado.
7. Integrar galeria na US010 e validar armazenamento persistente e regressões.

## Questões em aberto para implementação

- Selecionar o parser multipart, respeitando os limites e a stack do projeto.
- Fechar limite de transporte e tratamento de erros do parser.
- Definir identificação/idempotência do lote para reconciliar respostas perdidas.
- Definir mecanismo e prazo de limpeza de temporários/órfãos, distinguindo lotes
  ativos e confirmados, inclusive após interrupção do processo.

## Decisões da Etapa 3 — infraestrutura

- Validação com `sharp`: assinatura permitida, identificação do formato e
  decodificação completa com `failOn: "warning"`, incluindo quadros de animação.
  Referência: [construtor do sharp](https://sharp.pixelplumbing.com/api-constructor/).
- Limite técnico adicional de 40.000.000 pixels totais decodificados por imagem,
  além de 5.000.000 bytes. Arquivo original preservado.
- Operações por arquivo `prepare`, `confirm`, `read`, `remove`, UUID-v4 interno,
  diretórios `temporary`/`permanent` na raiz configurável `UPLOAD_DIR`.
  Confirmação por hard link exclusivo seguido de remoção do temporário; requer
  suporte a hard links no filesystem do volume.
- Volume `attachment_data` montado em `/app/uploads`. Nenhuma publicação pública
  ou alteração da US007; autorização e confirmação integral do lote serão
  responsabilidade do serviço futuro.
- Limpeza automática não implementada. O [README](./README.md) propõe inventário
  sem remoção, janela de segurança a aprovar, coordenação com uploads ativos e
  rechecagem de referências. Idempotência continua pendente.

## Critérios de sucesso

- CA1, CA2 e CA3 atendidos com mensagens acessíveis e comportamento responsivo.
- Somente o solicitante envia; leitura respeita o escopo da solicitação.
- Lotes não ficam parcialmente confirmados e o limite total é preservado.
- Falhas de anexos não desfazem a US007 e permitem recuperar o envio ao mesmo ID.
- Arquivos persistem no volume e não são publicados sem autorização.
- Testes e builds da API e do web passam, com as limitações de integração
  explicitadas no relatório de verificação.
