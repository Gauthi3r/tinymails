import { fileURLToPath } from "node:url";

// Shared by Astro and Vitest: the product's source, and the browser stand-in
// for the one Node module it imports.
export const aliases = {
  "@product": fileURLToPath(new URL("../src", import.meta.url)),
  "node:crypto": fileURLToPath(new URL("./src/sim/crypto-shim.ts", import.meta.url)),
};
