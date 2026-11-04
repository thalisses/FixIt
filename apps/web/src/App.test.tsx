import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the FixIt title and startup status", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(App));

    expect(container.querySelector("h1")?.textContent).toBe("FixIt");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Frontend inicial em execução.",
    );
  });
});