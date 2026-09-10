import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the two class-pane TOOLS (prompt 0118): the hall pass
 * and the song queue in `tool` mode -- a trigger with a live chip and a native
 * dialog holding the card -- mounted in the student projection and the manager
 * projection against in-memory transports and one shared in-memory live bus.
 * No auth, no Supabase, no network. 404s in production, like every harness
 * here.
 */
export const prerender = false;

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	/*
	 * `?open=hall-pass` / `?open=song-queue` opens that tool's dialog on load, so
	 * a browser spec can measure the dialog without a prepare click; `&scope=
	 * manager` opens the instructor's rather than the student's. Read here in
	 * the load rather than from `page.url` in the component so the page never
	 * re-runs its mount on a query change.
	 */
	const open = url.searchParams.get('open');
	const scope = url.searchParams.get('scope') === 'manager' ? 'manager' : 'student';
	/*
	 * `?live=stalled` makes the page's bus report `stalled` to every mount, which
	 * is the ONE status the in-memory bus never produces on its own -- so the
	 * sentence a stalled channel earns (beneath each trigger, with the dialog
	 * shut) has a state a browser spec can measure.
	 */
	const live = url.searchParams.get('live') === 'stalled' ? 'stalled' : 'live';
	return {
		open: open === 'hall-pass' || open === 'song-queue' ? open : null,
		scope,
		live
	} as { open: 'hall-pass' | 'song-queue' | null; scope: 'student' | 'manager'; live: 'live' | 'stalled' };
};
