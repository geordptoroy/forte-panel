import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_ONLY_MODE, CORE_ROUTE, CORE_USAGE_ROUTE, isCoreAllowedRoute } from "./core-mode";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("O6.3 browser and accessibility contracts", () => {
  it("keeps CORE_ONLY_MODE explicit and routes blocked paths back to the core journey", () => {
    const app = source("client/src/App.tsx");
    expect(CORE_ONLY_MODE).toBe(true);
    expect(CORE_ROUTE).toBe("/whatsapp-connection");
    expect(isCoreAllowedRoute(CORE_ROUTE)).toBe(true);
    expect(isCoreAllowedRoute(CORE_USAGE_ROUTE)).toBe(false);
    expect(isCoreAllowedRoute("/dashboard")).toBe(false);
    expect(app).toContain("!isCoreAllowedRoute(location)");
    expect(app).toContain("<Redirect to={CORE_ROUTE} />");
    expect(app).toContain("CORE_ONLY_MODE ? CORE_ROUTE : \"/dashboard\"");
  });

  it("keeps critical navigation operable by keyboard and screen readers", () => {
    const layout = source("client/src/components/PanelLayout.tsx");
    const platform = source("client/src/pages/PlatformAdminPage.tsx");
    expect(layout).toContain('aria-label="Navegação principal"');
    expect(layout).toContain('aria-label="Abrir menu"');
    expect(layout).toContain('aria-label="Fechar menu"');
    expect(layout).toContain("CORE_ONLY_MODE &&");
    expect(platform).toContain('aria-label="Navegação da plataforma"');
    expect(platform).toContain('type="button"');
    expect(platform).toContain('aria-label="Fechar"');
  });

  it("exposes status, error, dialog and progress semantics on the WhatsApp journey", () => {
    const whatsapp = source("client/src/pages/WhatsappConnectionPage.tsx");
    expect(whatsapp).toContain('role="alert"');
    expect(whatsapp).toContain('role="status"');
    expect(whatsapp).toContain('role="dialog"');
    expect(whatsapp).toContain('aria-modal="true"');
    expect(whatsapp).toContain('role="progressbar"');
    expect(whatsapp).toContain('"aria-label": "Número do telefone com DDI"');
  });

  it("keeps focus-visible styling and a mobile layout contract", () => {
    const css = source("client/src/index.css");
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/@media\s*\([^)]*(?:max-width|min-width)/);
    expect(css).toMatch(/overflow-x\s*:\s*auto/);
  });
});
