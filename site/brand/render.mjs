// Renders the site's icons and its link preview picture.
//
//   npm run build && node brand/render.mjs
//
// Icons come from brand/logo.png. The preview is a photograph of the built
// page's own hero, with brand/og.css laid over it, taken by headless Chrome.
// Needs Google Chrome (set CHROME to its path elsewhere than macOS) and sharp,
// which Astro already installs.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = join(here, "..", "dist");
const out = join(here, "..", "public");
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const clear = { r: 0, g: 0, b: 0, alpha: 0 };
const white = { r: 255, g: 255, b: 255, alpha: 1 };

/** The mark centred on a square of `size`, filling `fill` of its width. */
async function square(size, fill, background) {
  const mark = await sharp(join(here, "logo.png")).resize({ width: Math.round(size * fill) }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An .ico file that holds PNG pictures, one per size. */
function ico(pictures) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pictures.length, 4);
  let offset = 6 + 16 * pictures.length;
  const entries = pictures.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pictures.map((picture) => picture.data)]);
}

async function icons() {
  const sizes = [16, 32, 48];
  const pictures = await Promise.all(sizes.map(async (size) => ({ size, data: await square(size, 1, clear) })));
  await writeFile(join(out, "favicon.ico"), ico(pictures));
  await writeFile(join(out, "favicon.png"), await square(96, 1, clear));
  // iOS paints a transparent icon black, so the home-screen icon sits on white.
  await writeFile(join(out, "apple-touch-icon.png"), await square(180, 0.72, white));
}

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

/** Serves the built site; /og is the home page with the preview's stylesheet added. */
function serve() {
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (path === "/og") {
        const page = await readFile(join(dist, "index.html"), "utf8");
        const css = await readFile(join(here, "og.css"), "utf8");
        response.writeHead(200, { "content-type": types[".html"] });
        response.end(page.replace("</head>", `<style>${css}</style></head>`));
        return;
      }
      const file = join(dist, normalize(path));
      if (!file.startsWith(dist)) throw new Error("outside the site");
      const body = await readFile(file);
      response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function preview() {
  const server = await serve();
  const scratch = await mkdtemp(join(tmpdir(), "tinymails-og-"));
  const shot = join(scratch, "og.png");
  try {
    await promisify(execFile)(chrome, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-prefers-reduced-motion",
      `--user-data-dir=${join(scratch, "profile")}`,
      "--window-size=1200,630", "--force-device-scale-factor=2", "--virtual-time-budget=6000",
      `--screenshot=${shot}`, `http://127.0.0.1:${server.address().port}/og`,
    ]);
    await sharp(shot).resize(1200, 630).png({ compressionLevel: 9 }).toFile(join(out, "og.png"));
  } finally {
    server.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

await icons();
await preview();
