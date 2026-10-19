/**
 * A PROJECT'S SOLIDWORKS VERSION (ledger 0404, decision 41 item 7). Every
 * Armory project is pinned to one SolidWorks release: the vault refuses a file
 * saved in a NEWER release than the pin (`armory_check_release`, 0231), which
 * is what keeps a 2025 computer able to open everything in a 2025 project. A
 * pin is chosen when the project is created and only ever moves up.
 *
 * THE DATABASE IS THE BOUNDARY AND THIS FILE ONLY CHOOSES WHAT TO OFFER.
 * `newestRelease` mirrors 0273's `_armory_release_ceiling()` (the Los Angeles
 * calendar year plus one, because SolidWorks names a release for the year
 * after it ships); a choice this file offers that the server would refuse is a
 * key whose only answer is a refusal, which is why the two agree.
 *
 * Plain data and pure functions, so the pages, the /dev/armory harness and the
 * tests all ask the same thing.
 */
import { laCalendarDay } from '$lib/classroom/school-calendar';

/** The column default (0231). A project created with no choice is on it. */
export const ARMORY_DEFAULT_RELEASE = 2025;

/**
 * The releases offered when a project is created: the two IDEA uses
 * (2025 on the school computers, 2026 on personal ones). A later release is
 * reached by moving a project up from its Project tab.
 */
export const ARMORY_CREATE_RELEASES: readonly number[] = [2025, 2026];

/** The newest release a project may name, on the school's calendar. */
export function newestRelease(now: number): number {
	return Number(laCalendarDay(new Date(now)).slice(0, 4)) + 1;
}

/**
 * The releases a project pinned to `pinned` may move up to: every one above
 * it, up to the newest. Empty when it is already on the newest, and empty for
 * a pin this page cannot read (a database that does not project it).
 */
export function raiseChoices(pinned: number | null | undefined, now: number): number[] {
	if (typeof pinned !== 'number' || !Number.isInteger(pinned)) return [];
	const out: number[] = [];
	for (let r = pinned + 1; r <= newestRelease(now); r++) out.push(r);
	return out;
}

/** "SolidWorks 2026". */
export function releaseName(release: number): string {
	return `SolidWorks ${release}`;
}

/** What the version means today, said once on the Project tab. */
export function releaseNowWords(pinned: number): string {
	return `Files in this project open in ${releaseName(pinned)} and later. Armory takes a file saved in ${pinned} or earlier, and refuses one saved in a newer SolidWorks until the project moves up.`;
}

/** What moving up costs, said BEFORE the confirm. */
export function releaseRaiseWords(from: number, to: number): string {
	return `Once anyone saves a file in ${releaseName(to)}, that file will not open in ${releaseName(from)}. Every computer that works on this project will need ${releaseName(to)} or newer. Files already saved in ${from} keep opening everywhere.`;
}

/** Why there is no way down, where the control would be. */
export const RELEASE_NO_WAY_DOWN =
	'There is no way back down: a file saved in a newer SolidWorks cannot be opened in an older one, so lowering the version would strand it.';

/** Said beside the version choice when a project is created. */
export function releaseCreateWords(release: number): string {
	return release === ARMORY_DEFAULT_RELEASE
		? `Works on every IDEA computer. A file saved in ${releaseName(release + 1)} has to be saved back to ${release} before Armory takes it.`
		: `Only computers with ${releaseName(release)} or newer can open its files. Choose this when everyone on the project has ${release}.`;
}

/**
 * Plain words for a refusal from `armory_raise_pinned_release` or the
 * four-argument `armory_create_project`, chosen from the SQLSTATE first and
 * then the text (CLAUDE.md, IDEA ARMORY: never from the HTTP status).
 */
export function releaseErrorWords(message: string, code?: string | null): string {
	if (code === 'PGRST202') return 'Choosing the version here needs a server update that is not in yet. Create the project, then move it up from its Project tab.';
	if (/only a mentor/i.test(message)) return 'Only a mentor of this project or a site admin can move it up.';
	if (/must increase/i.test(message)) return 'The project is already on that version or a newer one. Reload to see where it is.';
	if (/not a release yet|must be a release/i.test(message)) return 'That SolidWorks version is not out yet.';
	if (code === 'P0002' || /not found/i.test(message)) return 'That project is not there any more.';
	return 'That did not work. Try again in a minute.';
}
