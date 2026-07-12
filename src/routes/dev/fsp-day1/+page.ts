import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * FSP Day 1 deck harness. Dev-only: 404s in a production build so it never
 * ships. Shows the hosted standalone deck iframe (/fsp/day1-slides.html) plus a
 * button that simulates the slide-13 FSP_SLIDE postMessage, so the live-feed
 * overlay can be verified without clicking through all 13 slides, no auth or DB.
 * It also listens for the REAL FSP_SLIDE messages the deck emits, so driving the
 * deck to slide 13 in the browser triggers the overlay too.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
