/**
 * THE BADGE EMBLEMS (ledger 0360, report R16): the art is redrawn, the ids are
 * not, the gear is a gear, and the one-shot beat hides nothing at rest.
 *
 * Every expectation below comes from the DATA in `$lib/identity-style` or from
 * a fixed list written here, never from the renderer under test: the drawn
 * paths are compared against what a badge IS (its four layers), so a renderer
 * that dropped a layer cannot pass by agreeing with itself.
 *
 * WHAT THIS CANNOT SEE: whether the animation actually runs, and what it looks
 * like. `tests/` has no layout engine and `svelte/server` runs no effect, so
 * the running beat, its single iteration and its end on the rest frame are the
 * browser pass's (`tools/browser-verify/routes/_classroom-badges.mjs`). The
 * REDUCED-MOTION half is asserted here, on the stylesheet, because the browser
 * pass runs under `no-preference`: every `animation` sits inside a
 * `prefers-reduced-motion: no-preference` block, so under `reduce` nothing
 * animates at all.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
import { BADGES, BADGE_BY_ID, BADGE_MOTIONS } from '$lib/identity-style';

const SOURCE = readFileSync('src/lib/tournaments/BadgeIcon.svelte', 'utf8');
const STYLE = SOURCE.slice(SOURCE.indexOf('<style>'), SOURCE.indexOf('</style>'));

/**
 * THE IDS AS SHIPPED, IN ORDER. They are stored (0064's tournament CHECK,
 * 0220's profile CHECK, every class-theme vote), so the registry may only ever
 * grow at the END of this list.
 */
const SHIPPED_IDS = ['bolt', 'flame', 'star', 'shield', 'gear', 'skull', 'crown', 'rocket'];

/** The gear as it shipped before this round: a twelve-point zigzag with no flat tooth. */
const OLD_GEAR =
	'm12 2.4 1.4 2.4 2.7-.6.7 2.7 2.4 1.2-1.2 2.5 1.2 2.5-2.4 1.2-.7 2.7-2.7-.6L12 21.6l-1.4-2.4-2.7.6-.7-2.7-2.4-1.2L6 12 4.8 9.5l2.4-1.2.7-2.7 2.7.6z';

/**
 * The vertices of a path built from M, L, H, V and A segments (absolute or
 * relative), in order. Enough for a polygon or an arc-cornered outline, which
 * is what both gears are; a curve command throws rather than being skipped.
 */
function vertices(d: string): [number, number][] {
	const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
	const out: [number, number][] = [];
	let x = 0;
	let y = 0;
	let cmd = '';
	let i = 0;
	const num = () => Number(tokens[i++]);
	while (i < tokens.length) {
		if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
		const rel = cmd === cmd.toLowerCase();
		switch (cmd.toLowerCase()) {
			case 'm':
			case 'l': {
				const nx = num();
				const ny = num();
				x = rel ? x + nx : nx;
				y = rel ? y + ny : ny;
				out.push([x, y]);
				if (cmd === 'm') cmd = 'l';
				if (cmd === 'M') cmd = 'L';
				break;
			}
			case 'h': {
				const n = num();
				x = rel ? x + n : n;
				out.push([x, y]);
				break;
			}
			case 'v': {
				const n = num();
				y = rel ? y + n : n;
				out.push([x, y]);
				break;
			}
			case 'a': {
				i += 5; // rx ry rotation large-arc sweep
				const nx = num();
				const ny = num();
				x = rel ? x + nx : nx;
				y = rel ? y + ny : ny;
				out.push([x, y]);
				break;
			}
			case 'z':
				break;
			default:
				throw new Error(`vertices(): no support for ${cmd}`);
		}
	}
	return out;
}

/**
 * Teeth on a gear outline centred at 12,12: runs of TWO OR MORE consecutive
 * vertices beyond the tip line (r > 9.5), each separated from the next by a
 * vertex inside the root line (r < 8). A flat-topped tooth has two tip corners;
 * a zigzag point has one, and is not a tooth.
 */
function teeth(d: string): number {
	const radii = vertices(d).map(([x, y]) => Math.hypot(x - 12, y - 12));
	let count = 0;
	let run = 0;
	for (const r of radii) {
		if (r > 9.5) run += 1;
		else {
			if (run >= 2) count += 1;
			if (r < 8) run = 0;
		}
	}
	if (run >= 2) count += 1;
	return count;
}

/** A stylesheet with every `@keyframes` block (one level of nesting) removed. */
function outsideKeyframes(css: string): string {
	return css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
}

describe('the ids are append-only and the art is all there', () => {
	it('keeps every shipped id, in order, at the head of the list', () => {
		expect(BADGES.slice(0, SHIPPED_IDS.length).map((b) => b.id)).toEqual(SHIPPED_IDS);
	});

	it('gives every badge a non-empty outline and a beat from BADGE_MOTIONS', () => {
		for (const b of BADGES) {
			expect(b.paths.length, `${b.id} has no outline`).toBeGreaterThan(0);
			expect(BADGE_MOTIONS, `${b.id} plays an unknown beat`).toContain(b.motion);
		}
		/* Every beat is somebody's, so no motion is dead weight in the CSS. */
		expect([...new Set(BADGES.map((b) => b.motion))].sort()).toEqual([...BADGE_MOTIONS].sort());
	});

	it('renders every layer of every badge through the real BadgeIcon', () => {
		let swept = 0;
		for (const b of BADGES) {
			const html = render(BadgeIcon, { props: { id: b.id, size: '24px' } }).body;
			const expected = [...(b.faces ?? []), ...b.paths, ...(b.details ?? []), ...(b.solids ?? [])];
			const drawn = [...html.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
			expect(drawn.length, `${b.id} drew ${drawn.length} paths, not ${expected.length}`).toBe(expected.length);
			/* In paint order: faces under the outline, details over it, solids last. */
			expect(drawn, `${b.id} drew its layers out of order`).toEqual(expected);
			expect(html).toContain(`data-motion="${b.motion}"`);
			expect(html).toContain(`data-badge="${b.id}"`);
			swept += 1;
		}
		expect(swept).toBe(BADGES.length);
		expect(swept).toBeGreaterThanOrEqual(SHIPPED_IDS.length);
	});

	it('every badge carries more than an outline (the emoji look was one stroke)', () => {
		for (const b of BADGES) {
			const layers = (b.faces?.length ?? 0) + (b.details?.length ?? 0) + (b.solids?.length ?? 0);
			expect(layers, `${b.id} is a bare outline again`).toBeGreaterThan(0);
			expect(b.faces?.length ?? 0, `${b.id} has no face`).toBeGreaterThan(0);
		}
	});

	it('renders nothing for an unknown or absent id', () => {
		expect(render(BadgeIcon, { props: { id: 'nope' } }).body).not.toContain('<svg');
		expect(render(BadgeIcon, { props: { id: null } }).body).not.toContain('<svg');
		/* Positive control: a real id does render one. */
		expect(render(BadgeIcon, { props: { id: 'gear' } }).body).toContain('<svg');
	});
});

describe('the gear is a gear', () => {
	it('has at least six flat-topped teeth', () => {
		expect(teeth(BADGE_BY_ID.gear.paths[0])).toBeGreaterThanOrEqual(6);
		expect(teeth(BADGE_BY_ID.gear.paths[0])).toBe(8);
	});

	it('and the gear it replaced did not (the positive control for the count)', () => {
		/* The old zigzag's points stand alone beyond the tip line, so by the
		   same measure it has no tooth at all. If this ever reads non-zero, the
		   measure has stopped telling a tooth from a point. */
		expect(vertices(OLD_GEAR).length).toBeGreaterThanOrEqual(20);
		expect(teeth(OLD_GEAR)).toBe(0);
	});

	it('has a bored hub, so the ground shows through the middle', () => {
		const face = BADGE_BY_ID.gear.faces?.[0] ?? '';
		/* One face carrying both subpaths, drawn evenodd, is what cuts the hole. */
		expect(face.match(/[Mm]/g)?.length).toBe(2);
		expect(render(BadgeIcon, { props: { id: 'gear' } }).body).toContain('fill-rule="evenodd"');
	});
});

describe('the beat hides nothing at rest and never loops', () => {
	const rest = outsideKeyframes(STYLE);

	it('declares no opacity, dash or transform outside a keyframe', () => {
		expect(rest).not.toMatch(/(?<![-\w])opacity:\s*0(?![.\d])/);
		expect(rest).not.toMatch(/stroke-dashoffset/);
		expect(rest).not.toMatch(/stroke-dasharray/);
		/* `transform-origin` and `transform-box` are origins, not moves. */
		expect(rest).not.toMatch(/(?<![-\w])transform\s*:/);
	});

	it('and the sweep finds a planted one (its positive control)', () => {
		const planted = rest + '\n.x { transform: rotate(1deg); opacity: 0; stroke-dashoffset: 1; }';
		expect(planted).toMatch(/(?<![-\w])transform\s*:/);
		expect(planted).toMatch(/(?<![-\w])opacity:\s*0(?![.\d])/);
		expect(planted).toMatch(/stroke-dashoffset/);
		/* And the keyframes the strip removed really do hold motion. */
		expect(STYLE).toMatch(/@keyframes -global-idea-badge-turn/);
		expect(STYLE.length - rest.length).toBeGreaterThan(500);
	});

	it('puts every animation inside a prefers-reduced-motion: no-preference block', () => {
		const open = rest.indexOf('@media (prefers-reduced-motion: no-preference)');
		expect(open).toBeGreaterThan(-1);
		/* The block's own extent, by brace counting from its opening brace. */
		let depth = 0;
		let end = -1;
		for (let i = rest.indexOf('{', open); i < rest.length; i++) {
			if (rest[i] === '{') depth += 1;
			else if (rest[i] === '}') {
				depth -= 1;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		expect(end).toBeGreaterThan(open);
		const inside = rest.slice(open, end);
		const outside = rest.slice(0, open) + rest.slice(end + 1);
		expect(inside.match(/animation\s*:/g)?.length ?? 0).toBeGreaterThan(4);
		expect(outside).not.toMatch(/animation(-name)?\s*:/);
	});

	it('plays every animation exactly once, and never infinitely', () => {
		expect(STYLE).not.toMatch(/infinite/);
		const decls = [...rest.matchAll(/animation\s*:([^;]+);/g)].map((m) => m[1]);
		expect(decls.length).toBeGreaterThan(4);
		for (const decl of decls) {
			/* Split the list on commas that are not inside a function's parentheses. */
			for (const part of decl.split(/,(?![^(]*\))/)) {
				expect(part.trim(), `"${part.trim()}" does not say it plays once`).toMatch(/\s1$/);
			}
		}
	});

	it('wires every beat in BADGE_MOTIONS to a keyframe that exists', () => {
		for (const m of BADGE_MOTIONS) {
			const rule = new RegExp(`\\[data-motion='${m}'\\]\\s*\\{[^}]*--b-beat:\\s*(idea-badge-[a-z]+)`);
			const hit = rule.exec(STYLE);
			expect(hit, `no --b-beat for ${m}`).not.toBeNull();
			expect(STYLE, `${m}'s keyframes are missing`).toContain(`@keyframes -global-${hit?.[1]}`);
		}
	});
});

describe('when the beat plays is the caller s choice', () => {
	it('defaults to hover, and once and none are their own', () => {
		const cls = (props: Record<string, unknown>) =>
			/<svg[^>]*class="([^"]*)"/.exec(render(BadgeIcon, { props: { id: 'star', ...props } }).body)?.[1] ?? '';
		expect(cls({}).split(/\s+/)).toContain('hover');
		expect(cls({}).split(/\s+/)).not.toContain('once');
		expect(cls({ motion: 'once' }).split(/\s+/)).toContain('once');
		expect(cls({ motion: 'once' }).split(/\s+/)).not.toContain('hover');
		expect(cls({ motion: 'none' }).split(/\s+/)).not.toContain('hover');
		expect(cls({ motion: 'none' }).split(/\s+/)).not.toContain('once');
		expect(cls({ motion: 'none' }).split(/\s+/)).toContain('badge-icon');
	});
});
