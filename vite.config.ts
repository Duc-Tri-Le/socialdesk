import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  root: "./client",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@hatch/space-sdk/client",
        replacement: path.resolve(import.meta.dirname, "./packages/space-sdk/client.ts"),
      },
      {
        find: "@hatch/space-sdk",
        replacement: path.resolve(import.meta.dirname, "./packages/space-sdk/index.ts"),
      },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/actions": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:3000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "./dist",
    emptyOutDir: true,
  },
});
