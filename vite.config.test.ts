import { existsSync } from "node:fs";
import path from "node:path";
import { createServer, loadConfigFromFile } from "vite";
import sanitize from "sanitize-html";
import { describe, expect, it } from "vitest";

describe("HTML parser dependency resolution", () => {
  it("resolves modern entities/decode through the project's configured aliases", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      path.resolve("vite.config.ts"),
    );
    if (!loaded) throw new Error("Project Vite configuration did not load");
    const server = await createServer({
      configFile: false,
      resolve: loaded.config.resolve,
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      for (const importer of [
        "node_modules/htmlparser2/dist/Tokenizer.js",
        "node_modules/parse5/dist/tokenizer/index.js",
      ]) {
        const resolved = await server.pluginContainer.resolveId(
          "entities/decode",
          path.resolve(importer),
        );
        expect(resolved?.id).toBeTruthy();
        expect(existsSync(resolved?.id ?? "")).toBe(true);
        expect(resolved?.id).toMatch(/\/entities\/dist\/decode\.js$/);
      }
    } finally {
      await server.close();
    }
  });

  it("keeps the sanitizer functional with modern HTML entities", () => {
    expect(sanitize('<p>A &amp; B</p><script>alert(1)</script><a href="javascript:alert(1)">link</a>'))
      .toBe('<p>A &amp; B</p><a>link</a>');
  });
});