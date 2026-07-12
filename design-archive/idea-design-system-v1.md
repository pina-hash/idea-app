# IDEA Design System — v1 (archived 2026-07-11)

The original **IDEA Green** program theme, captured verbatim from `src/app.css`
before the v2 machined-palette rollout. This is a paper trail only; it is not
imported anywhere and does not affect the portal.

The v1 aesthetic was an electric neon palette (pure `#00FF41` green on
near-black `#020A04`) with hot, high-alpha glows. v2 replaces it with a muted,
machined palette (desaturated sage-green metal surfaces, bone letterforms, soft
mint rim-light) while keeping the same CSS custom-property names.

## v1 `:root` token block

```css
:root {
	/* Backgrounds */
	--bg0: #020a04; /* page base */
	--bg1: #050f07; /* cards and panels */
	--bg2: #081209; /* header bars and input fields */

	/* Semantic colors (fixed roles) */
	--green: #00ff41; /* primary: key labels, glows, success, active */
	--gold: #c8ff00; /* secondary accent: special callouts */
	--cyan: #00f0ff; /* informational: timestamps, version, role/metadata */
	--amber: #ff8c00; /* warning */
	--teal: #00aa88; /* in-progress */
	--violet: #5500aa; /* special, sparingly */
	--white: #e8ffe8; /* body text (not pure white) */
	--dim: #4a7a52; /* dim text, placeholders, secondary labels */
	--ice: #88ddff; /* disabled / not-yet-started */

	/* Glows */
	--glow-green: 0 0 10px rgba(0, 255, 65, 0.8), 0 0 28px rgba(0, 255, 65, 0.3);
	--glow-gold: 0 0 10px rgba(200, 255, 0, 0.8), 0 0 28px rgba(200, 255, 0, 0.3);
	--glow-cyan: 0 0 10px rgba(0, 240, 255, 0.8), 0 0 28px rgba(0, 240, 255, 0.3);

	/* Hairlines */
	--line: rgba(0, 255, 65, 0.15);
	--line-strong: rgba(0, 255, 65, 0.35);

	--font-display: 'Rajdhani', sans-serif;
	--font-mono: 'Share Tech Mono', monospace;
}
```
