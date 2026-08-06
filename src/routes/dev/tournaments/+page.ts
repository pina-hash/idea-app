import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the tournament views: mounts the REAL BracketView /
 * PoolsView / EntryChip over an in-memory double-elimination simulator that
 * mirrors the 0062 SQL rules, so bracket rendering, bye placement,
 * advancement, the LIVE state, and the grand-final reset are all
 * browser-verifiable with no auth or Supabase. 404s in a production build.
 */
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
