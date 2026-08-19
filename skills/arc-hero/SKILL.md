---
name: arc-hero
description: >
  Implements Arc.net-style landing page hero sections and navigation UI. Use this skill whenever
  the user wants to build or style a landing page hero, navbar, or section divider with a
  tactile/layered editorial feel — including requests for: Arc-style design, textured navbars,
  scalloped/wavy section dividers, corner gradient hero backgrounds, sinking hero images with
  fade masks, or pill-shaped CTA buttons. Also trigger for any request to make a landing page
  look "premium", "editorial", "physical", or "like Arc". Apply all six techniques together for
  the full effect, or cherry-pick the individual ones the user asks for.
---

# Arc-Style Hero Design System

Six techniques reverse-engineered from Arc.net's live CSS. Every value is a calibrated
default extracted from the live page — not a guess. The goal is a layered, tactile,
editorial feel: things that look physical rather than flat.

The techniques are independent — apply all six for the full composition, or just the ones
the user asks for. When in doubt, offer the full set.

---

## The six techniques at a glance

| # | Technique | What it does |
|---|---|---|
| 01 | Textured navbar | Grainy noise overlay makes the bar feel like coloured card |
| 02 | Scallop divider | Wavy SVG bottom edge — navbar "bleeds" into bumps |
| 03 | Corner gradients | Soft colour blobs on warm off-white hero background |
| 04 | Typography + spacing | Tight headline, subordinate subtitle, exact rhythm |
| 05 | CTA pill button | Dark semi-transparent pill, optional icon, hover |
| 06 | Sinking image | Screenshot fades out at bottom via `mask-image` |

---

## Which reference file to read

Read only what the task requires — this keeps context lean.

| Task | Read |
|---|---|
| Navbar texture, scallop edge, or both | `references/navbar.md` |
| Hero background gradients or typography/spacing | `references/hero-section.md` |
| CTA pill button or hero image fade | `references/cta-and-image.md` |
| Full page composition, HTML structure, checklist, framework notes | `references/assembly.md` |
| User asks for "the whole thing" / full hero | Read all four |

---

## Key principles to carry through all implementations

**Exact values matter.** The numbers in the reference files aren't estimates — they're
what makes the Arc feel land. Swap brand colours freely; keep structural CSS exact.

**The scallop fill must exactly match the navbar `background-color`.** Even 1 RGB unit
off shows a visible seam. Always copy-paste the value, never eyeball it.

**Semi-transparent beats opaque.** The CTA uses `rgba(0,0,0,0.85)` not `#000` — it
picks up the hero gradient colours behind it and always looks like it belongs.

**`mask-image` not a pseudo-element overlay.** The image fade is a real CSS mask on the
wrapper, not a `::after` gradient on top. Both `-webkit-mask-image` and `mask-image`
are required (Safari prefix).

**Tailwind / React notes:** Stacked `radial-gradient` background-images need inline
`style` props in Tailwind (arbitrary values can't express multiple gradients cleanly).
The scallop SVG works in JSX with `class` → `className`. See `references/assembly.md`.
