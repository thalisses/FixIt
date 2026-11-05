import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders a status while checking for an existing session", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(App));

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Verificando sua sessão...",
    );
  });
});