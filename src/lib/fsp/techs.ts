/**
 * FSP tech-selection registry: the six Bosco Tech pathways as the ranking
 * options for incoming freshmen. PLAIN DATA + pure helpers (client-safe, like
 * curriculum.ts / pathways.ts).
 *
 * This is a SCHOOLWIDE tool, so it is deliberately neutral: the identity color
 * and icon are reused from `$lib/pathways` (the official per-pathway palette),
 * but the surrounding chrome uses the neutral Bosco Tech navy/gold theme, not
 * the IDEA-green aesthetic. Presented in alphabetical code order, matching how
 * FSP refers to the six techs.
 */

import { PATHWAYS } from '$lib/pathways';

export const FSP_TECH_IDS = ['ACE', 'BMET', 'CSEE', 'IDEA', 'MAT', 'MSET'] as const;
export type FspTechId = (typeof FSP_TECH_IDS)[number];

export interface FspTech {
	id: FspTechId;
	/** Short code shown on the chip. */
	label: string;
	/** Identity color (reused from the pathway palette). */
	color: string;
	/** Inner SVG markup of the pathway icon (24x24 viewBox, currentColor). */
	icon: string;
}

export const FSP_TECHS: FspTech[] = FSP_TECH_IDS.map((id) => {
	const p = PATHWAYS.find((x) => x.id === id);
	return {
		id,
		label: id,
		color: p?.color ?? '#888888',
		icon: p?.icon ?? ''
	};
});

export function fspTechById(id: string | null | undefined): FspTech | undefined {
	if (!id) return undefined;
	return FSP_TECHS.find((t) => t.id === id);
}

/** True when every id is one of the six known techs (defensive prefill guard). */
export function areValidTechIds(ids: unknown): ids is FspTechId[] {
	return (
		Array.isArray(ids) &&
		ids.every((v) => typeof v === 'string' && FSP_TECH_IDS.includes(v as FspTechId))
	);
}
