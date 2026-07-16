import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * FSP Day 2 deck harness. Dev-only: 404s in a production build so it never
 * ships. See /dev/fsp-day1 for the same harness on Day 1.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
