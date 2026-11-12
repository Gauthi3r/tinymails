import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("browser metadata", () => {
  it("links the TinyMails favicon and touch icon", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/src/assets/favicon-32.png"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('href="/src/assets/apple-touch-icon.png"');
  });
});
