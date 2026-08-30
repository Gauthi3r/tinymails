export function parsePort(value) {
  const port = value === undefined ? 3210 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("TINYMAILS_PORT must be a number between 1 and 65535.");
  }
  return port;
}

export function browserCommand(platform, url) {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") {
    return { command: "cmd", args: ["/d", "/s", "/c", "start", "", url] };
  }
  return { command: "xdg-open", args: [url] };
}

export async function probeLoopback(baseUrl, fetcher = fetch) {
  try {
    const response = await fetcher(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return "occupied";
    const body = await response.json();
    return body?.ok === true && body?.product === "TinyMails" ? "tinymails" : "occupied";
  } catch {
    return "free";
  }
}

export function occupiedPortError(state, port) {
  if (state === "tinymails") {
    return `Port ${port} is already running TinyMails. Stop that process before starting TinyMails again.`;
  }
  if (state === "occupied") {
    return `Port ${port} is already used by another local service. Set TINYMAILS_PORT to another port.`;
  }
  return null;
}
