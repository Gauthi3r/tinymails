# TinyMails website

The one-page marketing site for TinyMails. It is a static page built with
[Astro](https://astro.build): plain HTML and CSS, plus one small script for the
live outbox, the sending-rules controls and the copy button. No framework runs
in the browser, no analytics, no requests leave the page.

## Run it

Needs Node.js 22.23.4 or newer.

```bash
cd site
npm install
npm run dev       # http://127.0.0.1:4321, stop it with Ctrl+C
npm run build     # static files in site/dist
npm run preview   # serves site/dist on http://127.0.0.1:4321
npm test          # the simulation's unit tests
npm run check     # typecheck, tests and build
```

## How the demo is wired to the product

The outbox in the hero and the plan in the Rules section are not mock-ups.
They run TinyMails' own code from `../src`, unmodified, imported through the
`@product` alias (see `aliases.mjs`):

- `src/server/campaign-runner.ts` (`CampaignRunner`) does the sending, the
  daily cap, the sending window, the delays and the pause reasons.
- `src/domain/campaigns.ts` (`createCampaign`, `renderMessage`) and
  `src/domain/leads.ts` (`mergeLeads`) play the agent's two requests and
  produce the numbers in the terminal and the personalised letter.
- `src/gmail/fake-adapter.ts` stands in for Gmail. Nothing is sent.

What the site adds, in `src/sim/`:

- `world.ts`: in-memory repositories, the fake Gmail, a seeded random source
  and a virtual clock injected into the runner. The demo account uses UTC, so
  every visitor sees the same weekdays and times.
- `controller.ts`: the Start gate, which in the product lives in the Express
  layer (`src/server/app.ts`): Start is refused until the test was sent, only
  a paused campaign starts, only a running one pauses.
- `session.ts`: the hero's state and status line. After a pause at the cap or
  the window, the demo clock moves to the next window opening and waits. It
  never presses Start by itself, because TinyMails does not.
- `plan.ts`: runs the real runner to completion on the virtual clock and turns
  the result into the plan sentence.
- `crypto-shim.ts`: the browser stand-in for `node:crypto`'s `randomUUID`, the
  one Node import in the product code the demo uses.

The page is rendered at build time by the same code, so it reads correctly
without JavaScript.

## Keep it truthful

Every sentence on this page must be true of the TinyMails version on `main`.
If the product changes (defaults, pause reasons, API, what it does not do),
update the page in the same change, and run `npm test` here: the tests pin the
real strings and the real default run. Do not add features, integrations or
agent products that do not exist.

`public/agent-guide.md` and `src/content/agent-prompt.txt` are the agent guide and
the prompt the main button copies. `public/og.png`, `public/favicon.png` and
`public/apple-touch-icon.png` were rendered with headless Chrome from
`brand/og.html` and `brand/icon.html`.
