# Navbar — Techniques 01 & 02

## 01 — Textured navbar with noise overlay

A grainy SVG noise pattern layered over the brand colour makes the navbar feel like
a physical piece of coloured card rather than a flat rectangle. Two `background`
layers on one element: noise on top, solid colour below.

### CSS

```css
.navbar-wrapper {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  background-color: rgb(49, 57, 251); /* ← swap for brand colour */
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}

.navbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 24px;
}

.navbar a {
  color: white;
  text-decoration: none;
  font-size: 15px;
  opacity: 0.9;
}
```

### Key values

| Property | Value | Notes |
|---|---|---|
| Noise opacity | `0.08` | 0.08–0.12 sweet spot. Higher = rough/dirty, lower = imperceptible |
| Tile size | `200px 200px` | Matches the SVG viewBox — tiles seamlessly |
| Padding | `14px 24px` | Arc's exact nav padding |

### Why SVG noise over a PNG?

No external file needed. The SVG data URI is self-contained, works offline,
and the `stitchTiles="stitch"` attribute makes it tile seamlessly without seams.

---

## 02 — Scallop / cutout section divider

An SVG absolutely positioned at the bottom of the navbar wrapper. The path fill
is **identical** to the navbar `background-color` — it looks like the navbar
itself has a scalloped hem rather than a separate decoration sitting below it.

The scallop also inherits the noise texture for free: because the SVG fill
matches the solid `background-color`, the tiling noise pattern from the navbar
visually continues through it.

### HTML

```html
<!-- Place inside .navbar-wrapper, after <nav> -->
<div class="scallop-wrapper">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 36"
       preserveAspectRatio="none" width="100%" height="36">
    <path d="M0,0 L1200,0 L1200,20
      Q1188,36 1176,20  Q1164,4  1152,20
      Q1140,36 1128,20  Q1116,4  1104,20
      Q1092,36 1080,20  Q1068,4  1056,20
      Q1044,36 1032,20  Q1020,4  1008,20
      Q996,36  984,20   Q972,4   960,20
      Q948,36  936,20   Q924,4   912,20
      Q900,36  888,20   Q876,4   864,20
      Q852,36  840,20   Q828,4   816,20
      Q804,36  792,20   Q780,4   768,20
      Q756,36  744,20   Q732,4   720,20
      Q708,36  696,20   Q684,4   672,20
      Q660,36  648,20   Q636,4   624,20
      Q612,36  600,20   Q588,4   576,20
      Q564,36  552,20   Q540,4   528,20
      Q516,36  504,20   Q492,4   480,20
      Q468,36  456,20   Q444,4   432,20
      Q420,36  408,20   Q396,4   384,20
      Q372,36  360,20   Q348,4   336,20
      Q324,36  312,20   Q300,4   288,20
      Q276,36  264,20   Q252,4   240,20
      Q228,36  216,20   Q204,4   192,20
      Q180,36  168,20   Q156,4   144,20
      Q132,36  120,20   Q108,4   96,20
      Q84,36   72,20    Q60,4    48,20
      Q36,36   24,20    Q12,4    0,20 Z"
      fill="rgb(49, 57, 251)" />
      <!-- ↑ MUST be copy-pasted from navbar background-color — never eyeball it -->
  </svg>
</div>
```

### CSS

```css
.scallop-wrapper {
  position: absolute;
  bottom: -1px;       /* -1px prevents hairline gap on high-DPI screens */
  left: 0; right: 0;
  line-height: 0;     /* removes default inline-element gap below SVGs */
  overflow: hidden;
  pointer-events: none;
}
```

### How the path works

Each bump is a pair of quadratic bezier `Q` commands:
- `Q cx,36 ex,20` → hill (control point below baseline)
- `Q cx,4  ex,20` → valley (control point above baseline)

Alternating these across the full width creates the scallop wave.

### Tuning

| Goal | Change |
|---|---|
| Wider bumps | Increase x-spacing between Q pairs (default: 24px) |
| Deeper bumps | Raise first `cy` value: `36` = deep, lower = shallower |
| Taller divider | Increase `viewBox` height and wrapper `height` attribute |
| Fewer bumps | Remove Q pairs — always remove in pairs to keep symmetry |

### Non-negotiable details

- `fill` must **exactly** match `background-color` — copy-paste, don't eyeball
- `preserveAspectRatio="none"` — without it the SVG won't stretch to full width
- `bottom: -1px` — closes sub-pixel rendering gaps
- `line-height: 0` — removes the default gap browsers add below inline SVGs
- `pointer-events: none` — scallop must not intercept clicks on content below
