# Hero Section — Techniques 03 & 04

## 03 — Hero background with corner gradients

A warm off-white base with soft coloured radial gradient blobs anchored at the
corners. The centre stays near-white so text remains readable. The blobs read
as atmospheric light — warmth bleeding in from the edges — not as colour fields.

### CSS

```css
.hero-section {
  background-color: rgb(255, 252, 236); /* warm off-white — not pure #fff */
  background-image:
    radial-gradient(ellipse 55% 45% at 0% 0%,    rgba(233, 168, 210, 0.55) 0%, transparent 70%),
    radial-gradient(ellipse 50% 40% at 100% 0%,   rgba(253, 224, 132, 0.50) 0%, transparent 70%),
    radial-gradient(ellipse 45% 50% at 100% 100%, rgba(251, 146, 100, 0.40) 0%, transparent 65%),
    radial-gradient(ellipse 40% 35% at 0% 100%,   rgba(249, 168, 212, 0.25) 0%, transparent 60%);
}
```

### Colour palette

| Corner | Colour | RGBA |
|---|---|---|
| Top-left | Soft pink/lilac | `rgba(233, 168, 210, 0.55)` |
| Top-right | Warm pale yellow | `rgba(253, 224, 132, 0.50)` |
| Bottom-right | Peach/coral | `rgba(251, 146, 100, 0.40)` |
| Bottom-left | Faint blush | `rgba(249, 168, 212, 0.25)` |

### Rules

- End stops must be `transparent`, not `rgba(x,x,x,0)` — some browsers produce
  banding with the rgba form when the colour channels differ
- If blobs look garish, reduce opacity to `0.3–0.4` — the effect should be
  *barely* perceptible as colour, not saturated patches
- Blob spread: `45–55%` of container. Larger spreads blend together more;
  smaller leave a starker centre

### Dark mode adaptation

```css
@media (prefers-color-scheme: dark) {
  .hero-section {
    background-color: rgb(12, 12, 18);
    background-image:
      radial-gradient(ellipse 55% 45% at 0% 0%,    rgba(139, 92, 246, 0.25) 0%, transparent 70%),
      radial-gradient(ellipse 50% 40% at 100% 0%,   rgba(234, 179, 8,   0.15) 0%, transparent 70%),
      radial-gradient(ellipse 45% 50% at 100% 100%, rgba(249, 115, 22,  0.20) 0%, transparent 65%);
  }
}
```

### Tailwind / Next.js note

Tailwind can't express stacked `radial-gradient` `background-image` values without
arbitrary values that get unwieldy. Use an inline `style` prop instead:

```tsx
<section
  style={{
    backgroundColor: 'rgb(255, 252, 236)',
    backgroundImage: [
      'radial-gradient(ellipse 55% 45% at 0% 0%, rgba(233,168,210,0.55) 0%, transparent 70%)',
      'radial-gradient(ellipse 50% 40% at 100% 0%, rgba(253,224,132,0.50) 0%, transparent 70%)',
      'radial-gradient(ellipse 45% 50% at 100% 100%, rgba(251,146,100,0.40) 0%, transparent 65%)',
      'radial-gradient(ellipse 40% 35% at 0% 100%, rgba(249,168,212,0.25) 0%, transparent 60%)',
    ].join(', '),
  }}
>
```

---

## 04 — Typography hierarchy and spacing

Three reading levels: headline → subtitle → CTA. The spacing rhythm is
intentionally asymmetric — tight between headline and subtitle (they're one
thought), then a breath before the action.

### CSS

```css
/* Hero section layout */
.hero-section {
  padding-top: calc(var(--navbar-height, 52px) + 72px);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

/* Headline */
.hero-headline {
  font-size: clamp(28px, 4.5vw, 56px);
  font-weight: 700;
  line-height: 1;           /* tight — no extra leading */
  letter-spacing: -0.03em; /* mandatory at display sizes */
  color: rgb(0, 0, 0);
  margin: 0;
  padding: 0 24px;
  max-width: 800px;
}

/* Subtitle */
.hero-subtitle {
  font-size: clamp(16px, 2vw, 20px);
  font-weight: 400;
  line-height: 1.4;
  color: rgba(0, 0, 0, 0.65); /* opacity, not a hex grey */
  margin-top: 20px;
  margin-bottom: 0;
  max-width: 560px;
  padding: 0 24px;
}

/* Spacing wrappers */
.hero-cta-wrapper   { margin-top: 37px; }
.hero-image-wrapper { margin-top: 25px; }
```

### Spacing rhythm

```
Navbar bottom edge
  ↓ 72px   — hero section top padding (after navbar height)
Headline
  ↓ 20px   — tight, reads as one thought with subtitle
Subtitle
  ↓ 37px   — deliberate pause, signals "now act"
CTA pill
  ↓ 25px
Hero image (top edge)
```

### Rules

**Negative letter-spacing is mandatory on display fonts.** At large sizes, default
tracking looks too loose. `-0.02em` is the minimum; use `-0.04em` for text above 48px.

**`line-height: 1` for headlines.** At 1.5 they look double-spaced and weak.
`1.4–1.6` is correct for body/subtitle.

**Subtitle colour uses `rgba()`, not a hex grey.** `rgba(0,0,0,0.65)` adapts
correctly to any background colour underneath. A fixed hex grey like `#888` can
look wrong on warm or coloured backgrounds.

**Never centre-align text wider than ~600px.** The subtitle has `max-width: 560px`
and is centred within the section. Long centred lines feel unstable to read.

**`--navbar-height` as a CSS variable.** Set it in JS or hardcode it. The hero
`padding-top` must account for the fixed navbar or content will clip behind it.
