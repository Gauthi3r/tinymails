import { defineConfig } from "astro/config";
import { aliases } from "./aliases.mjs";

export default defineConfig({
  site: "https://tinymails.com",
  output: "static",
  trailingSlash: "ignore",
  build: { inlineStylesheets: "always" },
  devToolbar: { enabled: false },
  server: { host: "127.0.0.1", port: 4321 },
  vite: {
    resolve: { alias: aliases },
    server: { fs: { allow: [".."] } },
  },
});
