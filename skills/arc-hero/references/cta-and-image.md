# CTA & Hero Image — Techniques 05 & 06

## 05 — CTA pill button

A large pill-shaped button with an optional app icon on the left. The semi-transparent
dark background is the key detail: it floats naturally above any hero gradient,
subtly picking up the colours behind it.

### HTML

```html
<a href="/get-started" class="cta-pill">
  <img src="/app-icon.png" alt="Icon" class="cta-icon" />
  <span class="cta-label">Get Started →</span>
</a>
```

### CSS

```css
.cta-pill {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.85); /* semi-transparent — not pure black */
  color: white;
  text-decoration: none;
  border-radius: 22px;
  padding: 8px 22px 8px 8px; /* tight left hugs the icon; generous right */
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
  border-radius: 12px; /* rounded-square — iOS/macOS app icon feel */
  flex-shrink: 0;
  display: block;
}
```

### Why `rgba(0,0,0,0.85)` and not pure black or brand colour?

- **Pure black** (`#000`) is harsh and looks flat against dark backgrounds
- **Brand colour** risks clashing with the corner gradient blobs
- **Semi-transparent dark** picks up the hue from whatever gradient sits behind it —
  on a warm cream background it reads as a very dark warm tone, not cold black

### Text-only variant (no icon)

```css
.cta-pill {
  padding: 14px 28px;
  border-radius: 100px;
  font-size: 18px;
}
/* Remove the .cta-icon element entirely */
```

### Next.js / Tailwind implementation

Tailwind can't express `rgba` hover states cleanly without arbitrary values.
Use inline `style` with `onMouseEnter`/`onMouseLeave`, or Tailwind arbitrary values:

```tsx
<Link
  href="/get-started"
  className="inline-flex items-center gap-3 rounded-[22px] font-medium leading-none
             transition-[background,box-shadow] duration-150 no-underline"
  style={{
    background: 'rgba(0,0,0,0.85)',
    color: 'white',
    padding: '8px 22px 8px 8px',
    fontSize: 'clamp(18px, 2vw, 24px)',
    boxShadow: 'rgba(0,0,0,0.25) 0px 2px 8px 0px',
  }}
  onMouseEnter={e => {
    e.currentTarget.style.background = 'rgba(0,0,0,0.92)';
    e.currentTarget.style.boxShadow = 'rgba(0,0,0,0.35) 0px 4px 14px 0px';
  }}
  onMouseLeave={e => {
    e.currentTarget.style.background = 'rgba(0,0,0,0.85)';
    e.currentTarget.style.boxShadow = 'rgba(0,0,0,0.25) 0px 2px 8px 0px';
  }}
>
  <Image src="/icon.png" alt="Icon" width={52} height={52}
         className="block shrink-0 rounded-xl" />
  <span>Get Started →</span>
</Link>
```

---

## 06 — Sinking hero image with mask fade

The product screenshot dissolves at the bottom — no hard edge, no drop shadow.
It appears to sink into the section below rather than sit on top of it.

The effect is a CSS `mask-image` on the wrapper, not a `::after` overlay.
These are different: a mask makes pixels genuinely transparent, so whatever
is behind the image shows through. A `::after` gradient overlay just covers the
bottom — it only works if you know the background colour in advance.

### HTML

```html
<div class="hero-image-wrapper">
  <img src="/product-screenshot.png" alt="Product" class="hero-image" />
</div>
```

### CSS

```css
.hero-image-wrapper {
  width: 100%;
  overflow: hidden;
  /* Both prefixes required — Safari needs -webkit- */
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
  mask-image:         linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
}

.hero-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: 480px;
  object-fit: cover;
  object-position: top; /* always show the top of a tall screenshot */
  /* No border-radius, no box-shadow — the mask does all the work */
}
```

### Tuning the fade

| Value | Effect |
|---|---|
| `black 40%, transparent 100%` | Aggressive — image mostly dissolves |
| `black 70%, transparent 100%` | Arc's default — balanced |
| `black 80%, transparent 100%` | Gentle — most of the image is visible |

### When the next section is a different colour

The mask fade means the bottom of the image blends into whatever colour is behind
it. If the next section uses a different background, the image will dissolve *into
that colour*, which is the intended effect. Make sure there's no gap between the
image wrapper and the next section.

### Showing only the top portion of a tall screenshot

```css
.hero-image-wrapper {
  max-height: 420px; /* clip total visible area */
}
.hero-image {
  object-fit: cover;
  object-position: top;
}
```
