/**
 * Foundation domain unit content, parsed at build time from the authored seed
 * `foundation-content-seed.md` at the repo root, using the EXACT SAME parser
 * as the CAD/Mechanical Design content (`parseSeed`, exported from
 * mdm-content.ts): identical frontmatter + `## Brief`/`## Drill`/`## Gate`/
 * `## Apply` format, so a Foundation unit gets the same typed model and the
 * same UnitPage phase machinery with no special-casing. Edit the markdown,
 * never this file.
 *
 * Currently just F1 ("Welcome to FRC"); F2 through F5 are registry-only
 * placeholders (track.ts) with no seed content yet, so they render as
 * "In development" on the domain page.
 */
import seedRaw from '../../../foundation-content-seed.md?raw';
import { parseSeed, type MdmUnit } from '$lib/frc/mdm-content';

export const FOUNDATION_UNITS: MdmUnit[] = parseSeed(seedRaw);

export function foundationUnitByNumber(n: number): MdmUnit | undefined {
	return FOUNDATION_UNITS.find((u) => u.n === n);
}

export function foundationUnitById(id: string): MdmUnit | undefined {
	return FOUNDATION_UNITS.find((u) => u.id.toLowerCase() === id.toLowerCase());
}
