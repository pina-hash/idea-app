/**
 * The Freshman Summer Program, archived.
 *
 * FSP has concluded. Its card is gone from the home page, but its materials are
 * PRESERVED rather than deleted -- the same treatment the discontinued 2025-26
 * courses already get at /archive and through the public /assignments/<slug>
 * endpoint. This module is the item list that used to be assembled across
 * curriculum.ts and the home page; it lives here now so the archive owns its own
 * contents and nothing has to be reconstructed from a retired surface.
 *
 * Plain data, client-safe (the curriculum.ts convention).
 *
 * Two of these rows are NOT archived and are marked `live`: the SolidWorks
 * add-in is a real tool with continuing use beyond FSP, and FRC recruiting is
 * ongoing. Everything else reads as concluded but still resolves -- QR codes
 * and direct links to these routes are already in circulation.
 */

/**
 * Whether the programme is currently running.
 *
 * A single flag rather than deleted code, because FSP is ANNUAL: it runs again
 * next summer, and the live Q&A board and the projected question feed are the
 * same tools they always were. Flipping this back to `false` re-opens both
 * surfaces without restoring anything. While it is true they render a
 * "concluded" card instead -- the routes still resolve, because QR codes
 * printed for the sessions are already out in the world.
 */
export const FSP_CONCLUDED = true;

export type FspArchiveIcon = 'deck' | 'book' | 'pulse' | 'plugin' | 'clipboard' | 'archive';

export interface FspArchiveItem {
	slug: string;
	title: string;
	/** Where it goes. Omitted for the two rows that open a panel in place. */
	href?: string;
	icon: FspArchiveIcon;
	/** One line on what this was, since a visitor may not have been there. */
	blurb: string;
	/**
	 * `live` = still in active use beyond FSP and unchanged. `archived` = kept
	 * readable as a record. `panel` = preserved in this page's own overlays.
	 */
	state: 'live' | 'archived' | 'panel';
}

export const FSP_ARCHIVE_ITEMS: FspArchiveItem[] = [
	{
		slug: 'fsp-presentations',
		title: 'FSP Presentations',
		icon: 'deck',
		blurb: 'The Day 1, Day 2 and Day 3 slide decks, exactly as they were presented.',
		state: 'panel'
	},
	{
		slug: 'fsp-course-info',
		title: 'Course Info',
		icon: 'book',
		blurb: 'What each IDEA course covers: Engineering Foundations, Engineering I and II Honors.',
		state: 'panel'
	},
	{
		slug: 'fsp-ask',
		title: 'Live Q&A',
		href: '/fsp/ask',
		icon: 'pulse',
		blurb: 'The question board students used from their phones during the sessions.',
		state: 'archived'
	},
	{
		slug: 'fsp-addin',
		title: 'SolidWorks Add-In',
		href: '/fsp/class',
		icon: 'plugin',
		blurb: 'The pawn and dogtag build wizard. Still available to download and still supported.',
		state: 'live'
	},
	{
		slug: 'IDEA-Blade_Rulebook_v2_2',
		title: 'IDEA-Blade Rulebook',
		href: '/assignments/IDEA-Blade_Rulebook_v2_2',
		icon: 'book',
		blurb: 'The official rulebook for the IDEA-Blade competition.',
		state: 'archived'
	},
	{
		slug: 'frc-interest',
		title: 'FRC Interest Form',
		href: '/fsp/frc-interest',
		icon: 'clipboard',
		blurb: 'Tell Team 5669 you want in. Still open -- recruiting runs all year.',
		state: 'live'
	},
	{
		slug: 'course-archive',
		title: 'Course Archive (2025-26)',
		href: '/archive',
		icon: 'archive',
		blurb: 'The discontinued 2025-26 courses and their assignments.',
		state: 'archived'
	}
];

export function fspArchiveStateLabel(state: FspArchiveItem['state']): string {
	switch (state) {
		case 'live':
			return 'Still active';
		case 'panel':
			return 'Open';
		default:
			return 'Archived';
	}
}
