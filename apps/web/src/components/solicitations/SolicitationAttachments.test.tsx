import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSolicitationAttachmentContent, listSolicitationAttachments, SolicitationApiError, type SolicitationAttachmentMetadata } from "../../lib/solicitationApi";
import { SolicitationAttachments } from "./SolicitationAttachments";

vi.mock("../../lib/solicitationApi", async (original) => ({
  ...await original<typeof import("../../lib/solicitationApi")>(),
  listSolicitationAttachments: vi.fn(),
  getSolicitationAttachmentContent: vi.fn(),
}));

const list = vi.mocked(listSolicitationAttachments);
const content = vi.mocked(getSolicitationAttachmentContent);
const first: SolicitationAttachmentMetadata = {
  id: "image-1", nomeOriginal: "problema.png", mimeType: "image/png", tamanhoBytes: 4,
  criadoEm: "2026-11-15T12:00:00Z", contentUrl: "/not-used",
};
const second = { ...first, id: "image-2", nomeOriginal: "local.webp" };
let container: HTMLDivElement;
let root: Root;
const createUrl = vi.fn();
const revokeUrl = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function render(id = 7) {
  await act(async () => { root.render(<SolicitationAttachments solicitationId={id} />); });
}

async function retry(label = "Tentar novamente") {
  const button = Array.from(container.querySelectorAll("button")).find((entry) =>
    (entry.getAttribute("aria-label") ?? entry.textContent) === label,
  );
  expect(button).toBeTruthy();
  await act(async () => { button!.click(); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  let nextUrl = 0;
  createUrl.mockImplementation(() => `blob:test-${++nextUrl}`);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = createUrl;
    static revokeObjectURL = revokeUrl;
  });
  list.mockResolvedValue([first]);
  content.mockResolvedValue(new Blob(["data"], { type: "image/png" }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("SolicitationAttachments", () => {
  it.each([[first], [first, second]])("shows thumbnails, filenames and protected-content previews: %j", async (...entries) => {
    list.mockResolvedValue(entries);
    await render();
    expect(container.querySelectorAll("img")).toHaveLength(entries.length);
    expect(content).toHaveBeenCalledWith(7, first.id, expect.any(AbortSignal));
    const link = container.querySelector("a")!;
    expect(link.href).toBe("blob:test-1");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.getAttribute("aria-label")).toContain("tamanho maior");
    expect(container.querySelector("img")?.alt).toContain(first.nomeOriginal);
    expect(container.textContent).toContain(first.nomeOriginal);
  });

  it("shows an accessible empty state without fetching content", async () => {
    list.mockResolvedValue([]);
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("não possui anexos");
    expect(content).not.toHaveBeenCalled();
  });

  it("announces list and image loading", async () => {
    const pending = deferred<SolicitationAttachmentMetadata[]>();
    const image = deferred<Blob>();
    list.mockReturnValue(pending.promise);
    content.mockReturnValue(image.promise);
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Carregando anexos...");
    await act(async () => { pending.resolve([first]); });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Carregando imagem...");
    await act(async () => { image.resolve(new Blob(["image"])); });
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("reports a list failure locally and retries", async () => {
    list.mockRejectedValueOnce(new SolicitationApiError(403, "FORBIDDEN", "Sem permissão."));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Sem permissão.");
    await retry();
    expect(list).toHaveBeenCalledTimes(2);
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("keeps other images visible when one fails and retries only that image", async () => {
    list.mockResolvedValue([first, second]);
    content.mockRejectedValueOnce(new Error("network"));
    await render();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(first.nomeOriginal);
    await retry(`Tentar novamente: ${first.nomeOriginal}`);
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(1);
    expect(content).toHaveBeenCalledTimes(3);
  });

  it("releases a broken preview immediately and reloads it", async () => {
    await render();
    await act(async () => { container.querySelector("img")!.dispatchEvent(new Event("error")); });
    expect(revokeUrl).toHaveBeenCalledWith("blob:test-1");
    expect(container.querySelector("a")).toBeNull();
    await retry(`Tentar novamente: ${first.nomeOriginal}`);
    expect(container.querySelector("img")?.src).toBe("blob:test-2");
  });

  it("releases every URL and aborts requests on unmount", async () => {
    list.mockResolvedValue([first, second]);
    await render();
    const listSignal = list.mock.calls[0][1]!;
    const imageSignals = content.mock.calls.map((call) => call[2]!);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    expect(listSignal.aborted).toBe(true);
    expect(imageSignals.every((signal) => signal.aborted)).toBe(true);
    expect(revokeUrl.mock.calls.map(([url]) => url).sort()).toEqual(["blob:test-1", "blob:test-2"]);
  });

  it("ignores an old list response after switching solicitations", async () => {
    const old = deferred<SolicitationAttachmentMetadata[]>();
    list.mockReturnValueOnce(old.promise).mockResolvedValue([]);
    await render(7);
    const signal = list.mock.calls[0][1]!;
    await render(8);
    await act(async () => { old.resolve([first]); });
    expect(signal.aborted).toBe(true);
    expect(container.textContent).toContain("não possui anexos");
    expect(content).not.toHaveBeenCalled();
  });

  it("ignores old image bytes and clears previous previews when the ID changes", async () => {
    const oldImage = deferred<Blob>();
    list.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([]);
    content.mockReturnValueOnce(oldImage.promise);
    await render(7);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    const signal = content.mock.calls[0][2]!;
    await render(8);
    await act(async () => { oldImage.resolve(new Blob(["old"])); });
    expect(signal.aborted).toBe(true);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith("blob:test-1");
    expect(container.querySelector("img")).toBeNull();
  });

  it("works without auth providers or timeline permissions, delegating access to the API", async () => {
    await render();
    expect(list).toHaveBeenCalledWith(7, expect.any(AbortSignal));
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.textContent).not.toContain("Histórico");
  });
});
