import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

function pwaServiceWorker(): Plugin {
  return {
    name: "incoc-south-pwa-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const source = readFileSync(new URL("./src/service-worker.js", import.meta.url), "utf8");
      const hash = createHash("sha256");
      hash.update(source);
      for (const fileName of Object.keys(bundle).sort()) {
        const output = bundle[fileName];
        hash.update(fileName);
        hash.update(output.type === "chunk" ? output.code : output.source);
      }
      for (const fileName of ["manifest.webmanifest", "incoc-mark.svg", "incoc-icon-192.png", "incoc-icon-512.png", "incoc-icon-maskable-192.png", "incoc-icon-maskable-512.png"]) {
        hash.update(readFileSync(new URL(`./public/${fileName}`, import.meta.url)));
      }
      const buildVersion = hash.digest("hex").slice(0, 12);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: source.replace('"__BUILD_VERSION__"', JSON.stringify(buildVersion)),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pwaServiceWorker()],
  build: {
    manifest: "asset-manifest.json",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
