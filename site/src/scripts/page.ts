// The page's own behaviour, beside the taste-skill kit (system.js, motion.js, the moments):
// the copy button, the morphing nav, the hero's live stage and the four chapter pictures.
// The hero and the pace chapter run TinyMails' own queue code (src/sim), so the counts, the
// times and the pause reason on screen are the product's.
import { DemoSession, type SessionState } from "../sim/session";
import { clockTime } from "../sim/time";

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = () => matchMedia("(max-width: 639px)").matches;
const stacked = () => matchMedia("(max-width: 1023px)").matches;
const html = document.documentElement;

const ENVELOPE = '<svg class="tm-envelope" viewBox="0 0 24 17" aria-hidden="true"><rect class="tm-envelope__body" x=".75" y=".75" width="22.5" height="15.5" rx="2.5"/><path class="tm-envelope__flap" d="M2 2.2 12 9.4 22 2.2"/></svg>';
const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="fill" d="M5 3.2v9.6L12.6 8z"/></svg>';
const PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5v9M10.5 3.5v9"/></svg>';

// ---------------------------------------------------------------- copy the agent prompt
const COPIED = "Copied. Paste it to your agent.";
function setupCopy(): void {
  const prompt = $<HTMLElement>("[data-prompt]");
  const announce = $<HTMLElement>("[data-announce]");
  // a phone folds the prompt after its first steps (the CSS only folds below 640px)
  const panel = $<HTMLElement>("#panel-prompt");
  const more = $<HTMLButtonElement>("[data-prompt-more]");
  const unfold = (): void => {
    panel?.removeAttribute("data-folded");
    if (more) more.hidden = true;
  };
  if (panel && more) {
    panel.setAttribute("data-folded", "");
    more.hidden = false;
    more.addEventListener("click", () => {
      unfold();
      panel.focus();
    });
  }
  for (const button of $$<HTMLAnchorElement>("a[data-copy]")) {
    button.setAttribute("role", "button");
    const label = [...button.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) as Text | undefined;
    if (!label) continue;
    let words = label.data;
    let timer = 0;
    // the install window's own button follows its tabs: the prompt, or the commands to run by hand
    const handTab = button.hasAttribute("data-copy-tab") ? $<HTMLElement>("#tab-hand") : null;
    const hand = $<HTMLElement>("[data-hand]");
    const byHand = (): boolean => handTab?.getAttribute("aria-selected") === "true";
    if (handTab) {
      const promptWords = words;
      new MutationObserver(() => {
        clearTimeout(timer);
        words = byHand() ? "Copy the commands" : promptWords;
        label.data = words;
        button.classList.remove("is-copied");
        if (announce) announce.textContent = "";
      }).observe(handTab, { attributes: true, attributeFilter: ["aria-selected"] });
    }
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const commands = byHand();
      const done = commands ? "Copied." : COPIED;
      try {
        await navigator.clipboard.writeText(commands ? (hand?.dataset.hand ?? "") : (prompt?.textContent ?? ""));
      } catch {
        if (commands) return;
        // no clipboard: open the prompt, selected, ready to copy by hand
        $<HTMLButtonElement>("#tab-prompt")?.click();
        unfold();
        $("#install")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
        if (prompt) getSelection()?.selectAllChildren(prompt);
        return;
      }
      label.data = done;
      button.classList.add("is-copied");
      if (announce) announce.textContent = done;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        label.data = words;
        button.classList.remove("is-copied");
        if (announce) announce.textContent = "";
      }, 3200);
    });
  }
}

// ---------------------------------------------------------------- the nav: a top bar that morphs into a floating pill
// The pill shows once the hero's buttons have gone and docks away while the close is on screen, where
// the footer has its own button and links. Only classes change: the CSS moves both parts by transform
// and opacity, and a view transition morphs the bar into the pill and back.
function setupNav(): void {
  const nav = $<HTMLElement>("[data-nav]");
  const hero = $<HTMLElement>(".hero");
  const close = $<HTMLElement>("footer.closing");
  if (!nav || !hero) return;
  const label = $<HTMLElement>("[data-now-label]", nav);
  const fill = $<HTMLElement>("[data-now-fill]", nav);
  const links = $$<HTMLAnchorElement>("[data-sec]", nav);
  const ids = [...new Set(links.map((a) => a.dataset.sec ?? ""))];
  const sections = ids.map((id) => ({ id, el: document.getElementById(id)!, label: links.find((a) => a.dataset.sec === id)!.textContent ?? "" })).filter((x) => x.el);
  // the pill's menu button opens the kit's menu sheet on the header
  $<HTMLButtonElement>("[data-pill-menu]", nav)?.addEventListener("click", () => $<HTMLButtonElement>(".nav__toggle", nav)?.click());
  let floating = false;
  let current = "";
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;

  const morph = (on: boolean) => {
    if (on === floating) return;
    floating = on;
    if (!on && nav.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    const apply = () => nav.classList.toggle("is-float", on);
    if (!reduced() && vt && !nav.classList.contains("is-open")) vt.call(document, apply);
    else apply();
  };

  let ticking = false;
  const update = () => {
    ticking = false;
    const h = hero.offsetHeight;
    const y = scrollY;
    if (!floating && y > h * 0.55) morph(true);
    else if (floating && y < h * 0.35) morph(false);
    const docked = !!close && close.getBoundingClientRect().top < innerHeight * 0.7;
    if (docked !== nav.classList.contains("is-docked")) {
      if (docked && $(".tm-float", nav)?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      nav.classList.toggle("is-docked", docked);
    }
    const mid = y + innerHeight * 0.45;
    let here = sections[0];
    for (const x of sections) if (x.el.offsetTop <= mid) here = x;
    const p = Math.min(1, Math.max(0, (mid - here.el.offsetTop) / here.el.offsetHeight));
    if (here.id !== current) {
      current = here.id;
      links.forEach((a) => a.classList.toggle("is-here", a.dataset.sec === here.id));
      if (label) label.textContent = here.label;
    }
    fill?.style.setProperty("--p", p.toFixed(3));
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update, { passive: true });
  update();
}

// ---------------------------------------------------------------- the recipient table and the row's button, as the app draws them
function rowsHtml(state: SessionState, size: number, lead: number, just: number): string {
  const all = state.campaign.recipients;
  const start = Math.max(0, Math.min(all.length - size, state.sent - lead));
  return all
    .slice(start, start + size)
    .map((r, i) => {
      const sent = r.status === "sent";
      const cls = [sent ? "is-sent" : "", start + i === just ? "is-just" : ""].join(" ").trim();
      return `<tr${cls ? ` class="${cls}"` : ""}><td>${r.email}</td><td><span class="tm-pill">${sent ? "Sent" : "Pending"}</span></td><td>${sent && r.sentAt ? clockTime(Date.parse(r.sentAt)) : "Waiting"}</td></tr>`;
    })
    .join("");
}

// only whole rows show: a row the window would cut is hidden, so the table ends on a line
function trimRows(tbody: HTMLTableSectionElement, box: HTMLElement): void {
  const rows = [...tbody.rows];
  rows.forEach((r) => { r.hidden = false; });
  const bottom = box.getBoundingClientRect().bottom - 2;
  for (const r of rows) if (r.getBoundingClientRect().bottom > bottom) r.hidden = true;
}

// a running campaign's row shows Pause; a paused one with mail left shows Start (src/app/CampaignsPage.tsx)
const setButton = (btn: HTMLElement, running: boolean) => {
  btn.classList.toggle("tm-btn--sec", running);
  btn.classList.toggle("tm-btn--pri", !running);
  btn.innerHTML = `<span class="tm-btn__ic">${running ? PAUSE : PLAY}</span><span>${running ? "Pause" : "Start"}</span>`;
};

// ---------------------------------------------------------------- the hero: the agent's queue, sending, paced, to Gmail
// The listener below only draws: it never calls pause() or start() (a pause from inside the
// listener emits a new state and calls itself again). The run ends where the product's runner
// ends it, at the daily cap.
async function setupHero(): Promise<void> {
  const stage = $<HTMLElement>(".tm-stage");
  const flow = $<HTMLElement>("[data-hero]");
  if (!stage || !flow) return;
  const win = $<HTMLElement>("[data-hero-win]", flow)!;
  const tbody = $<HTMLTableSectionElement>("[data-hero-rows]", win)!;
  const trim = () => trimRows(tbody, win);
  trim();
  new ResizeObserver(trim).observe(win);
  if (reduced()) return;   // the still stage stands as built
  const sentEl = $<HTMLElement>("[data-hero-sent]", win)!;
  const statusEl = $<HTMLElement>("[data-hero-status]", win)!;
  const reasonEl = $<HTMLElement>("[data-hero-reason]", win)!;
  const rowEl = $<HTMLElement>("[data-hero-row]", win)!;
  const btn = $<HTMLElement>("[data-hero-btn]", win)!;
  const barEl = $<HTMLElement>("[data-hero-bar]", win)!;
  const gmail = $<HTMLElement>("[data-hero-gmail]", flow)!;
  const inbox = $<HTMLElement>("[data-hero-inbox]", flow)!;
  const fly = $<HTMLElement>("[data-hero-fly]", flow)!;
  const trackIn = $<HTMLElement>("[data-track-in]", flow)!;
  // a phone plays the last few sends to the cap once and rests there; wider screens loop
  const once = phone();
  const FROM = once ? 21 : Number(sentEl.textContent) || 12;
  let paused = false;
  let flying: Animation[] = [];
  const hold = async () => { while (paused) await sleep(120); };

  if (!once) {
    // the kit's pause disc, shared with the stage's ground (motion.md: anything moving past 5 s)
    try {
      const ui = (await import(/* @vite-ignore */ new URL("/assets/ui/ui.js", location.href).href)).default;
      ui.pausable(stage, {
        pause: () => { paused = true; flow.classList.add("is-held"); flying.forEach((a) => a.pause()); },
        resume: () => { paused = false; flow.classList.remove("is-held"); flying.forEach((a) => a.play()); },
      });
    } catch { /* no pause disc without the kit: the loop still rests at every cap */ }
  }

  // one envelope from the row that just turned Sent to the Gmail chip, along a soft arc
  const launch = (row: Element | null) => {
    const f = flow.getBoundingClientRect();
    const g = gmail.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    const pill = row?.querySelector(".tm-pill")?.getBoundingClientRect();
    const down = stacked();
    let x0: number, y0: number, x1: number, y1: number, cx: number, cy: number;
    if (down) {
      x0 = w.left + w.width / 2 - f.left; y0 = w.bottom - f.top - 6;
      x1 = g.left + g.width / 2 - f.left; y1 = g.top - f.top + 6;
      cx = x0 + 26; cy = (y0 + y1) / 2;
    } else {
      x0 = (pill ? pill.left + pill.width / 2 : w.right - 120) - f.left;
      y0 = (pill ? pill.top + pill.height / 2 : w.top + w.height / 2) - f.top;
      x1 = g.left + 32 - f.left; y1 = g.top + g.height / 2 - f.top;
      cx = (x0 + x1) / 2 + 30; cy = Math.min(y0, y1) - 70;
    }
    const tmp = document.createElement("span");
    tmp.innerHTML = ENVELOPE;
    const env = tmp.firstElementChild as SVGElement;
    fly.append(env);
    const frames: Keyframe[] = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
      const rot = Math.max(-16, Math.min(16, ((Math.atan2(dy, dx) * 180) / Math.PI) * (down ? 0.12 : 0.35)));
      const s = t < 0.15 ? 0.55 + (t / 0.15) * 0.45 : t > 0.8 ? 1 - ((t - 0.8) / 0.2) * 0.35 : 1;
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${s.toFixed(2)})`, opacity: t < 0.08 ? t / 0.08 : t > 0.9 ? (1 - t) / 0.1 : 1, offset: t });
    }
    const a = env.animate(frames, { duration: 980, easing: "cubic-bezier(.45,0,.3,1)", fill: "forwards" });
    flying.push(a);
    a.finished.then(() => {
      env.remove();
      flying = flying.filter((x) => x !== a);
      inbox.textContent = String(Number(inbox.textContent) + 1);
      gmail.classList.remove("is-hit"); void gmail.offsetWidth; gmail.classList.add("is-hit");
    }, () => env.remove());
  };

  const draw = (state: SessionState, just: number) => {
    tbody.innerHTML = rowsHtml(state, 6, 3, just);
    trim();
    sentEl.textContent = String(state.sent);
    barEl.style.setProperty("--p", String(state.sent / state.queued));
  };
  const running = () => {
    statusEl.textContent = "Running";
    reasonEl.hidden = true;
    rowEl.classList.remove("is-paused");
    btn.classList.remove("is-asking");
    setButton(btn, true);
    trim();
  };

  // let the hero's entrance settle before anything moves inside the stage
  await sleep(1100);
  flow.dataset.state = "live";
  for (let round = 0; ; round++) {
    let live = false;
    let last = -1;
    const session = new DemoSession({
      // the runner's real 30 to 45 second delays, played at 1/37: 0.8 to 1.2 s between envelopes
      pace: async (ms) => { if (!live) return; await sleep(ms / 37); await hold(); },
    });
    session.subscribe((state) => {
      if (!live && state.sent === FROM) {
        live = true; last = state.sent;
        running(); draw(state, -1);
        inbox.textContent = String(state.sent);
        return;
      }
      if (live && state.sent !== last) {
        last = state.sent;
        draw(state, state.sent - 1);
        launch($(".is-just", tbody));
      }
    });
    if (round > 0) {
      // a new day: the agent's queue pulses in and the window wakes on its starting rows
      trackIn.style.setProperty("--len", `${stacked() ? trackIn.offsetHeight : trackIn.offsetWidth}px`);
      flow.classList.remove("is-queueing"); void flow.offsetWidth; flow.classList.add("is-queueing");
      await win.animate([{ opacity: 1 }, { opacity: 0.4 }], { duration: 320, easing: "ease-in", fill: "forwards" }).finished;
    }
    await session.sendTest();
    const run = session.start();
    if (round > 0) win.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 420, easing: "ease-out", fill: "forwards" });
    await run;
    // at the cap the runner pauses with its own reason, and Start waits for the human
    const end = session.state();
    session.dispose();
    await sleep(1000);
    statusEl.textContent = "Paused";
    reasonEl.textContent = end.campaign.pauseReason ?? reasonEl.textContent;
    reasonEl.hidden = false;
    rowEl.classList.add("is-paused");
    setButton(btn, false);
    btn.classList.add("is-asking");
    trim();
    if (once) return;
    await sleep(4200);
    await hold();
    flow.classList.remove("is-queueing");
  }
}

// ---------------------------------------------------------------- the four chapter pictures
type Player = (fig: HTMLElement, alive: () => boolean) => Promise<void>;

const moveCursor = (fig: HTMLElement, cursor: HTMLElement, target: HTMLElement | null, from?: [number, number]) => {
  const scene = $<HTMLElement>(".tm-scene", fig)!;
  const host = cursor.offsetParent as HTMLElement;
  const k = Number(getComputedStyle(scene).getPropertyValue("--k")) || 1;
  const h = host.getBoundingClientRect();
  if (from) { cursor.style.transition = "none"; cursor.style.transform = `translate(${from[0]}px, ${from[1]}px)`; void cursor.offsetWidth; cursor.style.transition = ""; }
  cursor.style.opacity = "1";
  if (!target) return;
  const t = target.getBoundingClientRect();
  cursor.style.transform = `translate(${(t.left - h.left) / k + (t.width / k) * 0.55}px, ${(t.top - h.top) / k + (t.height / k) * 0.55}px)`;
};
const click = async (cursor: HTMLElement, button: HTMLElement | null) => {
  cursor.classList.remove("is-click"); void cursor.offsetWidth; cursor.classList.add("is-click");
  button?.classList.add("is-pressed");
  await sleep(160);
  button?.classList.remove("is-pressed");
};

const players: Record<string, Player> = {
  async agent(fig, alive) {
    const bubble = $<HTMLElement>(".tm-bubble", fig)!;
    const text = bubble.dataset.type ?? bubble.textContent ?? "";
    fig.dataset.state = "0";
    bubble.textContent = "";
    bubble.classList.add("tm-caret");
    await sleep(300);
    // a prompt types at about 16 characters a second (motion.md), two at a time
    for (let i = 2; i <= text.length + 1 && alive(); i += 2) {
      bubble.textContent = text.slice(0, i);
      await sleep(70);
    }
    bubble.textContent = text;
    bubble.classList.remove("tm-caret");
    if (!alive()) return;
    await sleep(250);
    fig.dataset.state = "1";
    await sleep(1000);
    if (!alive()) return;
    fig.dataset.state = "2";
    await sleep(300);
    delete fig.dataset.state;
  },
  async test(fig, alive) {
    // the agent's second call: the test goes to the user's own address, then the mail lands
    fig.dataset.state = "0";
    await sleep(500);
    if (!alive()) return;
    fig.dataset.state = "1";
    await sleep(1100);
    if (!alive()) return;
    fig.dataset.state = "2";
    await sleep(500);
    delete fig.dataset.state;
  },
  async start(fig, alive) {
    const cursor = $<HTMLElement>("[data-cursor]", fig)!;
    const btn = $<HTMLElement>('[data-press="start"]', fig)!;
    const items = $$<HTMLElement>("[data-out] li", fig);
    const sent = $<HTMLElement>("[data-start-sent]", fig)!;
    const status = $<HTMLElement>("[data-start-status]", fig)!;
    fig.dataset.state = "0";
    setButton(btn, false);
    status.textContent = "Paused";
    sent.textContent = "0";
    items.forEach((li) => li.classList.remove("is-sent", "is-leaving"));
    moveCursor(fig, cursor, null, [540, 380]);
    await sleep(450);
    moveCursor(fig, cursor, btn);
    await sleep(850);
    if (!alive()) return;
    await click(cursor, btn);
    setButton(btn, true);
    status.textContent = "Running";
    fig.dataset.state = "1";
    await sleep(250);
    cursor.style.opacity = "0";
    // one at a time: each row's envelope leaves, then it reads Sent with its time
    for (const [i, li] of items.entries()) {
      if (!alive()) return;
      li.style.opacity = "1";
      li.style.transform = "none";
      li.classList.add("is-leaving");
      await sleep(600);
      li.classList.add("is-sent");
      sent.textContent = String(i + 1);
      await sleep(500);
    }
    items.forEach((li) => { li.style.opacity = ""; li.style.transform = ""; li.classList.remove("is-leaving"); });
    delete fig.dataset.state;
  },
  async pace(fig, alive) {
    const n = $<HTMLElement>("[data-pace-sent]", fig)!;
    const bar = $<HTMLElement>("[data-pace-bar]", fig)!;
    const status = $<HTMLElement>("[data-pace-status]", fig)!;
    const reason = $<HTMLElement>("[data-pace-reason]", fig)!;
    const row = $<HTMLElement>("[data-pace-row]", fig)!;
    const btn = $<HTMLElement>("[data-pace-btn]", fig)!;
    const tbody = $<HTMLElement>("[data-pace-rows]", fig)!;
    const done = reason.textContent ?? "";
    fig.dataset.state = "0";
    // the product's own runner from the press of Start: 25 messages at the default 30 to 45 seconds
    // apart, played at 1/320 (about 0.12 s a message), each row turning to Sent with its real time;
    // the picture rests on the pause within 5 s of its step opening
    const session = new DemoSession({ pace: (ms) => sleep(ms / 320) });
    session.subscribe((s) => {
      if (!alive()) return;
      n.textContent = String(s.sent);
      bar.style.setProperty("--p", String(s.sent / s.queued));
      tbody.innerHTML = rowsHtml(s, 5, 3, s.sent - 1);
    });
    await session.sendTest();
    row.classList.remove("is-paused");
    reason.textContent = "";
    status.textContent = "Running";
    btn.classList.remove("is-asking");
    setButton(btn, true);
    await sleep(200);
    if (!alive()) { session.dispose(); return; }
    await session.start();
    const end = session.state();
    session.dispose();
    if (!alive()) return;
    tbody.innerHTML = rowsHtml(end, 5, 3, -1);
    status.textContent = "Paused";
    reason.textContent = end.campaign.pauseReason ?? done;
    row.classList.add("is-paused");
    setButton(btn, false);
    btn.classList.add("is-asking");
    delete fig.dataset.state;
  },
};

function fitScenes(): void {
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const fig = e.target as HTMLElement;
      const scene = $<HTMLElement>(".tm-scene", fig);
      if (!scene) continue;
      const w = fig.clientWidth, h = fig.clientHeight;
      if (!w || !h) continue;
      const pad = w < 500 ? 20 : 48;
      const k = Math.min(1.15, (w - pad) / scene.offsetWidth, (h - pad) / scene.offsetHeight);
      scene.style.setProperty("--k", k.toFixed(3));
    }
  });
  $$(".tm-vis").forEach((f) => ro.observe(f));
}

function setupChapters(): void {
  const figs = $$<HTMLElement>(".tm-vis[data-play]");
  fitScenes();
  if (reduced()) return;
  const runs = new Map<HTMLElement, number>();
  const play = (fig: HTMLElement) => {
    const id = (runs.get(fig) ?? 0) + 1;
    runs.set(fig, id);
    const alive = () => runs.get(fig) === id;
    void players[fig.dataset.play ?? ""]?.(fig, alive).catch(() => { delete fig.dataset.state; });
  };
  const stop = (fig: HTMLElement) => runs.set(fig, (runs.get(fig) ?? 0) + 1);
  // live (the section pinned): each picture plays as its step opens
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const fig = r.target as HTMLElement;
      const on = fig.classList.contains("is-on");
      const was = (r.oldValue ?? "").split(/\s+/).includes("is-on");
      if (on && !was) play(fig);
      if (!on && was) stop(fig);
    }
  });
  figs.forEach((f) => mo.observe(f, { attributes: true, attributeFilter: ["class"], attributeOldValue: true }));
  // at rest (a tablet, a phone, reduced motion) nothing is pinned and each picture stands on its
  // finished still, as the kit's moment does there (moments.md, pinned-chapters)
}

setupCopy();
setupNav();
setupChapters();
void setupHero();
html.dataset.page = "ready";
