# TinyMails website

The one-page marketing site for TinyMails, "a Gmail outbox for your agent". It
is a static page built with [Astro](https://astro.build): HTML and CSS, the
design kit's small scripts, and one page script. No framework runs in the
browser, no analytics, and no request leaves the page.

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

## The page

`src/pages/index.astro` is the whole page, `src/styles/site.css` its own CSS,
`src/scripts/page.ts` its behaviour.

1. **Hero.** The headline, one line, two buttons, then one wide cobalt stage
   that tells the product left to right: the agent's 40 queued emails, the
   TinyMails window sending them (recipient rows turning to Sent, the count
   climbing), and Gmail, with tiny envelopes travelling one at a time. At 25 it
   pauses with the product's own reason and Start waits to be pressed; on wider
   screens the loop then starts again. It has the kit's pause button, a still
   picture without script or with reduced motion, and a stacked layout below
   1024px. A phone plays the last sends to the pause once and rests there.
2. **How it works** (the kit's `pinned-chapters` moment): four steps beside one
   frame, each picture playing as its step opens: the agent's request, the test
   the agent sends to your own address, Start pressed in the campaign row, and
   the queue counting to the cap and pausing. On tablets, phones and under
   reduced motion nothing is pinned and each step stands with its finished
   picture.
3. **Safety:** the four things TinyMails does not do, and a diagram where
   "Your computer" is one boundary and only the line to Gmail leaves it.
4. **Install:** the whole agent prompt in a code window (the main button copies
   `src/content/agent-prompt.txt`), and the commands to install by hand.
5. **Questions**, every answer open.
6. **The close and the footer** in one screen: the licence line, the main
   button, the name set large, the links.

The nav is a top bar that becomes a floating pill with the section in view and
its progress once the hero has scrolled away, and docks out of sight when the
close comes up. Both parts move by transform and opacity only, so nothing on
the page shifts.

## How the pictures are wired to the product

The hero and the fourth chapter are not mock-ups. They run TinyMails' own code
from `../src`, unmodified, imported through the `@product` alias (see
`aliases.mjs`):

- `src/server/campaign-runner.ts` (`CampaignRunner`) does the sending, the
  daily cap, the sending window, the delays and the pause reasons.
- `src/domain/campaigns.ts` (`createCampaign`, `renderMessage`) and
  `src/domain/leads.ts` (`mergeLeads`) play the agent's requests and produce the
  counts, the excluded addresses and the personalised test email.
- `src/gmail/fake-adapter.ts` stands in for Gmail. Nothing is sent.

What the site adds, in `src/sim/`:

- `world.ts`: in-memory repositories, the fake Gmail, a seeded random source and
  a virtual clock injected into the runner. The demo account uses UTC, so every
  visitor sees the same times.
- `controller.ts`: the Start gate, which in the product lives in the Express
  layer (`src/server/app.ts`): Start is refused until the test was sent, only a
  paused campaign starts, only a running one pauses.
- `session.ts`: one demo run and its status. It never presses Start by itself,
  because TinyMails does not. The page only listens to it; nothing in a
  listener calls Pause or Start.
- `format.ts`, `time.ts`, `demo-data.ts`: the rules line, clock times, and the
  example contacts (example.com, example.org, example.net addresses only).
- `crypto-shim.ts`: the browser stand-in for `node:crypto`'s `randomUUID`, the
  one Node import in the product code the demo uses.

The page is rendered at build time by the same code, so every number and status
on it reads correctly without JavaScript. The live runs replay the runner's real
30 to 45 second delays, sped up.

## Keep it truthful

Every sentence on this page must be true of the TinyMails version on `main`. If
the product changes (defaults, pause reasons, API, what it does not do), update
the page in the same change, and run `npm test` here: the tests pin the real
strings and the real default run. Do not add features, integrations or agent
products that do not exist.

`public/agent-guide.md` and `src/content/agent-prompt.txt` are the agent guide
and the prompt the main button copies. `public/og.png`, `public/favicon.png` and
`public/apple-touch-icon.png` were rendered with headless Chrome from
`brand/og.html` and `brand/icon.html`.

## Design kit

The layout system, motion layer, pinned-chapters moment, diagram, effect ground
and icons in `public/assets/` are copied unchanged from taste-skill 2.5.1. Its
build state is written to `.taste-skill/`, which git ignores. The icons'
sources and licences are listed in `public/assets/icons/icons-credits.json`.

taste-skill is under the MIT License:

```
MIT License

Copyright (c) 2026 Leonxlnx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
