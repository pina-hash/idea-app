/**
 * Bosco Tech pathways: the fixed identity registry for the six pathways every
 * student belongs to. PLAIN DATA + pure helpers (client-safe, like
 * curriculum.ts). A student's pathway lives in `profiles.pathway`
 * (0038_profile_pathway.sql), is unset until they choose it in the first-login
 * picker, and is IDENTITY AND ATTRIBUTION ONLY: it must never gate access to
 * anything.
 *
 * Color discipline: these are the specified pathway identity colors, separate
 * from the theme tokens in app.css. Identity color is never used alone; the
 * chip always pairs it with the pathway's icon and label. MSET red #FF2E2E is
 * identity only and must never be used for status; the reserved status crimson
 * #FF3355 (LIVE / REC / error) must never be used for identity.
 *
 * AN IDENTITY COLOUR IS NEVER MOVED TO PASS A CONTRAST CHECK; THE DERIVED
 * VALUE MOVES. `color` is the brand and paints the chip's fill and its edge.
 * `ink` is what every WORD and GLYPH derives from, and it defaults to the
 * identity -- three of the six can carry their own text and simply repeat it.
 * The other three could not: on the chip's own 12% tint of itself, CSEE
 * measured 3.31-4.17, MSET 3.54-4.39 and BMET 4.15-5.26 across the portal's
 * three grounds. Each ink is that pathway's OWN hue and saturation at a higher
 * lightness -- lightness only, because desaturating is how a brand quietly
 * stops being itself -- and clears 4.5:1 on all three grounds, on both the
 * chip's 12% tint and the picker's 10% one. This is the same contract
 * `--acc-ink` carries for the launcher cards, and `--violet-ink` for the coin
 * ledger.
 *
 * Icons are the named lucide icons, inlined as static 24x24 stroke markup so
 * no icon dependency is added; the chip wrapper supplies stroke color/width.
 */

export const PATHWAY_IDS = ['IDEA', 'ACE', 'BMET', 'CSEE', 'MSET', 'MAT'] as const;
export type PathwayId = (typeof PATHWAY_IDS)[number];

export interface Pathway {
	id: PathwayId;
	/** Short chip label (the pathway code). */
	label: string;
	/** Identity color (fixed palette hex). Fills and edges only. */
	color: string;
	/**
	 * The colour every WORD and GLYPH of this pathway is drawn in: the identity
	 * at a lightness that clears 4.5:1 on the grounds the chip lands on. Equal
	 * to `color` where the identity already carries text. See the file header.
	 */
	ink: string;
	/** lucide icon name (for reference; the markup below is what renders). */
	iconName: string;
	/** Inner SVG markup of the icon (24x24 viewBox, stroked, currentColor). */
	icon: string;
}

export const PATHWAYS: Pathway[] = [
	{
		id: 'IDEA',
		label: 'IDEA',
		color: '#00FF41',
		ink: '#00FF41', // identity clears unaided: 7.77-9.97 on the chip tint
		iconName: 'box',
		icon: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'
	},
	{
		id: 'ACE',
		label: 'ACE',
		color: '#FF8C00',
		ink: '#FF8C00', // identity clears unaided: 5.02-6.37
		iconName: 'building-2',
		icon: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>'
	},
	{
		id: 'BMET',
		label: 'BMET',
		color: '#B47CFF',
		ink: '#BC8AFF', // hsl(265.6 100% 74.3%) -> 77%. 4.15-5.26 -> 4.69-5.94
		iconName: 'dna',
		icon: '<path d="m10 16 1.5 1.5"/><path d="m14 8-1.5-1.5"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="m16.5 10.5 1 1"/><path d="m17 6-2.891-2.891"/><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="m20 9 .891.891"/><path d="M3.109 14.109 4 15"/><path d="m6.5 12.5 1 1"/><path d="m7 18 2.891 2.891"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/>'
	},
	{
		id: 'CSEE',
		label: 'CSEE',
		color: '#3D7DFF',
		ink: '#6B9CFF', // hsl(220.2 100% 62%) -> 71%. 3.31-4.17 -> 4.64-5.85
		iconName: 'cpu',
		icon: '<path d="M12 20v2"/><path d="M12 2v2"/><path d="M17 20v2"/><path d="M17 2v2"/><path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/><path d="M20 12h2"/><path d="M20 17h2"/><path d="M20 7h2"/><path d="M7 20v2"/><path d="M7 2v2"/><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>'
	},
	{
		id: 'MSET',
		label: 'MSET',
		color: '#FF2E2E',
		ink: '#FF6666', // hsl(0 100% 59%) -> 70%. 3.54-4.39 -> 4.57-5.68
		iconName: 'hexagon',
		icon: '<path d="M21 16v-8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'
	},
	{
		id: 'MAT',
		label: 'MAT',
		color: '#FFE600',
		ink: '#FFE600', // identity clears unaided: 8.14-10.49
		iconName: 'aperture',
		icon: '<circle cx="12" cy="12" r="10"/><path d="m14.31 8 5.74 9.94"/><path d="M9.69 8h11.48"/><path d="m7.38 12 5.74-9.94"/><path d="M9.69 16 3.95 6.06"/><path d="M14.31 16H2.83"/><path d="m16.62 12-5.74 9.94"/>'
	}
];

export function pathwayById(id: string | null | undefined): Pathway | undefined {
	if (!id) return undefined;
	return PATHWAYS.find((p) => p.id === id);
}

/**
 * The pathway IDENTITY color for a profile's pathway, or null when unset.
 * Fills and edges. Anything drawing a WORD or a GLYPH wants `pathwayInk`.
 */
export function pathwayColor(id: string | null | undefined): string | null {
	return pathwayById(id)?.color ?? null;
}

/**
 * The pathway's TEXT color: the identity where it can carry text, and the
 * lightened derivation where it cannot. Exists so that "tint this name in the
 * pathway colour" has a right answer to reach for -- three of the six
 * identities measure 3.31-4.45:1 as text and the difference is invisible until
 * somebody measures it.
 */
export function pathwayInk(id: string | null | undefined): string | null {
	return pathwayById(id)?.ink ?? null;
}

/** '#RRGGBB' -> 'rgba(r, g, b, a)' for chip fills/borders (no color-mix needed). */
export function withAlpha(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
