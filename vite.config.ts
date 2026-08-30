import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export const apiProxy = {
  target: "http://127.0.0.1:3210",
  changeOrigin: false,
} as const;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": apiProxy,
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
