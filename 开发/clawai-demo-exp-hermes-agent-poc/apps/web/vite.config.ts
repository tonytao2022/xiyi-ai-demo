import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ce-demo/report-schema": path.resolve(
        __dirname,
        "../../packages/report-schema/src/index.ts"
      ),
      "@ce-demo/analysis-contract": path.resolve(
        __dirname,
        "../../packages/analysis-contract/src/index.ts"
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
