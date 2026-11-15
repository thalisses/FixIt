import { useEffect, useId, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";

const MAX_BYTES = 5_000_000;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  files: File[];
  onChange: Dispatch<SetStateAction<File[]>>;
  disabled: boolean;
}

export function SolicitationAttachmentPicker({ files, onChange, disabled }: Props) {
  const id = useId();
  const [errors, setErrors] = useState<string[]>([]);

  function select(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (disabled) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of chosen) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        rejected.push(`${file.name}: formato não permitido. Selecione JPEG, PNG ou WebP.`);
      } else if (file.size === 0) {
        rejected.push(`${file.name}: o arquivo está vazio.`);
      } else if (file.size > MAX_BYTES) {
        rejected.push(`${file.name}: excede o limite de 5 MB (5.000.000 bytes).`);
      } else if (files.length + accepted.length >= 5) {
        rejected.push(`${file.name}: o limite é de 5 imagens por solicitação.`);
      } else accepted.push(file);
    }
    setErrors(rejected);
    onChange((current) => [...current, ...accepted]);
  }

  function remove(file: File) {
    onChange((current) => current.filter((candidate) => candidate !== file));
  }

  return (
    <section className="solicitation-attachment-picker" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Fotos do problema <span className="field-help">(opcional)</span></h2>
      <label className="form-field" htmlFor={`${id}-files`}>Selecionar imagens</label>
      <input id={`${id}-files`} name="images" type="file" multiple accept="image/jpeg,image/png,image/webp"
        disabled={disabled} onChange={select} aria-describedby={`${id}-hint${errors.length ? ` ${id}-errors` : ""}`}
        aria-invalid={errors.length > 0} />
      <p className="field-help" id={`${id}-hint`}>Até 5 imagens JPEG, PNG ou WebP, com no máximo 5 MB (5.000.000 bytes) cada. Você pode criar o chamado sem fotos.</p>
      {errors.length > 0 && <ul className="form-error" id={`${id}-errors`} role="alert">
        {errors.map((message, index) => <li key={index}>{message}</li>)}
      </ul>}
      <p className="field-help" role="status">{files.length} de 5 imagens selecionadas.</p>
      {files.length > 0 && <ul className="solicitation-attachment-previews" aria-label="Imagens selecionadas">
        {files.map((file, index) => <li key={`${index}-${file.name}`}>
          <ImagePreview file={file} onInvalid={() => {
            if (disabled) return;
            remove(file);
            setErrors((current) => [...current, `${file.name}: não foi possível visualizar a imagem. Selecione um arquivo JPEG, PNG ou WebP válido.`]);
          }} />
          <span className="solicitation-attachment-name">{file.name}</span>
          <button className="text-action" type="button" disabled={disabled} aria-label={`Remover imagem ${file.name}`} onClick={() => remove(file)}>Remover</button>
        </li>)}
      </ul>}
    </section>
  );
}

function ImagePreview({ file, onInvalid }: { file: File; onInvalid(): void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img src={url} alt={`Pré-visualização de ${file.name}`} onError={onInvalid} width={144} height={108} /> : null;
}
