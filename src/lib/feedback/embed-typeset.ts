/**
 * THE FRAMED WINDOW OPENS ALREADY SET IN ITS OWN TYPEFACES (ledger 0396,
 * review polish round).
 *
 * The home box never shows a fallback face: the page it opens over has long
 * since loaded Rajdhani and Share Tech Mono, because every line on it is set in
 * them. The framed window is a FRESH document over a page that is not one of
 * ours (the Coin Ledger, a handout), so the first time it opened in a tab the
 * box was laid out before its faces had arrived, in the fallback stack, and
 * then reflowed when they did. Measured by the review on the first open: the
 * box drew 150 to 490ms early, 871px of content in an 826px box with SEND
 * below its edge at 1440, then jumped to 822 in 822 with SEND inside.
 *
 * So the window's page starts loading the box's faces the moment it mounts
 * (which is on the way to the press: a hover, a focus, a finger going down),
 * and an open waits for them, for no longer than `FEEDBACK_EMBED_TYPESET_WAIT_MS`.
 * A face that never arrives never holds the box back: past the cap it opens in
 * whatever it has, exactly as it did before this module.
 *
 * WHICH FACES is read off the page, never listed here. The box is set in the
 * two family TOKENS its host names on the scrim (`SiteFeedback.svelte`:
 * `--fb-font: var(--font-display)` and `--fb-font-mono: var(--font-mono)`; no
 * room hands in a face, review round 4), and the faces loaded are every
 * `@font-face` the document declares for those two families, at whatever
 * weights the root layout imports. A weight added to the layout tomorrow is
 * warmed with no edit here.
 *
 * DOM-shaped but injectable: every function takes the font set and the clock it
 * uses, so the arithmetic is assertable in the node project.
 */

/** How long an open waits for the box's faces before it opens anyway. */
export const FEEDBACK_EMBED_TYPESET_WAIT_MS = 800;

/** The custom properties naming the families the box is set in. */
export const FEEDBACK_BOX_FONT_TOKENS = ['--font-display', '--font-mono'] as const;

/** How an open went: its faces were there, one failed to load, or the cap opened it. */
export type EmbedTypeset = 'set' | 'missing' | 'capped';

const GENERIC = new Set([
	'serif',
	'sans-serif',
	'monospace',
	'cursive',
	'fantasy',
	'system-ui',
	'ui-serif',
	'ui-sans-serif',
	'ui-monospace',
	'ui-rounded',
	'math',
	'emoji',
	'fangsong',
	'inherit',
	'initial',
	'unset'
]);

function unquote(name: string): string {
	return name.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

/** The first named family in a `font-family` value, or null for a generic one. */
export function firstFamily(value: string | null | undefined): string | null {
	const first = unquote(String(value ?? '').split(',')[0] ?? '');
	if (!first || GENERIC.has(first.toLowerCase())) return null;
	return first;
}

/** The minimum of a `FontFace` the warm-up reads. */
export interface FaceLike {
	family: string;
	weight: string;
	style: string;
}

/** The minimum of a `FontFaceSet` the warm-up uses. */
export interface FontSetLike {
	load(font: string, text?: string): Promise<unknown>;
	forEach?(callback: (face: FaceLike) => void): void;
}

/**
 * The `font` shorthand strings that load every declared face of `families`
 * for Latin text, one per weight and style. A variable face's weight range
 * ("300 700") is loaded at its first weight, the one a shorthand can name.
 */
export function faceSpecs(fonts: FontSetLike, families: readonly string[]): string[] {
	const wanted = new Map(families.map((f) => [f.toLowerCase(), f] as const));
	const specs = new Set<string>();
	try {
		fonts.forEach?.((face) => {
			const name = wanted.get(unquote(face.family).toLowerCase());
			if (!name) return;
			const weight = String(face.weight || '400').trim().split(/\s+/)[0] || '400';
			const style = String(face.style || 'normal').trim().split(/\s+/)[0] || 'normal';
			specs.add(`${style} ${weight} 16px "${name}"`);
		});
	} catch {
		// A font set that cannot be walked still gets each family's regular face.
	}
	if (specs.size === 0) for (const f of families) specs.add(`16px "${f}"`);
	return [...specs];
}

/**
 * Start loading the box's faces. Resolves `true` when every one loaded and
 * `false` when any failed; it never rejects, because a font is never a reason
 * for the window not to open.
 */
export function warmFaces(
	fonts: FontSetLike | null | undefined,
	families: readonly string[],
	sample = 'Aa'
): Promise<boolean> {
	if (!fonts || families.length === 0) return Promise.resolve(true);
	const loads = faceSpecs(fonts, families).map((spec) => {
		try {
			return Promise.resolve(fonts.load(spec, sample));
		} catch (e) {
			return Promise.reject(e);
		}
	});
	return Promise.allSettled(loads).then((all) => all.every((r) => r.status === 'fulfilled'));
}

/**
 * Wait for the warm-up, but never past `ms`. `set` when every face was there in
 * time, `missing` when one failed (the box opens at once, in what it has), and
 * `capped` when the cap opened it.
 */
export function settleWithin(
	warm: Promise<boolean>,
	ms: number,
	timer: (fn: () => void, ms: number) => unknown = setTimeout
): Promise<EmbedTypeset> {
	return new Promise((resolve) => {
		let done = false;
		const finish = (how: EmbedTypeset) => {
			if (done) return;
			done = true;
			resolve(how);
		};
		timer(() => finish('capped'), ms);
		warm.then(
			(ok) => finish(ok ? 'set' : 'missing'),
			() => finish('missing')
		);
	});
}

/** The families the box is set in, read off a document's root. */
export function boxFamilies(root: Element): string[] {
	const cs = getComputedStyle(root);
	const out: string[] = [];
	for (const token of FEEDBACK_BOX_FONT_TOKENS) {
		const family = firstFamily(cs.getPropertyValue(token));
		if (family && !out.includes(family)) out.push(family);
	}
	return out;
}
