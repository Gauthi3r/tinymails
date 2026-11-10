// The product's createCampaign imports randomUUID from "node:crypto". In the
// browser (and in this site's build) that import is aliased here. Web Crypto
// provides the same function in browsers and in Node 22.
export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}
