import { describe, expect, it } from "vitest";
import { apiProxy } from "../vite.config";

describe("Vite API proxy", () => {
  it("preserves the browser Host so loopback Origin validation succeeds", () => {
    expect(apiProxy).toEqual({
      target: "http://127.0.0.1:3210",
      changeOrigin: false,
    });
  });
});
