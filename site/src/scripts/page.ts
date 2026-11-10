import { rulesLine } from "../sim/format";
import { planRun } from "../sim/plan";
import { DemoSession, type SessionState } from "../sim/session";
import { stripHtml, stripModel } from "../sim/strip";
import { MINUTE, dayAndTime } from "../sim/time";
import { DEFAULT_RULES, DEFAULT_SEED, type Rules } from "../sim/world";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = <T extends Element>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector);
const $$ = <T extends Element>(selector: string, root: ParentNode = document) => [...root.querySelectorAll<T>(selector)];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Real milliseconds per virtual millisecond: 37 seconds between messages pass in about 0.4s. */
const SPEED = 1 / 90;

// ---------------------------------------------------------------- copy prompt
const announcer = document.createElement("p");
announcer.className = "visually-hidden";
announcer.setAttribute("aria-live", "polite");
document.body.append(announcer);

function setupCopy(): void {
  const promptText = $<HTMLElement>("#prompt")?.dataset.prompt ?? "";
  for (const link of $$<HTMLAnchorElement>("a[data-copy]")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = link.className;
    button.textContent = link.textContent;
    link.replaceWith(button);
    const label = button.textContent ?? "";
    let timer = 0;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(promptText);
      } catch {
        // No clipboard access: show the prompt selected, ready to copy by hand.
        const prompt = $<HTMLElement>("#prompt");
        const text = $("[data-prompt-text]");
        prompt?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
        prompt?.focus({ preventScroll: true });
        if (text) window.getSelection()?.selectAllChildren(text);
        return;
      }
      button.style.minWidth = `${button.offsetWidth}px`;
      button.textContent = "Copied. Paste it to your agent.";
      announcer.textContent = "Copied. Paste it to your agent.";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.textContent = label;
        button.style.minWidth = "";
        announcer.textContent = "";
      }, 3200);
    });
  }
}

// ---------------------------------------------------------------- the outbox
const stage = $<HTMLElement>("#demo");
const testButton = $<HTMLButtonElement>('[data-action="test"]');
const startButton = $<HTMLButtonElement>('[data-action="start"]');
const statusLine = $<HTMLElement>("[data-status]");
const sentFigure = $<HTMLElement>("[data-sent]");
const clockLine = $<HTMLElement>("[data-clock]");
const rulesLineEl = $<HTMLElement>("[data-rules-line]");
const letter = $<HTMLElement>("[data-letter]");
const letterLabel = $<HTMLElement>("[data-letter-label]");
const letterTo = $<HTMLElement>("[data-letter-to]");
const letterSubject = $<HTMLElement>("[data-letter-subject]");
const letterBody = $<HTMLElement>("[data-letter-body]");
const flap = $<HTMLElement>(".envelope-flap");
const mails = $$<HTMLElement>("[data-queue] .mail");

let rules: Rules = structuredClone(DEFAULT_RULES);
let session: DemoSession;
let shownStatus = "";
let shownSent = new Set<string>();
let rollToken = 0;
let busy = false;

function newSession(): void {
  session?.dispose();
  const current = new DemoSession({
    rules,
    seed: DEFAULT_SEED,
    pace: async (ms) => {
      await sleep(Math.max(60, ms * SPEED));
      // A replaced session's runner simply never wakes up again.
      if (current !== session) await new Promise(() => {});
    },
  });
  session = current;
  shownSent = new Set();
  rollToken += 1;
  for (const mail of mails) mail.classList.remove("is-sent", "is-landing");
  const preview = session.world.preview();
  // Before Start, the letter is the test, addressed to the user's own Gmail.
  showLetter(preview.to, preview.subject, preview.body, "Test to");
  if (rulesLineEl) rulesLineEl.textContent = rulesLine(rules);
  session.subscribe(render);
  render(session.state());
}

function showLetter(to: string, subject: string, body: string, label = "To"): void {
  if (letterLabel) letterLabel.textContent = label;
  if (letterTo) letterTo.textContent = to;
  if (letterSubject) letterSubject.textContent = subject;
  if (letterBody) letterBody.textContent = body;
}

async function dipLetter(swap: () => void): Promise<void> {
  if (!letter || reducedMotion()) {
    swap();
    return;
  }
  flap?.classList.remove("is-flapping");
  void flap?.offsetWidth;
  flap?.classList.add("is-flapping");
  letter.classList.add("is-dipping");
  await sleep(170);
  swap();
  letter.classList.remove("is-dipping");
}

function render(state: SessionState): void {
  // The buttons are the human's: Send test, then Start or Pause.
  if (testButton) {
    testButton.disabled = busy || (state.phase !== "untested" && state.phase !== "done");
    testButton.textContent = state.phase === "done" ? "Run it again" : "Send test";
  }
  if (startButton) {
    const running = state.phase === "running";
    startButton.disabled = false;
    startButton.textContent = running ? "Pause" : "Start";
    startButton.setAttribute("aria-disabled", String(state.phase === "untested" || state.phase === "done"));
  }

  if (statusLine && state.status !== shownStatus) {
    shownStatus = state.status;
    statusLine.textContent = state.status;
  }
  if (sentFigure) sentFigure.textContent = String(state.sent);

  // Each message that has left: its tiny envelope fills and takes a postmark.
  const recipients = state.campaign.recipients;
  let newest: string | null = null;
  recipients.forEach((recipient, index) => {
    if (recipient.status !== "sent" || shownSent.has(recipient.email)) return;
    shownSent.add(recipient.email);
    newest = recipient.email;
    const mail = mails[index];
    if (!mail) return;
    mail.classList.add("is-sent");
    if (!reducedMotion()) {
      mail.classList.remove("is-landing");
      void mail.offsetWidth;
      mail.classList.add("is-landing");
    }
  });
  if (newest) {
    const message = session.world.gmail.sent.findLast((item) => item.message.to === newest)?.message;
    if (message) void dipLetter(() => showLetter(message.to, message.subject, message.body));
  }

  if (state.rolled && clockLine && clockLine.dataset.rolledTo !== String(state.rolled.to)) {
    clockLine.dataset.rolledTo = String(state.rolled.to);
    void rollClock(state.rolled.from, state.rolled.to);
  } else if (!state.rolled && clockLine && clockLine.dataset.rolling !== "true") {
    clockLine.dataset.rolledTo = "";
    clockLine.textContent = dayAndTime(state.now);
  }
}

/** The demo clock moves to the next window opening, hour by hour, then waits. */
async function rollClock(from: number, to: number): Promise<void> {
  if (!clockLine) return;
  const token = rollToken;
  if (reducedMotion()) {
    clockLine.textContent = dayAndTime(to);
    return;
  }
  clockLine.dataset.rolling = "true";
  clockLine.classList.add("is-rolling");
  const steps = Math.min(24, Math.max(1, Math.round((to - from) / (60 * MINUTE))));
  for (let step = 1; step <= steps; step += 1) {
    if (token !== rollToken) break;
    const at = step === steps ? to : from + ((to - from) * step) / steps;
    clockLine.textContent = dayAndTime(at);
    await sleep(900 / steps);
  }
  clockLine.classList.remove("is-rolling");
  clockLine.dataset.rolling = "false";
  if (token === rollToken) clockLine.textContent = dayAndTime(to);
}

function refuse(button: HTMLElement): void {
  button.classList.remove("is-refused");
  void button.offsetWidth;
  button.classList.add("is-refused");
}

function setupOutbox(): void {
  if (!stage || !testButton || !startButton) return;
  newSession();

  testButton.addEventListener("click", async () => {
    if (session.state().phase === "done") {
      newSession();
      testButton.focus();
      return;
    }
    busy = true;
    testButton.disabled = true;
    await dipLetter(() => undefined);
    busy = false;
    const result = await session.sendTest();
    if (result.ok) startButton.focus();
  });

  startButton.addEventListener("click", async () => {
    const state = session.state();
    if (state.phase === "running") {
      await session.pause();
      return;
    }
    if (state.phase === "untested") {
      // TinyMails refuses Start until the test was sent. So does the demo.
      refuse(startButton);
      if (statusLine) {
        statusLine.textContent = "";
        window.setTimeout(() => {
          statusLine.textContent = "Start unlocks after the test.";
        }, 60);
      }
      return;
    }
    if (state.phase === "done") return;
    await session.start();
  });
}

// ---------------------------------------------------------------- the rules
const form = $<HTMLFormElement>("[data-rules]");
const planSentence = $<HTMLElement>("[data-plan-sentence]");
const planNote = $<HTMLElement>("[data-plan-note]");
const stripHost = $<HTMLElement>("[data-strip]");
let planToken = 0;

function readRules(): Rules | null {
  if (!form) return null;
  const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value;
  const cap = Math.round(Number(value("dailyCap")));
  if (!Number.isFinite(cap) || cap < 1 || cap > 500) return null;
  const days = $$<HTMLButtonElement>(".weekday", form)
    .filter((button) => button.getAttribute("aria-pressed") === "true")
    .map((button) => Number(button.dataset.weekday));
  return {
    dailyCap: cap,
    days: days.sort((a, b) => a - b),
    start: value("start"),
    end: value("end"),
    delayMinSeconds: Number(value("delayMinSeconds")),
    delayMaxSeconds: Number(value("delayMaxSeconds")),
  };
}

async function replan(): Promise<void> {
  const next = readRules();
  if (!next) return;
  const capInput = form?.elements.namedItem("dailyCap") as HTMLInputElement | null;
  capInput?.style.setProperty("--digits", String(Math.max(1, String(next.dailyCap).length)));
  rules = next;
  const token = ++planToken;
  const plan = await planRun(rules, DEFAULT_SEED);
  if (token !== planToken) return;
  if (planSentence) planSentence.textContent = plan.sentence;
  if (planNote) {
    planNote.textContent = plan.note ?? "";
    planNote.hidden = !plan.note;
  }
  if (stripHost) {
    stripHost.innerHTML = stripHtml(stripModel(plan, rules));
    const strip = $<HTMLElement>(".strip", stripHost);
    if (strip && !reducedMotion()) {
      $$<SVGElement>(".strip-env", strip).forEach((env, index) => env.style.setProperty("--d", String(Math.min(index * 12, 600))));
      strip.classList.add("is-replanned");
    }
  }
  // One simulation: the hero's outbox is queued again under the new rules.
  newSession();
}

function setupRules(): void {
  if (!form) return;
  for (const control of $$<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button", form)) {
    control.disabled = false;
  }
  const cap = form.elements.namedItem("dailyCap") as HTMLInputElement;
  const start = form.elements.namedItem("start") as HTMLSelectElement;
  const end = form.elements.namedItem("end") as HTMLSelectElement;
  const min = form.elements.namedItem("delayMinSeconds") as HTMLSelectElement;
  const max = form.elements.namedItem("delayMaxSeconds") as HTMLSelectElement;

  // Every figure has the same minus and plus buttons. On a list, they move one
  // option; on the cap, one message. Both go through the field's own change.
  const steps = $$<HTMLButtonElement>("[data-step]", form);
  const syncSteps = () => {
    for (const step of steps) {
      const field = form.elements.namedItem(step.dataset.for ?? "") as HTMLInputElement | HTMLSelectElement;
      const up = Number(step.dataset.step) > 0;
      // aria-disabled, not disabled, so a button at its limit keeps the focus.
      const atLimit =
        field instanceof HTMLSelectElement
          ? up ? field.selectedIndex >= field.options.length - 1 : field.selectedIndex <= 0
          : up ? Number(field.value) >= 500 : Number(field.value) <= 1;
      step.setAttribute("aria-disabled", String(atLimit));
    }
  };
  for (const step of steps) {
    step.addEventListener("click", () => {
      const field = form.elements.namedItem(step.dataset.for ?? "") as HTMLInputElement | HTMLSelectElement;
      const by = Number(step.dataset.step);
      if (step.getAttribute("aria-disabled") === "true") return;
      if (field instanceof HTMLSelectElement) {
        field.selectedIndex = Math.min(field.options.length - 1, Math.max(0, field.selectedIndex + by));
      } else {
        field.value = String(Math.min(500, Math.max(1, Math.round(Number(field.value) || 1) + by)));
      }
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  form.addEventListener("change", syncSteps);
  form.addEventListener("input", syncSteps);
  syncSteps();

  cap.addEventListener("change", () => {
    const value = Math.min(500, Math.max(1, Math.round(Number(cap.value) || 1)));
    cap.value = String(value);
    void replan();
  });
  cap.addEventListener("input", () => {
    if (readRules()) void replan();
  });

  // The window must close after it opens; the longest pause cannot be the shorter one.
  start.addEventListener("change", () => {
    if (end.value <= start.value) {
      const later = [...end.options].find((option) => option.value > start.value);
      if (later) end.value = later.value;
    }
    void replan();
  });
  end.addEventListener("change", () => {
    if (end.value <= start.value) {
      const earlier = [...start.options].reverse().find((option) => option.value < end.value);
      if (earlier) start.value = earlier.value;
    }
    void replan();
  });
  min.addEventListener("change", () => {
    if (Number(max.value) < Number(min.value)) max.value = min.value;
    void replan();
  });
  max.addEventListener("change", () => {
    if (Number(max.value) < Number(min.value)) min.value = max.value;
    void replan();
  });

  for (const day of $$<HTMLButtonElement>(".weekday", form)) {
    day.addEventListener("click", () => {
      const pressed = day.getAttribute("aria-pressed") === "true";
      const others = $$<HTMLButtonElement>('.weekday[aria-pressed="true"]', form).length;
      if (pressed && others === 1) {
        // TinyMails needs at least one sending day.
        refuse(day);
        return;
      }
      day.setAttribute("aria-pressed", String(!pressed));
      void replan();
    });
  }
}

// ---------------------------------------------------------------- entrances
function setupEntrances(): void {
  const items = $$<HTMLElement>(".rise");
  const groups = new Map<Element, number>();
  for (const item of items) {
    const section = item.closest("section") ?? document.body;
    const index = groups.get(section) ?? 0;
    item.style.setProperty("--i", String(index));
    groups.set(section, index + 1);
  }
  if (!("IntersectionObserver" in window)) {
    for (const item of items) item.classList.add("is-in");
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
  );
  for (const item of items) observer.observe(item);
}

setupCopy();
setupOutbox();
setupRules();
setupEntrances();
