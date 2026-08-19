# Full Composition — HTML Structure, Checklist & Framework Notes

## Complete HTML structure

```html
<div class="site-wrapper">

  <!-- ═══ NAVBAR ═══ -->
  <div class="navbar-wrapper">
    <nav class="navbar">
      <a href="/" class="nav-logo"><!-- logo --></a>
      <ul class="nav-links">
        <li><a href="/features">Features</a></li>
        <li><a href="/pricing">Pricing</a></li>
        <li><a href="/blog">Blog</a></li>
      </ul>
    </nav>

    <!-- Scallop: must be inside .navbar-wrapper so it positions against it -->
    <div class="scallop-wrapper">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 36"
           preserveAspectRatio="none" width="100%" height="36">
        <path
          d="M0,0 L1200,0 L1200,20
             Q1188,36 1176,20  Q1164,4  1152,20  Q1140,36 1128,20  Q1116,4  1104,20
             Q1092,36 1080,20  Q1068,4  1056,20  Q1044,36 1032,20  Q1020,4  1008,20
             Q996,36  984,20   Q972,4   960,20   Q948,36  936,20   Q924,4   912,20
             Q900,36  888,20   Q876,4   864,20   Q852,36  840,20   Q828,4   816,20
             Q804,36  792,20   Q780,4   768,20   Q756,36  744,20   Q732,4   720,20
             Q708,36  696,20   Q684,4   672,20   Q660,36  648,20   Q636,4   624,20
             Q612,36  600,20   Q588,4   576,20   Q564,36  552,20   Q540,4   528,20
             Q516,36  504,20   Q492,4   480,20   Q468,36  456,20   Q444,4   432,20
             Q420,36  408,20   Q396,4   384,20   Q372,36  360,20   Q348,4   336,20
             Q324,36  312,20   Q300,4   288,20   Q276,36  264,20   Q252,4   240,20
             Q228,36  216,20   Q204,4   192,20   Q180,36  168,20   Q156,4   144,20
             Q132,36  120,20   Q108,4   96,20    Q84,36   72,20    Q60,4    48,20
             Q36,36   24,20    Q12,4    0,20 Z"
          fill="rgb(49, 57, 251)" />
          <!-- ↑ copy-paste from navbar background-color -->
      </svg>
    </div>
  </div>

  <!-- ═══ HERO SECTION ═══ -->
  <section class="hero-section">

    <h1 class="hero-headline">Your headline goes here</h1>

    <p class="hero-subtitle">
      A one-line description that supports the headline without repeating it.
    </p>

    <div class="hero-cta-wrapper">
      <a href="/get-started" class="cta-pill">
        <img src="/your-app-icon.png" alt="Icon" class="cta-icon" />
        <span class="cta-label">Get Started →</span>
      </a>
    </div>

    <div class="hero-image-wrapper">
      <img src="/your-product-screenshot.png" alt="Product" class="hero-image" />
    </div>

  </section>

</div>
```

## Complete CSS

```css
/* ─── Reset ─── */
*, *::before, *::after { box-sizing: border-box; }

/* ─── Navbar wrapper ─── */
.navbar-wrapper {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  background-color: rgb(49, 57, 251);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}

.navbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 24px;
}

.navbar a { color: white; text-decoration: none; font-size: 15px; opacity: 0.9; }

/* ─── Scallop ─── */
.scallop-wrapper {
  position: absolute;
  bottom: -1px;
  left: 0; right: 0;
  line-height: 0;
  overflow: hidden;
  pointer-events: none;
}

/* ─── Hero section ─── */
.hero-section {
  padding-top: calc(var(--navbar-height, 52px) + 72px);
  background-color: rgb(255, 252, 236);
  background-image:
    radial-gradient(ellipse 55% 45% at 0% 0%,    rgba(233, 168, 210, 0.55) 0%, transparent 70%),
    radial-gradient(ellipse 50% 40% at 100% 0%,   rgba(253, 224, 132, 0.50) 0%, transparent 70%),
    radial-gradient(ellipse 45% 50% at 100% 100%, rgba(251, 146, 100, 0.40) 0%, transparent 65%),
    radial-gradient(ellipse 40% 35% at 0% 100%,   rgba(249, 168, 212, 0.25) 0%, transparent 60%);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

/* ─── Headline ─── */
.hero-headline {
  font-size: clamp(28px, 4.5vw, 56px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  color: rgb(0, 0, 0);
  margin: 0;
  padding: 0 24px;
  max-width: 800px;
}

/* ─── Subtitle ─── */
.hero-subtitle {
  font-size: clamp(16px, 2vw, 20px);
  font-weight: 400;
  line-height: 1.4;
  color: rgba(0, 0, 0, 0.65);
  margin-top: 20px;
  margin-bottom: 0;
  max-width: 560px;
  padding: 0 24px;
}

/* ─── CTA ─── */
.hero-cta-wrapper { margin-top: 37px; }

.cta-pill {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  text-decoration: none;
  border-radius: 22px;
  padding: 8px 22px 8px 8px;
  box-shadow: rgba(0, 0, 0, 0.25) 0px 2px 8px 0px;
  font-size: clamp(18px, 2vw, 24px);
  font-weight: 500;
  line-height: 1;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.cta-pill:hover {
  background: rgba(0, 0, 0, 0.92);
  box-shadow: rgba(0, 0, 0, 0.35) 0px 4px 14px 0px;
}

.cta-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  flex-shrink: 0;
  display: block;
}

/* ─── Hero image ─── */
.hero-image-wrapper {
  margin-top: 25px;
  width: 100%;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
  mask-image:         linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
}

.hero-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: 480px;
  object-fit: cover;
  object-position: top;
}
```

---

## Pre-ship checklist

- [ ] Scallop `fill` is copy-pasted from navbar `background-color` — not eyeballed
- [ ] `preserveAspectRatio="none"` is on the scallop `<svg>`
- [ ] `.scallop-wrapper` has `bottom: -1px` and `line-height: 0`
- [ ] `.hero-section` `padding-top` accounts for the fixed navbar height
- [ ] Headline `letter-spacing` is at least `-0.02em`
- [ ] Subtitle colour uses `rgba()`, not a hex grey
- [ ] CTA background is `rgba(0,0,0,0.85)` — not pure black
- [ ] Hero image wrapper has both `-webkit-mask-image` and `mask-image`
- [ ] Gradient blobs end in `transparent`, not `rgba(x,x,x,0)`
- [ ] On mobile: verify scallop bump width feels right at narrow viewports

---

## Common mistakes

**Scallop seam visible as thin line**
→ SVG `fill` doesn't exactly match navbar `background-color`. Must be identical.

**Scallop disappears at certain viewport widths**
→ Missing `preserveAspectRatio="none"`. Without it the SVG maintains aspect ratio.

**Hero image has hard bottom edge**
→ `mask-image` missing on the wrapper, or wrapper is missing `overflow: hidden`.

**Gradient blobs look saturated/garish**
→ Reduce opacity to `0.3–0.4`. They should read as warm light, not painted patches.

**Headline looks loose/spaced-out at large sizes**
→ Insufficient negative `letter-spacing`. Try `-0.04em` for very large display text.

**Content clips behind fixed navbar**
→ `padding-top` on body or first section must equal navbar height. Use `--navbar-height`.

---

## Framework notes

### React / JSX
The scallop SVG and all HTML works in JSX unchanged except `class` → `className`.

### Tailwind / Next.js
- Stacked `background-image` radial gradients → use inline `style` prop (see `hero-section.md`)
- CTA `rgba` hover states → use inline `onMouseEnter`/`onMouseLeave` (see `cta-and-image.md`)
- Everything else maps to Tailwind utilities

### Dark mode
```css
@media (prefers-color-scheme: dark) {
  .hero-section {
    background-color: rgb(12, 12, 18);
    /* Reduce blob opacity to 0.15–0.25 — see hero-section.md for values */
  }
}
```
The navbar and scallop keep their brand colour unchanged in dark mode.
