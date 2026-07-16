/* @ds-bundle: {"format":4,"namespace":"IDEADesignSystem_77ae16","components":[{"name":"AnimatedLogo","sourcePath":"components/brand/AnimatedLogo.jsx"},{"name":"DeckFooter","sourcePath":"components/brand/DeckFooter.jsx"},{"name":"GearMark","sourcePath":"components/brand/GearMark.jsx"},{"name":"PlatePanel","sourcePath":"components/brand/PlatePanel.jsx"},{"name":"PlateTitle","sourcePath":"components/brand/PlateTitle.jsx"},{"name":"SlashAccent","sourcePath":"components/brand/SlashAccent.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Divider","sourcePath":"components/core/Divider.jsx"},{"name":"Eyebrow","sourcePath":"components/core/Eyebrow.jsx"},{"name":"Wordmark","sourcePath":"components/core/Wordmark.jsx"},{"name":"Badge","sourcePath":"components/data/Badge.jsx"},{"name":"Chip","sourcePath":"components/data/Chip.jsx"},{"name":"Field","sourcePath":"components/data/Field.jsx"},{"name":"LeaderboardTable","sourcePath":"components/data/LeaderboardTable.jsx"},{"name":"StatBlock","sourcePath":"components/data/StatBlock.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Callout","sourcePath":"components/surfaces/Callout.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"ChallengeRow","sourcePath":"components/surfaces/ChallengeRow.jsx"},{"name":"ImageFrame","sourcePath":"components/surfaces/ImageFrame.jsx"},{"name":"ModeCard","sourcePath":"components/surfaces/ModeCard.jsx"},{"name":"ProcessPipeline","sourcePath":"components/surfaces/ProcessPipeline.jsx"},{"name":"ResultBanner","sourcePath":"components/surfaces/ResultBanner.jsx"}],"sourceHashes":{"components/brand/AnimatedLogo.jsx":"a233214b3ec7","components/brand/DeckFooter.jsx":"3f62ae56ef4e","components/brand/GearMark.jsx":"def9dc6ffafd","components/brand/PlatePanel.jsx":"661043052528","components/brand/PlateTitle.jsx":"1bfc5e46a4e7","components/brand/SlashAccent.jsx":"ba5717bd454a","components/core/Button.jsx":"601b5864c88a","components/core/Divider.jsx":"b3cef974384b","components/core/Eyebrow.jsx":"3e6adfa96deb","components/core/Wordmark.jsx":"8d92b8fb38e0","components/data/Badge.jsx":"9c3b8e9d25e3","components/data/Chip.jsx":"910dddfc1196","components/data/Field.jsx":"2d131518b0ec","components/data/LeaderboardTable.jsx":"71465a3bed26","components/data/StatBlock.jsx":"f7c48cad67cd","components/forms/Input.jsx":"e9fd8af6c445","components/forms/Select.jsx":"6611dab95598","components/surfaces/Callout.jsx":"39178f474746","components/surfaces/Card.jsx":"46b2069ae644","components/surfaces/ChallengeRow.jsx":"e53864c657ed","components/surfaces/ImageFrame.jsx":"1c32b6f5545c","components/surfaces/ModeCard.jsx":"9df0950fd82c","components/surfaces/ProcessPipeline.jsx":"af19d2320e47","components/surfaces/ResultBanner.jsx":"c2d13b5542a3"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.IDEADesignSystem_77ae16 = window.IDEADesignSystem_77ae16 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/AnimatedLogo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA AnimatedLogo — the full emblem lockup with a live rotating gear.
 * Layers the isolated gear (assets/idea-gear.png) behind the isolated
 * text plate (assets/idea-logo-text.png) at the exact positions from the
 * source logo (2560×1204 canvas, gear 1202×1202 at 0,0). Rotation is
 * gated behind prefers-reduced-motion.
 */
function AnimatedLogo({
  width = 480,
  spin = true,
  duration = 24,
  srcText = 'assets/idea-logo-text.png',
  srcGear = 'assets/idea-gear.png',
  style = {},
  ...rest
}) {
  const w = typeof width === 'string' && /^\d+$/.test(width.trim()) ? Number(width) : width;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      width: w,
      aspectRatio: '2560 / 1204',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("img", {
    src: srcGear,
    alt: "",
    "aria-hidden": "true",
    className: spin ? 'ds-anim-spin' : undefined,
    style: {
      position: 'absolute',
      left: 0,
      top: '-1.2%',
      width: '46.95%',
      height: 'auto',
      animationDuration: duration + 's'
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: srcText,
    alt: "IDEA",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%'
    }
  }));
}
Object.assign(__ds_scope, { AnimatedLogo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/AnimatedLogo.jsx", error: String((e && e.message) || e) }); }

// components/brand/DeckFooter.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const pad = (n, w) => String(n).padStart(w, '0');

/**
 * IDEA DeckFooter — the machined drawing-block that runs along the bottom of a
 * deck slide: "IDEA // <DECK> · <TERM>" on the left, a centered mini
 * AnimatedLogo, and a "DWG 00N / 0NN · REV A" drawing number on the right.
 * Absolutely positioned by default (drop it as the last child of a slide).
 */
function DeckFooter({
  deck = 'DECK',
  term = '',
  dwg = 1,
  total = 1,
  rev = 'A',
  logo = true,
  logoWidth = 118,
  srcText = './idea-logo-text.png',
  srcGear = './idea-gear.png',
  style = {},
  ...rest
}) {
  const showLogo = logo !== false && logo !== 'false';
  const left = term ? `IDEA // ${deck} · ${term}` : `IDEA // ${deck}`;
  const right = `DWG ${pad(Number(dwg), 3)} / ${pad(Number(total), 3)} · REV ${rev}`;
  const w = Number(logoWidth);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'absolute',
      left: 90,
      right: 90,
      bottom: 38,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontFamily: 'var(--font-mono)',
      fontSize: 24,
      letterSpacing: '0.12em',
      color: 'var(--dim)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", null, left), showLogo && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: w,
      opacity: 0.92,
      filter: 'drop-shadow(0 0 10px rgba(143,224,138,0.22))'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.AnimatedLogo, {
    width: w,
    srcText: srcText,
    srcGear: srcGear
  })), /*#__PURE__*/React.createElement("span", null, right));
}
Object.assign(__ds_scope, { DeckFooter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/DeckFooter.jsx", error: String((e && e.message) || e) }); }

// components/brand/GearMark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA GearMark — the actual gear from the emblem (transparent PNG cutout,
 * assets/idea-gear.png). Decorative: corner watermarks, dividers, spinners.
 * `spin` turns it slowly (reduced-motion safe); pass `src` with the correct
 * relative path to assets/idea-gear.png from the consuming page.
 */
function GearMark({
  size = 96,
  spin = false,
  src = 'assets/idea-gear.png',
  className = '',
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("img", _extends({
    src: src,
    alt: "",
    "aria-hidden": "true",
    width: size,
    height: size,
    className: (spin ? 'ds-anim-spin ' : '') + className,
    style: {
      display: 'block',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { GearMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/GearMark.jsx", error: String((e && e.message) || e) }); }

// components/brand/PlatePanel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA PlatePanel — the emblem's chamfered octagonal plate as a surface.
 * Dark plate fill inside a mint rim that follows the chamfer. Use for hero
 * sections, featured cards, and anywhere the emblem geometry should lead.
 */
function PlatePanel({
  children,
  chamfer = 16,
  rim = true,
  scan = false,
  padding = '2rem',
  style = {},
  ...rest
}) {
  const c = chamfer;
  const shape = `polygon(${c}px 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, ${c}px 100%, 0 calc(100% - ${c}px), 0 ${c}px)`;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      clipPath: shape,
      background: rim ? 'rgba(143,224,138,0.55)' : 'var(--edge)',
      padding: rim ? 2 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      clipPath: shape,
      background: 'var(--plate)',
      boxShadow: 'var(--bevel-inset)',
      padding,
      position: 'relative',
      overflow: 'hidden'
    }
  }, children, scan && /*#__PURE__*/React.createElement("div", {
    className: "ds-anim-scan-once",
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: '40%',
      background: 'linear-gradient(90deg, transparent, rgba(143,224,138,0.07), rgba(143,224,138,0.16), transparent)',
      pointerEvents: 'none'
    }
  })));
}
Object.assign(__ds_scope, { PlatePanel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/PlatePanel.jsx", error: String((e && e.message) || e) }); }

// components/brand/PlateTitle.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA PlateTitle — display text in the emblem's letterform treatment:
 * bone Chakra Petch with a dark machined edge, emboss drop, and a faint
 * mint halo. For big headings on plate/dark surfaces.
 */
function PlateTitle({
  children,
  size = '3rem',
  as = 'div',
  style = {},
  ...rest
}) {
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      fontFamily: 'var(--font-hero)',
      fontWeight: 700,
      letterSpacing: 'var(--track-hero)',
      textTransform: 'uppercase',
      color: 'var(--white)',
      WebkitTextStroke: '1px rgba(13,18,12,0.6)',
      textShadow: '0 2px 0 rgba(13,18,12,0.85), 0 4px 8px rgba(0,0,0,0.5), 0 0 18px rgba(143,224,138,0.3)',
      fontSize: size,
      lineHeight: 1.05,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { PlateTitle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/PlateTitle.jsx", error: String((e && e.message) || e) }); }

// components/brand/SlashAccent.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA SlashAccent — the emblem's closing `//` slash as a typographic mark.
 * Mono, skewed, mint with a soft halo. The house punctuation for headings,
 * dividers, and lockups (`IDEA // GAUNTLET`).
 */
function SlashAccent({
  color = 'var(--green)',
  size = '1em',
  flicker = false,
  className = '',
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    "aria-hidden": "true",
    className: (flicker ? 'ds-anim-flicker ' : '') + className,
    style: {
      display: 'inline-block',
      fontFamily: 'var(--font-mono)',
      color,
      textShadow: 'var(--glow-green)',
      transform: 'skewX(-12deg)',
      fontSize: size,
      lineHeight: 1,
      ...style
    }
  }, rest), "//");
}
Object.assign(__ds_scope, { SlashAccent });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/SlashAccent.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Button — mono, uppercase, letter-spaced. Ghost by default (transparent
 * with a rim-light border); fills with its accent color and glows on hover.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  as = 'button',
  disabled = false,
  style = {},
  ...rest
}) {
  const accents = {
    primary: 'var(--green)',
    secondary: 'var(--dim)',
    danger: 'var(--amber)'
  };
  const glows = {
    primary: 'var(--glow-green)',
    secondary: 'var(--glow-green)',
    danger: 'none'
  };
  const accent = accents[variant] || accents.primary;
  const sizes = {
    sm: {
      padding: '0.45rem 0.9rem',
      fontSize: '0.72rem'
    },
    md: {
      padding: '0.7rem 1.3rem',
      fontSize: '0.82rem'
    },
    lg: {
      padding: '0.9rem 1.8rem',
      fontSize: '0.9rem'
    }
  };
  const [hover, setHover] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const filled = hover && !disabled;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    border: `1px solid ${disabled ? 'var(--ice)' : accent}`,
    borderRadius: 'var(--radius-control)',
    background: filled ? variant === 'danger' ? 'rgba(217,154,85,0.08)' : accent : 'transparent',
    color: filled && variant !== 'danger' ? 'var(--bg0)' : disabled ? 'var(--ice)' : variant === 'secondary' && !hover ? 'var(--white)' : accent,
    boxShadow: pressed && !disabled ? 'var(--bevel-inset)' : filled && variant !== 'danger' ? glows[variant] : 'none',
    transform: pressed && !disabled ? 'translateY(1px)' : 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    textDecoration: 'none',
    transition: 'background 0.2s, color 0.2s, box-shadow 0.2s, border-color 0.2s',
    ...sizes[size],
    ...style
  };
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: base,
    disabled: as === 'button' ? disabled : undefined,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPressed(false);
    },
    onMouseDown: () => setPressed(true),
    onMouseUp: () => setPressed(false)
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Divider.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Divider — a labeled section rule: two hairlines flanking a centered
 * mono label. The label is prefixed with the "//" motif in green.
 */
function Divider({
  label,
  style = {},
  ...rest
}) {
  const line = {
    flex: 1,
    height: 1,
    background: 'var(--line)'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      margin: '2rem 0',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: line
  }), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-label)',
      letterSpacing: 'var(--track-label)',
      textTransform: 'uppercase',
      color: 'var(--dim)',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--green)',
      textShadow: 'var(--glow-green)'
    }
  }, "// "), label), /*#__PURE__*/React.createElement("div", {
    style: line
  }));
}
Object.assign(__ds_scope, { Divider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Divider.jsx", error: String((e && e.message) || e) }); }

// components/core/Eyebrow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Eyebrow — mono, uppercase, wide-tracked kicker label. Cyan by default
 * (metadata voice). Sits above headings and section titles.
 */
function Eyebrow({
  children,
  color = 'cyan',
  style = {},
  ...rest
}) {
  const map = {
    cyan: {
      color: 'var(--cyan)',
      textShadow: 'var(--glow-cyan)'
    },
    green: {
      color: 'var(--green)',
      textShadow: 'var(--glow-green)'
    },
    gold: {
      color: 'var(--gold)',
      textShadow: 'var(--glow-gold)'
    },
    dim: {
      color: 'var(--dim)',
      textShadow: 'none'
    }
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-label)',
      letterSpacing: 'var(--track-wide)',
      textTransform: 'uppercase',
      ...map[color],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/core/Wordmark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Wordmark — the stylized "IDEA" lettering: bone letterforms with a
 * soft mint rim-light, straight off the emblem. Chakra Petch for hero,
 * Rajdhani when compact. The full emblem PNG lives at assets/idea-logo.png.
 */
function Wordmark({
  size = '1.6rem',
  hero = false,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      fontFamily: hero ? 'var(--font-hero)' : 'var(--font-display)',
      fontWeight: 700,
      letterSpacing: hero ? 'var(--track-hero)' : '0.28em',
      textTransform: 'uppercase',
      color: 'var(--white)',
      textShadow: 'var(--glow-green)',
      fontSize: size,
      whiteSpace: 'nowrap',
      lineHeight: 1,
      ...style
    }
  }, rest), "IDEA");
}
Object.assign(__ds_scope, { Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Wordmark.jsx", error: String((e && e.message) || e) }); }

// components/data/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Badge — a small mono uppercase status pill with a hairline border.
 * Colored by status role (live/success, soon, warning, draft, info, dim).
 */
function Badge({
  children,
  tone = 'live',
  style = {},
  ...rest
}) {
  const tones = {
    live: {
      color: 'var(--green)',
      border: 'var(--green)'
    },
    success: {
      color: 'var(--green)',
      border: 'var(--green)'
    },
    soon: {
      color: 'var(--ice)',
      border: 'rgba(136,221,255,0.25)'
    },
    warning: {
      color: 'var(--amber)',
      border: 'rgba(217,154,85,0.4)'
    },
    draft: {
      color: 'var(--amber)',
      border: 'rgba(217,154,85,0.4)'
    },
    info: {
      color: 'var(--cyan)',
      border: 'rgba(147,214,200,0.3)'
    },
    dim: {
      color: 'var(--dim)',
      border: 'var(--line)'
    }
  };
  const t = tones[tone] || tones.live;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-micro)',
      letterSpacing: 'var(--track-label)',
      textTransform: 'uppercase',
      padding: '0.15rem 0.5rem',
      borderRadius: 'var(--radius-chip)',
      border: `1px solid ${t.border}`,
      color: t.color,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Chip — difficulty / pathway identity chip. A mono uppercase pill that
 * can carry a leading dot or an inline lucide-style icon. Difficulty escalates
 * green → gold → amber. Pathway mode takes an explicit identity color.
 */
function Chip({
  children,
  difficulty,
  color,
  icon,
  style = {},
  ...rest
}) {
  let accent = 'var(--green)';
  let border = 'var(--line-strong)';
  if (difficulty != null) {
    if (difficulty >= 4) {
      accent = 'var(--amber)';
      border = 'rgba(217,154,85,0.4)';
    } else if (difficulty === 3) {
      accent = 'var(--gold)';
      border = 'rgba(211,198,142,0.35)';
    }
  }
  if (color) {
    accent = color;
    border = color;
  }
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-micro)',
      letterSpacing: 'var(--track-label)',
      textTransform: 'uppercase',
      padding: '0.15rem 0.5rem',
      borderRadius: 'var(--radius-chip)',
      border: `1px solid ${border}`,
      color: accent,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: '0.85em',
      height: '0.85em'
    }
  }, icon), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Chip.jsx", error: String((e && e.message) || e) }); }

// components/data/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Field — a key/value row. Mono uppercase green key on the left, value on
 * the right. `meta` renders the value in glowing cyan (timestamps, versions).
 */
function Field({
  label,
  value,
  meta = false,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: '1rem',
      padding: '0.6rem 0',
      borderBottom: '1px solid var(--line)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-label)',
      letterSpacing: 'var(--track-label)',
      textTransform: 'uppercase',
      color: 'var(--green)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: meta ? 'var(--cyan)' : 'var(--white)',
      fontFamily: meta ? 'var(--font-mono)' : 'var(--font-display)',
      textShadow: meta ? 'var(--glow-cyan)' : 'none'
    }
  }, value));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Field.jsx", error: String((e && e.message) || e) }); }

// components/data/LeaderboardTable.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA LeaderboardTable — the dojo standings table. Mono uppercase green
 * headers on a strong hairline; rows separated by hairlines; numeric columns
 * in cyan mono; the current player's row tinted green with a "YOU" tag.
 */
function LeaderboardTable({
  columns = [],
  rows = [],
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("table", _extends({
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.9rem',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      textAlign: c.align || 'left',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.62rem',
      letterSpacing: 'var(--track-label)',
      textTransform: 'uppercase',
      color: 'var(--green)',
      padding: '0.5rem 0.75rem',
      borderBottom: '1px solid var(--line-strong)',
      whiteSpace: 'nowrap'
    }
  }, c.label)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      background: r.me ? 'rgba(143,224,138,0.06)' : 'transparent'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      padding: '0.55rem 0.75rem',
      borderBottom: '1px solid var(--line)',
      textAlign: c.align || 'left',
      color: c.numeric ? 'var(--cyan)' : 'var(--white)',
      fontFamily: c.numeric ? 'var(--font-mono)' : 'var(--font-display)'
    }
  }, r[c.key], c.key === (columns[1] && columns[1].key) && r.me && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.56rem',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--bg0)',
      background: 'var(--green)',
      padding: '0.1rem 0.35rem',
      borderRadius: 'var(--radius-chip)',
      marginLeft: '0.5rem'
    }
  }, "You")))))));
}
Object.assign(__ds_scope, { LeaderboardTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/LeaderboardTable.jsx", error: String((e && e.message) || e) }); }

// components/data/StatBlock.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA StatBlock — an oversized glowing number over a mono micro label. The
 * hero-stat unit. Color picks the accent (green / gold / cyan).
 */
function StatBlock({
  value,
  label,
  color = 'green',
  breathe = false,
  style = {},
  ...rest
}) {
  const map = {
    green: {
      color: 'var(--green)',
      textShadow: 'var(--glow-green)'
    },
    gold: {
      color: 'var(--gold)',
      textShadow: 'var(--glow-gold)'
    },
    cyan: {
      color: 'var(--cyan)',
      textShadow: 'var(--glow-cyan)'
    },
    white: {
      color: 'var(--white)',
      textShadow: 'none'
    }
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.2rem',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: breathe && color === 'green' ? 'ds-anim-breathe' : undefined,
    style: {
      fontFamily: 'var(--font-hero)',
      fontWeight: 700,
      fontSize: '1.6rem',
      lineHeight: 1,
      ...map[color]
    }
  }, value), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-micro)',
      letterSpacing: 'var(--track-label)',
      textTransform: 'uppercase',
      color: 'var(--dim)'
    }
  }, label));
}
Object.assign(__ds_scope, { StatBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatBlock.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Input — a labeled text field. Mono uppercase green label over a dark
 * bg2 field with a strong hairline that lights cyan (+ glow) on focus. Set
 * `unit` for a trailing unit cell (mm, g). `as="textarea"` for multiline.
 */
function Input({
  label,
  unit,
  help,
  as = 'input',
  style = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const Tag = as;
  const isArea = as === 'textarea';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.3rem',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.66rem',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--green)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      border: `1px solid ${focus ? 'var(--cyan)' : 'var(--line-strong)'}`,
      borderRadius: 'var(--radius-control)',
      background: 'var(--bg2)',
      overflow: 'hidden',
      boxShadow: focus ? 'var(--glow-cyan)' : 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s'
    }
  }, /*#__PURE__*/React.createElement(Tag, _extends({
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    rows: isArea ? 4 : undefined,
    style: {
      flex: 1,
      minWidth: 0,
      background: 'transparent',
      border: 0,
      outline: 'none',
      color: 'var(--white)',
      fontFamily: isArea ? 'var(--font-mono)' : 'var(--font-display)',
      fontSize: isArea ? '0.85rem' : '1rem',
      lineHeight: isArea ? 1.5 : 1.2,
      padding: '0.5rem 0.7rem',
      resize: isArea ? 'vertical' : undefined
    }
  }, rest)), unit && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '0 0.9rem',
      background: 'var(--bg1)',
      borderLeft: '1px solid var(--line)',
      fontFamily: 'var(--font-mono)',
      color: 'var(--cyan)',
      fontSize: '0.85rem'
    }
  }, unit)), help && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.78rem',
      color: 'var(--dim)',
      lineHeight: 1.5
    }
  }, help));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Select — a labeled dropdown matching the Input chrome. Mono uppercase
 * green label; the control uses mono type and a strong hairline that lights
 * cyan on focus.
 */
function Select({
  label,
  options = [],
  help,
  style = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.3rem',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.66rem',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--green)'
    }
  }, label), /*#__PURE__*/React.createElement("select", _extends({
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: '100%',
      background: 'var(--bg2)',
      border: `1px solid ${focus ? 'var(--cyan)' : 'var(--line-strong)'}`,
      borderRadius: 'var(--radius-control)',
      color: 'var(--white)',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.9rem',
      padding: '0.5rem 0.7rem',
      outline: 'none',
      boxShadow: focus ? 'var(--glow-cyan)' : 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s'
    }
  }, rest), options.map(o => {
    const value = typeof o === 'string' ? o : o.value;
    const label2 = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: value,
      value: value,
      style: {
        background: 'var(--bg2)'
      }
    }, label2);
  })), help && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.78rem',
      color: 'var(--dim)',
      lineHeight: 1.5
    }
  }, help));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Callout.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Callout — the gradient promo strip. A faint gold→cyan diagonal wash
 * inside a strong hairline; gold mono title, dim sub, and a right-aligned CTA
 * pill. Brightens on hover.
 */
function Callout({
  title,
  sub,
  cta,
  icon,
  as = 'a',
  style = {},
  ...rest
}) {
  const [h, setH] = React.useState(false);
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1.5rem',
      flexWrap: 'wrap',
      background: h ? 'linear-gradient(135deg, rgba(211,198,142,0.12) 0%, rgba(147,214,200,0.08) 100%)' : 'linear-gradient(135deg, rgba(211,198,142,0.07) 0%, rgba(147,214,200,0.05) 100%)',
      border: `1px solid ${h ? 'rgba(211,198,142,0.7)' : 'var(--line-strong)'}`,
      borderRadius: 'var(--radius-card)',
      padding: '1.2rem 1.6rem',
      textDecoration: 'none',
      transition: 'border-color 0.2s, background 0.2s',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '1.2rem'
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-hero)',
      fontSize: '2rem',
      fontWeight: 700,
      color: 'var(--gold)',
      textShadow: 'var(--glow-gold)',
      lineHeight: 1
    }
  }, icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.78rem',
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--gold)',
      textShadow: 'var(--glow-gold)',
      marginBottom: '0.25rem'
    }
  }, title), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '0.9rem',
      color: 'var(--dim)'
    }
  }, sub))), cta && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.62rem',
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--gold)',
      border: '1px solid rgba(211,198,142,0.4)',
      padding: '0.35rem 0.9rem',
      borderRadius: 'var(--radius-chip)',
      whiteSpace: 'nowrap'
    }
  }, cta));
}
Object.assign(__ds_scope, { Callout });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Callout.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA Card — the base panel. Dark plate surface, hairline border, 4px radius,
 * machined bevel. `hover` adds the lift + border-brighten interaction used by
 * clickable cards.
 */
function Card({
  children,
  hover = false,
  as = 'div',
  style = {},
  ...rest
}) {
  const [h, setH] = React.useState(false);
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    onMouseEnter: hover ? () => setH(true) : undefined,
    onMouseLeave: hover ? () => setH(false) : undefined,
    style: {
      background: 'var(--bg1)',
      border: `1px solid ${h ? 'var(--line-strong)' : 'var(--line)'}`,
      borderRadius: 'var(--radius-card)',
      padding: '1.5rem',
      transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
      transform: h ? 'translateY(-2px)' : 'none',
      boxShadow: h ? 'var(--bevel-raised), 0 0 0 1px rgba(143,224,138,0.15)' : 'var(--bevel-raised)',
      textDecoration: 'none',
      display: 'block',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ChallengeRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA ChallengeRow — a list row for a challenge/assignment. A circular state
 * token (done/tried/todo) on the left, a title + mono meta line in the middle,
 * and a mono "go" affordance on the right. Nudges right on hover.
 */
function ChallengeRow({
  state = 'todo',
  title,
  meta = [],
  go = 'Start',
  as = 'a',
  style = {},
  ...rest
}) {
  const [h, setH] = React.useState(false);
  const Tag = as;
  const states = {
    done: {
      glyph: '\u2713',
      color: 'var(--green)',
      border: 'var(--green)',
      glow: 'var(--glow-green)'
    },
    tried: {
      glyph: '\u00b7',
      color: 'var(--amber)',
      border: 'rgba(217,154,85,0.5)',
      glow: 'none'
    },
    todo: {
      glyph: '',
      color: 'var(--dim)',
      border: 'var(--line)',
      glow: 'none'
    }
  };
  const s = states[state] || states.todo;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      background: 'var(--bg1)',
      border: `1px solid ${h ? 'var(--line-strong)' : 'var(--line)'}`,
      borderRadius: 'var(--radius-card)',
      padding: '0.9rem 1.1rem',
      textDecoration: 'none',
      transform: h ? 'translateX(2px)' : 'none',
      transition: 'border-color 0.2s, transform 0.2s',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: '1.6rem',
      height: '1.6rem',
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: '50%',
      border: `1px solid ${s.border}`,
      color: s.color,
      boxShadow: s.glow,
      fontFamily: 'var(--font-mono)',
      fontSize: '0.9rem'
    }
  }, s.glyph), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--white)',
      fontWeight: 600,
      fontSize: '1.05rem'
    }
  }, title), meta.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      flexWrap: 'wrap'
    }
  }, meta.map((m, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.66rem',
      color: 'var(--cyan)'
    }
  }, m)))), /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: '0.72rem',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--green)'
    }
  }, go));
}
Object.assign(__ds_scope, { ChallengeRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ChallengeRow.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ImageFrame.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA ImageFrame — the CAD-viewport treatment for any image or drop slot.
 * A blueprint backplate (mint bloom + 24px grid) shows through empty slots,
 * and two click-through overlays grade whatever sits inside: a soft-light mint
 * tint and a scanline + inner rim-light ring + bottom vignette. Children fill
 * the frame (give them position:absolute inset:0 or width/height 100%).
 * Variants: shape="round" (circular), brackets (CAD corner L-marks).
 */
function ImageFrame({
  children,
  shape = 'rect',
  brackets = false,
  radius = 0,
  bracketColor = 'rgba(147,214,200,0.55)',
  style = {},
  ...rest
}) {
  const round = shape === 'round';
  const br = round ? '50%' : radius;
  const showBrackets = (brackets === true || brackets === '' || brackets === 'true') && !round;
  const overlay = (z, extra) => ({
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    borderRadius: br,
    zIndex: z,
    ...extra
  });
  const corner = styles => ({
    position: 'absolute',
    width: 20,
    height: 20,
    ...styles
  });
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      borderRadius: br,
      backgroundColor: '#161e15',
      backgroundImage: 'radial-gradient(ellipse 70% 60% at 50% 42%, rgba(143,224,138,0.08), transparent 70%), linear-gradient(rgba(143,224,138,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(143,224,138,0.06) 1px, transparent 1px)',
      backgroundSize: 'auto, 24px 24px, 24px 24px'
    }
  }, children, /*#__PURE__*/React.createElement("div", {
    style: overlay(2, {
      mixBlendMode: 'soft-light',
      background: 'linear-gradient(150deg, rgba(143,224,138,0.2), rgba(19,26,19,0.04) 46%, rgba(147,214,200,0.16))'
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: overlay(3, {
      boxShadow: 'inset 0 0 0 1px rgba(143,224,138,0.12), inset 0 0 26px rgba(13,18,12,0.22)',
      background: 'repeating-linear-gradient(0deg, rgba(13,18,12,0.06) 0 1px, transparent 1px 4px), linear-gradient(to top, rgba(19,26,19,0.28), transparent 24%)'
    })
  })), showBrackets && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: corner({
      top: -2,
      left: -2,
      borderTop: `2px solid ${bracketColor}`,
      borderLeft: `2px solid ${bracketColor}`
    })
  }), /*#__PURE__*/React.createElement("span", {
    style: corner({
      top: -2,
      right: -2,
      borderTop: `2px solid ${bracketColor}`,
      borderRight: `2px solid ${bracketColor}`
    })
  }), /*#__PURE__*/React.createElement("span", {
    style: corner({
      bottom: -2,
      left: -2,
      borderBottom: `2px solid ${bracketColor}`,
      borderLeft: `2px solid ${bracketColor}`
    })
  }), /*#__PURE__*/React.createElement("span", {
    style: corner({
      bottom: -2,
      right: -2,
      borderBottom: `2px solid ${bracketColor}`,
      borderRight: `2px solid ${bracketColor}`
    })
  })));
}
Object.assign(__ds_scope, { ImageFrame });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ImageFrame.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ModeCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA ModeCard — a dojo mode / app tile. Mono cyan family label + status
 * badge up top, a display name (green when live), a dim tagline, and a
 * hairline footer with scoring + progress. Lifts on hover when live.
 */
function ModeCard({
  family,
  status = 'live',
  name,
  tagline,
  scoring,
  progress,
  as = 'a',
  style = {},
  ...rest
}) {
  const live = status === 'live';
  const [h, setH] = React.useState(false);
  const Tag = as;
  const badgeTone = status === 'live' ? 'live' : status === 'construction' ? 'warning' : 'soon';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    onMouseEnter: live ? () => setH(true) : undefined,
    onMouseLeave: live ? () => setH(false) : undefined,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
      background: 'var(--bg1)',
      border: `1px solid ${h ? 'var(--line-strong)' : 'var(--line)'}`,
      borderRadius: 'var(--radius-card)',
      padding: '1.2rem 1.25rem',
      textDecoration: 'none',
      opacity: live ? 1 : 0.66,
      cursor: live ? 'pointer' : 'not-allowed',
      transform: h ? 'translateY(-2px)' : 'none',
      boxShadow: h ? '0 0 0 1px rgba(143,224,138,0.15)' : 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-micro)',
      letterSpacing: 'var(--track-label)',
      textTransform: 'uppercase',
      color: 'var(--cyan)'
    }
  }, family), /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: badgeTone
  }, status)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '1.2rem',
      color: live ? 'var(--green)' : 'var(--white)'
    }
  }, name), tagline && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '0.85rem',
      color: 'var(--dim)',
      lineHeight: 1.5,
      flex: 1
    }
  }, tagline), (scoring || progress) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.75rem',
      flexWrap: 'wrap',
      borderTop: '1px solid var(--line)',
      paddingTop: '0.6rem',
      marginTop: '0.2rem',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.62rem'
    }
  }, scoring && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cyan)'
    }
  }, scoring), progress && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--dim)'
    }
  }, progress)));
}
Object.assign(__ds_scope, { ModeCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ModeCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ProcessPipeline.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* A small set of Lucide glyphs for common fabrication-pipeline steps. Pass a
   key as step.icon; anything not here falls back to the step number. */
const ICONS = {
  search: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  })),
  pen: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 20h9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
  })),
  cube: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m3.3 7 8.7 5 8.7-5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 22V12"
  })),
  file: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 2v6h6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 12v6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m9 15 3 3 3-3"
  })),
  printer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 9V2h12v7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "14",
    width: "12",
    height: "8"
  })),
  cut: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "18",
    r: "3"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    x2: "8.12",
    y1: "4",
    y2: "15.88"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "14.47",
    x2: "20",
    y1: "14.48",
    y2: "20"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "8.12",
    x2: "12",
    y1: "8.12",
    y2: "12"
  })),
  wrench: /*#__PURE__*/React.createElement("path", {
    d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
  }),
  check: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m8.5 12 2.5 2.5 5-5"
  }))
};

/**
 * IDEA ProcessPipeline — a numbered fabrication flow inside a beveled card.
 * A dashed mint flow line runs behind the nodes; each node is a beveled square
 * with a Lucide icon (or its number). The final step can be marked `reward` to
 * turn gold with a glow. `steps` is an array of
 * { label, sub?, icon?, n?, reward? } (or a JSON string of the same).
 */
function ProcessPipeline({
  title,
  meta,
  steps,
  style = {},
  ...rest
}) {
  const items = typeof steps === 'string' ? JSON.parse(steps) : steps || [];
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid var(--line-strong)',
      borderRadius: 'var(--radius-card)',
      background: 'rgba(27,36,27,0.55)',
      boxShadow: 'var(--bevel-raised)',
      overflow: 'hidden',
      ...style
    }
  }, rest), (title || meta) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 26px',
      background: 'var(--bg2)',
      borderBottom: '1px solid var(--line)'
    }
  }, title && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 24,
      letterSpacing: '0.14em',
      color: 'var(--green)',
      textShadow: 'var(--glow-green)'
    }
  }, title), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 20,
      letterSpacing: '0.08em',
      color: 'var(--cyan)',
      whiteSpace: 'nowrap'
    }
  }, meta)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1,
      padding: '36px 42px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ds-anim-flow-v",
    style: {
      position: 'absolute',
      left: 70,
      top: 66,
      bottom: 66,
      width: 2,
      background: 'repeating-linear-gradient(180deg, rgba(143,224,138,0.85) 0 14px, transparent 14px 24px)',
      boxShadow: '0 0 10px rgba(143,224,138,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 30,
      height: '100%'
    }
  }, items.map((s, i) => {
    const reward = !!s.reward;
    const n = String(s.n ?? i + 1).padStart(2, '0');
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 58,
        height: 58,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${reward ? 'rgba(211,198,142,0.6)' : 'var(--line-strong)'}`,
        borderRadius: 'var(--radius-card)',
        background: 'var(--bg1)',
        boxShadow: reward ? 'var(--bevel-raised), var(--glow-gold)' : 'var(--bevel-raised)',
        color: reward ? 'var(--gold)' : 'var(--green)'
      }
    }, ICONS[s.icon] ? /*#__PURE__*/React.createElement("svg", {
      width: "28",
      height: "28",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, ICONS[s.icon]) : /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 22
      }
    }, n)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 20,
        letterSpacing: '0.08em',
        color: reward ? 'var(--gold)' : 'var(--dim)'
      }
    }, n), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 29,
        fontWeight: 600,
        lineHeight: 1.05,
        color: reward ? 'var(--gold)' : 'var(--white)',
        textShadow: reward ? 'var(--glow-gold)' : undefined
      }
    }, s.label), s.sub && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 18,
        letterSpacing: '0.08em',
        color: 'var(--cyan)'
      }
    }, s.sub)));
  }))));
}
Object.assign(__ds_scope, { ProcessPipeline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ProcessPipeline.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ResultBanner.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IDEA ResultBanner — a verdict strip after a submission. `ok` reads green +
 * glow, `no` reads amber. Verdict on the left (mono uppercase), optional
 * mono time/detail on the right.
 */
function ResultBanner({
  ok = true,
  verdict,
  detail,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: '1rem',
      flexWrap: 'wrap',
      borderRadius: 'var(--radius-control)',
      padding: '0.8rem 1rem',
      border: `1px solid ${ok ? 'var(--green)' : 'var(--amber)'}`,
      background: ok ? 'rgba(143,224,138,0.08)' : 'rgba(217,154,85,0.07)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      fontSize: '0.9rem',
      color: ok ? 'var(--green)' : 'var(--amber)',
      textShadow: ok ? 'var(--glow-green)' : 'none'
    }
  }, verdict), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.72rem',
      color: 'var(--cyan)'
    }
  }, detail));
}
Object.assign(__ds_scope, { ResultBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ResultBanner.jsx", error: String((e && e.message) || e) }); }

__ds_ns.AnimatedLogo = __ds_scope.AnimatedLogo;

__ds_ns.DeckFooter = __ds_scope.DeckFooter;

__ds_ns.GearMark = __ds_scope.GearMark;

__ds_ns.PlatePanel = __ds_scope.PlatePanel;

__ds_ns.PlateTitle = __ds_scope.PlateTitle;

__ds_ns.SlashAccent = __ds_scope.SlashAccent;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Divider = __ds_scope.Divider;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Wordmark = __ds_scope.Wordmark;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.LeaderboardTable = __ds_scope.LeaderboardTable;

__ds_ns.StatBlock = __ds_scope.StatBlock;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Callout = __ds_scope.Callout;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.ChallengeRow = __ds_scope.ChallengeRow;

__ds_ns.ImageFrame = __ds_scope.ImageFrame;

__ds_ns.ModeCard = __ds_scope.ModeCard;

__ds_ns.ProcessPipeline = __ds_scope.ProcessPipeline;

__ds_ns.ResultBanner = __ds_scope.ResultBanner;

})();
