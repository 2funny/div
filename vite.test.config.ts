import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "tests/.generated",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "tests/harness/runtimeHarness.ts"),
      name: "RuneDungeonTestHarness",
      formats: ["iife"],
      fileName: () => "runtime-harness.js"
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
