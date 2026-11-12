---
name: TinyMails
description: A quiet local workspace for careful Gmail campaigns.
colors:
  ink: "#292929"
  stage: "#f6f6f6"
  surface: "#fefefe"
  muted-text: "#6d6d6d"
  primary: "#305dde"
  focus: "#3ba6f1"
  secondary: "#e9e9e9"
typography:
  headline:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.15
  title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  sm: "6px"
  md: "8px"
  control: "10px"
  plate: "26px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  plate:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "24px"
---

# Design System: TinyMails

## Overview

**Creative North Star: "The careful outbox"**

Picture a founder at a bright desk reviewing a small campaign before lunch, looking for mistakes rather than stimulation. TinyMails uses a light, restrained workspace because the job is deliberate review. A quiet grey stage holds focused white surfaces, while a single blue accent marks the next safe action.

The interface rejects growth dashboards, newsletter-builder decoration, generic AI SaaS styling, and dense enterprise administration. Familiar controls, short copy, and visible sending constraints earn trust.

**Key Characteristics:**

- Restrained color with one operational accent.
- Compact, readable density built around lists and review states.
- Continuous-curvature plates for major work surfaces.
- Motion limited to navigation and state feedback.
- Local account and data ownership shown in context.

## Colors

The palette is ink-derived and nearly neutral. Blue is rare enough to retain meaning.

### Primary

- **Action blue:** Used for the single primary action, selected state, and progress that needs attention.
- **Focus sky:** Used only for visible keyboard focus rings.

### Neutral

- **Soft ink:** Primary text and icon color, tinted instead of pure black.
- **Paper surface:** Main plates and controls, tinted instead of pure white.
- **Quiet stage:** The workspace between plates and the inset background inside structured surfaces.
- **Working grey:** Secondary actions and selected navigation pills.
- **Muted ink:** Supporting copy, metadata, and inactive navigation.

**The One Blue Rule.** Use the primary accent on no more than ten percent of a view. It identifies action, selection, or state, never decoration.

**The Ink Mix Rule.** Borders and hover washes are transparent mixtures of ink. Do not introduce unrelated greys.

## Typography

**Display Font:** Geist Variable (with system sans fallback)
**Body Font:** Geist Variable (with system sans fallback)
**Label/Mono Font:** JetBrains Mono Variable for technical paths and identifiers only

**Character:** Geist keeps the product precise without making it cold. One family carries the application hierarchy; mono appears only where the value is genuinely technical.

### Hierarchy

- **Headline** (600, 32px, 1.15): Page titles and first-run milestones.
- **Title** (600, 18px, 1.35): Major section names and active campaign names.
- **Body** (400, 14px, 1.55): Interface copy, rows, and explanations. Prose stops at 70 characters per line.
- **Label** (500, 12px, 1.35): Metadata, filters, status labels, and compact controls.

**The Sentence Case Rule.** Controls and headings use sentence case. Uppercase is reserved for imported acronyms such as CSV and Gmail.

## Elevation

TinyMails is flat by default. Hairline borders and tonal layering establish structure. A resting shadow gives large plates definition; the floating shadow is reserved for navigation that must stay above scrolling content.

### Shadow Vocabulary

- **Resting** (`0 1px 2px rgba(0, 0, 0, 0.06)`): Large plates and inset work surfaces.
- **Floating** (`0 1px 2px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.08)`): The primary tab bar and transient anchored surfaces.

**The Binary Elevation Rule.** A surface is resting or floating. Do not invent intermediate shadow levels.

## Components

### Buttons

- **Shape:** Compact, gently curved controls (10px radius), with a physical one-pixel press state.
- **Primary:** Action blue with a restrained inset bevel. Keep one primary button per decision area.
- **Hover / Focus:** Color change only on hover; a three-pixel focus ring remains visible for keyboard users.
- **Secondary / Ghost:** Flat working grey for supporting actions, plain ink for tertiary actions.

### Chips

- **Style:** Neutral pill with a hairline border and muted text.
- **State:** Selected filters use working grey and full ink. Every state also has a text or icon cue.

### Cards / Containers

- **Corner Style:** Continuous-curvature squircle silhouette (26px small screens, 50px wider screens).
- **Background:** Paper surface frame with a quiet-stage inset where dense rows live.
- **Shadow Strategy:** Resting only.
- **Border:** One-pixel ink-derived hairline.
- **Internal Padding:** Four-pixel frame plus varied section spacing from 16px to 24px.

### Inputs / Fields

- **Style:** Paper surface, hairline stroke, compact control radius, and a minimum 36px height.
- **Focus:** Focus sky ring with a clear border shift.
- **Error / Disabled:** Error text and icon accompany color; disabled fields retain readable labels.

### Navigation

The fixed header keeps the wordmark, floating sibling tabs, account state, and Settings visible. The active tab has a shared travelling pill; reduced motion replaces travel with an immediate state change. On narrow screens, labels stay available to assistive technology and the controls remain comfortably tappable.

### Notice strip

A standing condition appears above the affected content. It contains one firm claim, one plain sentence, and at most one secondary action. It is not dismissible because resolving the condition removes it.

## Do's and Don'ts

### Do:

- **Do** make the next safe action visible without hiding limits or exclusions.
- **Do** use paper surfaces on the quiet stage and the primary blue only for operational meaning.
- **Do** keep focus states, status text, and keyboard navigation complete.
- **Do** use compact density for lists, review tables, and settings.
- **Do** respect reduced motion and preserve the same information without animation.

### Don't:

- **Don't** imitate growth-hacking dashboards that reward volume over judgment.
- **Don't** use newsletter-builder canvases, funnels, or vanity metrics.
- **Don't** use generic AI SaaS surfaces with purple gradients, glass panels, oversized metrics, or decorative motion.
- **Don't** bury the next action under enterprise-style navigation and configuration.
- **Don't** use gradient text, glassmorphism, colored side stripes, nested cards, or identical card grids.
- **Don't** invent bespoke greys, radii, shadows, or motion curves outside the defined vocabulary.
