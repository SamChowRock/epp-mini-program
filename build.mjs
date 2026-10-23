import { build } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
await build({
  configFile: false,
  root,
  resolve: { conditions: ["browser", "default"] },
  build: {
    target: "es2018",
    outDir: "contracts",
    emptyOutDir: true,
    lib: { entry: fileURLToPath(new URL("./contract-entry.js", import.meta.url)), formats: ["cjs"], fileName: () => "index.js" },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
