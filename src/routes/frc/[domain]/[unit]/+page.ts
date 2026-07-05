import { error } from '@sveltejs/kit';
import { domainById } from '$lib/frc/track';
import { MDM_UNITS, mdmUnitByNumber } from '$lib/frc/mdm-content';
import type { PageLoad } from './$types';

/**
 * A single unit page under a domain, e.g. /frc/cad-mechanical/1. Only domains
 * backed by an authored content set (currently 'mdm') have unit pages; unknown
 * domains, non-content domains, or unit numbers with no authored content 404.
 * Content only: no gating or progression is consulted here.
 */
export const load: PageLoad = ({ params }) => {
	const domain = domainById(params.domain);
	if (!domain || domain.contentSet !== 'mdm') error(404, 'Unknown training unit');

	const n = Number(params.unit);
	const unit = Number.isFinite(n) ? mdmUnitByNumber(n) : undefined;
	if (!unit) error(404, 'Unknown training unit');

	const idx = MDM_UNITS.findIndex((u) => u.n === unit.n);
	return {
		domain,
		unit,
		prev: idx > 0 ? MDM_UNITS[idx - 1] : null,
		next: idx < MDM_UNITS.length - 1 ? MDM_UNITS[idx + 1] : null
	};
};
