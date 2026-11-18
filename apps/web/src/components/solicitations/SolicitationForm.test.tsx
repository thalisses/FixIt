import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolicitationForm } from "./SolicitationForm";

let container: HTMLDivElement;
let root: Root;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
const created = {
  id: 7, data: "2026-11-14T12:00:00.000Z", local: "Bloco C",
  tipoProblema: "INFORMATICA", descricaoProblema: "Projetor não liga",
  urgencia: "ALTA", status: "EM_ABERTO", setorResponsavel: null,
  observacoes: null, prioridade: null, dataConclusao: null,
  solicitante: { id: "user-1", fullName: "Ana" }, responsavel: null, bem: null,
};
const json = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let sequence = 0;
  createObjectURL = vi.fn(() => `blob:preview-${++sequence}`);
  revokeObjectURL = vi.fn();
  const TestURL = class extends URL {};
  Object.assign(TestURL, { createObjectURL, revokeObjectURL });
  vi.stubGlobal("URL", TestURL);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<SolicitationForm onBack={() => {}} onRequestError={(error) => error instanceof Error ? error.message : "Erro de conexão"} />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function change(name: string, value: string) {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)!;
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype :
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function fill() {
  change("local", " Bloco C ");
  change("tipoProblema", "INFORMATICA");
  change("descricaoProblema", " Projetor não liga ");
  change("urgencia", "ALTA");
}
function submit() {
  container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function selectImages(files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  act(() => {
    Object.defineProperty(input, "files", { configurable: true, value: files });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const photo = (name = "problem.png", type = "image/png", size = 5) => new File([new Uint8Array(size)], name, { type });
function uploaded(files: File[]) {
  return json({ data: files.map((file, index) => ({
    id: `attachment-${index}`, nomeOriginal: file.name, mimeType: file.type, tamanhoBytes: file.size,
    criadoEm: "2026-11-15T12:00:00Z", contentUrl: `/api/solicitations/7/attachments/attachment-${index}/content`,
  })) });
}
async function clickRetry() {
  const button = Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === "Tentar enviar as imagens novamente")!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}

describe("US009 images in the existing creation form", () => {
  it.each([
    ["problem.jpg", "image/jpeg"], ["problem.png", "image/png"], ["problem.webp", "image/webp"],
  ])("selects and previews %s", (name, type) => {
    const file = photo(name, type);
    selectImages([file]);
    expect(createObjectURL).toHaveBeenCalledWith(file);
    const preview = container.querySelector("img")!;
    expect(preview.getAttribute("src")).toBe("blob:preview-1");
    expect(preview.getAttribute("alt")).toContain(name);
    expect(container.textContent).toContain(name);
    expect(container.textContent).toContain("1 de 5 imagens selecionadas");
  });

  it("removes images and releases every object URL on removal/unmount", () => {
    selectImages([photo("one.png"), photo("two.png")]);
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Remover imagem one.png"]')!.click());
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    act(() => root.render(<div />));
    const allocated = createObjectURL.mock.results.map((result) => result.value);
    expect(new Set(revokeObjectURL.mock.calls.map(([url]) => url))).toEqual(new Set(allocated));
  });

  it("rejects unsupported, empty and oversized files with clear messages", () => {
    selectImages([photo("document.txt", "text/plain"), photo("empty.png", "image/png", 0), photo("large.png", "image/png", 5_000_001)]);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(container.textContent).toContain("document.txt: formato não permitido");
    expect(container.textContent).toContain("empty.png: o arquivo está vazio");
    expect(container.textContent).toContain("large.png: excede o limite de 5 MB");
    expect(container.textContent).toContain("JPEG, PNG ou WebP");
  });

  it("accepts exactly 5,000,000 bytes", () => {
    selectImages([photo("limit.png", "image/png", 5_000_000)]);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("enforces five images across selections, freeing capacity on removal", () => {
    selectImages(Array.from({ length: 6 }, (_, i) => photo(`${i}.png`)));
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(container.textContent).toContain("5.png: o limite é de 5 imagens");
    selectImages([photo("extra.png")]);
    expect(container.querySelectorAll("img")).toHaveLength(5);
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Remover imagem 0.png"]')!.click());
    selectImages([photo("replacement.png")]);
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(container.textContent).toContain("replacement.png");
  });

  it("rejects a file when the browser cannot decode its preview", () => {
    selectImages([photo("corrupt.png")]);
    act(() => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.textContent).toContain("corrupt.png: não foi possível visualizar a imagem");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it("creates first, then uploads and confirms complete success", async () => {
    const files = [photo(), photo("other.webp", "image/webp")];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ data: { solicitation: created } })).mockResolvedValueOnce(uploaded(files));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    selectImages(files);
    await act(async () => submit());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/solicitations", "/api/solicitations/7/attachments"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ local: "Bloco C", tipoProblema: "INFORMATICA", descricaoProblema: "Projetor não liga", urgencia: "ALTA" });
    const upload = fetchMock.mock.calls[1][1]!;
    expect(upload.body).toBeInstanceOf(FormData);
    expect(new Headers(upload.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new Headers(upload.headers).has("Content-Type")).toBe(false);
    expect(container.textContent).toContain("2 imagens anexadas");
    expect(container.querySelector(".form-success")).not.toBeNull();
  });

  it("does not upload or discard images if creation fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { code: "VALIDATION_ERROR", message: "Local inválido.", fields: { local: "Local inválido." } } }, 422));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    selectImages([photo()]);
    await act(async () => submit());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector<HTMLInputElement>('[name="local"]')!.value).toBe(" Bloco C ");
  });

  it("keeps the created ID after a known upload failure and retries only the files", async () => {
    const file = photo();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { solicitation: created } }))
      .mockResolvedValueOnce(json({ error: { code: "ATTACHMENT_SAVE_FAILED", message: "Falha ao salvar imagens." } }, 500))
      .mockResolvedValueOnce(uploaded([file]));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    selectImages([file]);
    await act(async () => submit());
    expect(container.textContent).toContain("As imagens não foram salvas. A solicitação continua registrada.");
    expect(container.textContent).toContain("#CH-2026-0007");
    expect(container.querySelector(".form-success")).toBeNull();
    await clickRetry();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/solicitations", "/api/solicitations/7/attachments", "/api/solicitations/7/attachments"]);
    expect(container.textContent).toContain("1 imagem anexada");
  });

  it.each(["network", "uncertain", "invalid-response"])("retries %s outcomes with the same key, files and solicitation", async (failure) => {
    const files = [photo("one.png"), photo("two.png")];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ data: { solicitation: created } }));
    if (failure === "network") fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    else if (failure === "uncertain") fetchMock.mockResolvedValueOnce(json({ error: { code: "ATTACHMENT_UPLOAD_UNCERTAIN", message: "Resultado incerto." } }, 503));
    else fetchMock.mockResolvedValueOnce(json({ data: [] }));
    fetchMock.mockResolvedValueOnce(uploaded(files));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    selectImages(files);
    await act(async () => submit());
    expect(container.textContent).toContain("Não foi possível confirmar se as imagens foram salvas");
    expect(container.querySelector(".form-success")).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    await clickRetry();
    const attempts = fetchMock.mock.calls.filter(([url]) => url === "/api/solicitations/7/attachments");
    expect(attempts).toHaveLength(2);
    expect(new Headers(attempts[0][1]?.headers).get("Idempotency-Key")).toBe(new Headers(attempts[1][1]?.headers).get("Idempotency-Key"));
    const values = attempts.map(([, init]) => (init!.body as FormData).getAll("images").map((file) => ({ name: (file as File).name, size: (file as File).size, type: (file as File).type })));
    expect(values[1]).toEqual(values[0]);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/solicitations")).toHaveLength(1);
  });

  it.each([401, 403, 422])("preserves the created solicitation after HTTP %s", async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ data: { solicitation: created } }))
      .mockResolvedValueOnce(json({ error: { code: "REJECTED", message: "Não foi possível enviar.", fields: { images: "Revise o envio." } } }, status));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    selectImages([photo()]);
    await act(async () => submit());
    expect(container.textContent).toContain("A solicitação continua registrada");
    expect(container.textContent).toContain("Revise o envio.");
    expect(container.textContent).toContain("problem.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("blocks duplicate submissions and avoids early success while images are uploading", async () => {
    let resolveUpload!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ data: { solicitation: created } }))
      .mockImplementationOnce(() => new Promise<Response>((done) => { resolveUpload = done; }));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    selectImages([photo()]);
    await act(async () => { submit(); submit(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Enviando as imagens...");
    expect(container.querySelector(".form-success")).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).every((button) => button.disabled)).toBe(true);
    await act(async () => resolveUpload(uploaded([photo()])));
    expect(container.querySelector(".form-success")).not.toBeNull();
  });
});

describe("US007 creation form", () => {
  it("indicates all empty fields and rejects whitespace without sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    change("local", "   ");
    change("descricaoProblema", "   ");
    await act(async () => submit());
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(4);
    expect(document.activeElement).toBe(container.querySelector('[name="local"]'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only the four fields with the session and displays confirmation", async () => {
    const fetchMock = vi.fn(async () => json({ data: { solicitation: created } }));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    await act(async () => submit());
    expect(fetchMock).toHaveBeenCalledWith("/api/solicitations", {
      method: "POST", headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ local: "Bloco C", tipoProblema: "INFORMATICA", descricaoProblema: "Projetor não liga", urgencia: "ALTA" }),
    });
    expect(container.textContent).toContain("registrada com sucesso");
    expect(container.textContent).toContain("Em aberto");
    expect(container.textContent).toContain("Alta");
  });

  it("preserves values and shows API errors by field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: {
      code: "VALIDATION_ERROR", message: "Revise os dados.", fields: { local: "Local inválido." },
    } }, 422)));
    fill();
    await act(async () => submit());
    expect(container.querySelector<HTMLInputElement>('[name="local"]')!.value).toBe(" Bloco C ");
    expect(container.textContent).toContain("Local inválido.");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Revise os dados.");
  });

  it("blocks duplicate submissions while saving", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    fill();
    act(() => { submit(); submit(); });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    expect(container.textContent).toContain("Registrando...");
    await act(async () => resolve(json({ data: { solicitation: created } })));
  });
});

describe("US008 asset in the creation form", () => {
  const asset = { id: 3, codigoPatrimonial: "PAT-3", descricao: "Projetor Epson" };

  // Responde a busca de bens e a criação da solicitação conforme a URL.
  function stubApi(creation: () => Response) {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("/api/assets") ? json({ data: [asset] }, 200) : creation());
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function chooseAsset() {
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "PAT-3");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const search = Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === "Buscar")!;
    await act(async () => search.click());
    act(() => container.querySelector<HTMLButtonElement>(".solicitation-asset-results button")!.click());
  }

  it("sends the chosen asset and shows it in the confirmation (CA1)", async () => {
    const fetchMock = stubApi(() => json({ data: { solicitation: { ...created, bem: asset } } }));
    fill();
    await chooseAsset();
    await act(async () => submit());
    expect(fetchMock).toHaveBeenLastCalledWith("/api/solicitations", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        local: "Bloco C", tipoProblema: "INFORMATICA", descricaoProblema: "Projetor não liga",
        urgencia: "ALTA", bemId: 3,
      }),
    }));
    expect(container.textContent).toContain("registrada com sucesso");
    expect(container.textContent).toContain("Bem: PAT-3, Projetor Epson");
  });

  it("confirms a solicitation without an asset (CA2)", async () => {
    stubApi(() => json({ data: { solicitation: created } }));
    fill();
    await act(async () => submit());
    expect(container.textContent).toContain("Bem: não informado");
  });

  it("keeps the asset and shows the API error on it when the asset is refused", async () => {
    stubApi(() => json({ error: {
      code: "VALIDATION_ERROR", message: "Bem patrimonial não encontrado.",
      fields: { bemId: "Bem patrimonial não encontrado." },
    } }, 422));
    fill();
    await chooseAsset();
    await act(async () => submit());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Bem patrimonial não encontrado.");
    expect(container.querySelector(".solicitation-asset-picker .asset-field-error")?.textContent)
      .toBe("Bem patrimonial não encontrado.");
    expect(container.textContent).toContain("PAT-3 Projetor Epson");

    // Remover o bem limpa o erro que era dele.
    const remove = Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === "Remover")!;
    act(() => remove.click());
    expect(container.querySelector(".solicitation-asset-picker .asset-field-error")).toBeNull();
  });

  it("does not send the solicitation when Enter is pressed in the asset search", async () => {
    const fetchMock = stubApi(() => json({ data: { solicitation: created } }));
    fill();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "PAT-3");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(enter); });
    expect(enter.defaultPrevented).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/assets?busca=PAT-3"]);
    expect(container.textContent).not.toContain("registrada");
  });
});
