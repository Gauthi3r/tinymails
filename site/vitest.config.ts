import { defineConfig } from "vitest/config";
import { aliases } from "./aliases.mjs";

export default defineConfig({
  resolve: { alias: aliases },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
