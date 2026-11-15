import { useEffect, useId, useRef, useState } from "react";
import {
  getSolicitationAttachmentContent,
  listSolicitationAttachments,
  SolicitationApiError,
  type SolicitationAttachmentMetadata,
} from "../../lib/solicitationApi";

export function SolicitationAttachments({ solicitationId }: { solicitationId: number }) {
  // Reinicia também o estado visual imediatamente quando o chamado muda.
  return <AttachmentGallery key={solicitationId} solicitationId={solicitationId} />;
}

function message(error: unknown, fallback: string) {
  return error instanceof SolicitationApiError ? error.message : fallback;
}

function AttachmentGallery({ solicitationId }: { solicitationId: number }) {
  const titleId = useId();
  const [attempt, setAttempt] = useState(0);
  const [attachments, setAttachments] = useState<SolicitationAttachmentMetadata[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setAttachments(null);
    setError("");
    void listSolicitationAttachments(solicitationId, controller.signal).then((entries) => {
      if (!controller.signal.aborted) setAttachments(entries);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(message(cause, "Não foi possível carregar os anexos. Tente novamente."));
    });
    return () => controller.abort();
  }, [solicitationId, attempt]);

  return <section className="asset-card solicitation-attachments" aria-labelledby={titleId}>
    <h2 id={titleId}>Anexos</h2>
    {!attachments && !error && <p role="status">Carregando anexos...</p>}
    {error && <div><p className="form-error" role="alert">{error}</p>
      <button className="text-action" type="button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button>
    </div>}
    {attachments?.length === 0 && <p role="status">Esta solicitação não possui anexos.</p>}
    {attachments && attachments.length > 0 && <ul className="solicitation-attachments-grid" aria-label="Imagens da solicitação">
      {attachments.map((attachment) => <AttachmentImage key={attachment.id} solicitationId={solicitationId} attachment={attachment} />)}
    </ul>}
  </section>;
}

function AttachmentImage({ solicitationId, attachment }: {
  solicitationId: number;
  attachment: SolicitationAttachmentMetadata;
}) {
  const [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const objectUrl = useRef("");

  function releaseUrl() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
  }

  useEffect(() => {
    const controller = new AbortController();
    setUrl("");
    setError("");
    void getSolicitationAttachmentContent(solicitationId, attachment.id, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl.current = URL.createObjectURL(blob);
      setUrl(objectUrl.current);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(message(cause, "Não foi possível carregar a imagem."));
    });
    return () => { controller.abort(); releaseUrl(); };
  }, [solicitationId, attachment.id, attempt]);

  return <li>
    <p className="solicitation-attachment-name">{attachment.nomeOriginal}</p>
    {!url && !error && <p role="status">Carregando imagem...</p>}
    {url && !error && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Visualizar ${attachment.nomeOriginal} em tamanho maior (abre em nova aba)`}>
      <img src={url} alt={`Evidência: ${attachment.nomeOriginal}`} width={240} height={180} onError={() => {
        releaseUrl(); setUrl(""); setError("Não foi possível visualizar a imagem.");
      }} />
      <span>Visualizar imagem em tamanho maior</span>
    </a>}
    {error && <div><p className="form-error" role="alert">{attachment.nomeOriginal}: {error}</p>
      <button className="text-action" type="button" aria-label={`Tentar novamente: ${attachment.nomeOriginal}`} onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button>
    </div>}
  </li>;
}
