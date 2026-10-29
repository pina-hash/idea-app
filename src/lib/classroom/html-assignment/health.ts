/**
 * THE HTML ASSIGNMENTS HEALTH LIST (ledger 0458, report 3bf69806): every HTML
 * post in every class, which kit built it, whether its source is kept, and
 * which ones a newer kit has not reached yet, oldest kit first so the overhaul
 * has a queue. Pure: the route reads `classroom_html_health` (0328) and the
 * committed sources, and hands both here.
 *
 * THE KIT IS READ OFF THE BUILT PAGE, never guessed. Since standard 2.16 every
 * page the kit builds carries `<meta name="hx-kit" content="<sha> <date>">`;
 * an older kit page names its tokens ref and sync date in its `hx-kit-css`
 * comment; a page with neither and no `#hx-page` was built by hand.
 */

/** One row as `classroom_html_health` answers it. */
export interface HtmlHealthRow {
	item_id: string;
	title: string | null;
	published: boolean;
	points: number | null;
	due_at: string | null;
	manifest_title: string | null;
	manifest_course: string | null;
	manifest_points: number | null;
	filename: string | null;
	bytes: number;
	updated_at: string | null;
	kit: string | null;
	standard: string | null;
	kit_css: string | null;
	kit_page: boolean;
	source_filename: string | null;
	source_updated_at: string | null;
	classes: Array<{ section_id: string; course: string; label: string }>;
}

/** A source committed under `assignment-sources/`, as the route read it. */
export interface CommittedSource {
	path: string;
	title: string | null;
	course: string | null;
	text: string;
}

/** Which kit built a page. */
export type KitBuild =
	| { kind: 'stamped'; sha: string; date: string }
	| { kind: 'older'; synced: string | null }
	| { kind: 'hand' };

/** The kit stamp `tools/hx-kit/build.mjs` writes: "<sha> <YYYY-MM-DD>". */
export function parseKitStamp(raw: string | null | undefined): { sha: string; date: string } | null {
	const m = /^([0-9a-f]{4,40}|unknown)\s+(\d{4}-\d{2}-\d{2}|unknown)$/.exec((raw ?? '').trim());
	return m ? { sha: m[1], date: m[2] } : null;
}

export function kitBuildOf(row: Pick<HtmlHealthRow, 'kit' | 'kit_css' | 'kit_page'>): KitBuild {
	const stamp = parseKitStamp(row.kit);
	if (stamp) return { kind: 'stamped', ...stamp };
	if (row.kit_css || row.kit_page) {
		const synced = /synced ([^,)]+)/.exec(row.kit_css ?? '')?.[1]?.trim() ?? null;
		return { kind: 'older', synced };
	}
	return { kind: 'hand' };
}

/** The words the list prints for a build. */
export function kitWords(build: KitBuild): string {
	if (build.kind === 'stamped') return `Kit ${build.sha} of ${build.date}`;
	if (build.kind === 'older') return build.synced ? `Older kit, tokens synced ${build.synced}` : 'Older kit, no stamp';
	return 'Built by hand, not on the kit';
}

/** The manifest's own title and course, from a source's `idea-manifest` block. */
export function sourceIdentity(text: string): { title: string | null; course: string | null } {
	const raw = /<script type="application\/json" id="idea-manifest">([\s\S]*?)<\/script>/.exec(text)?.[1];
	if (!raw) return { title: null, course: null };
	try {
		const m = JSON.parse(raw) as { title?: unknown; course?: unknown };
		return {
			title: typeof m.title === 'string' ? m.title.trim() : null,
			course: typeof m.course === 'string' ? m.course.trim() : null
		};
	} catch {
		return { title: null, course: null };
	}
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export interface HtmlHealthEntry {
	row: HtmlHealthRow;
	build: KitBuild;
	kitLine: string;
	/** The kit on main is newer than the one this page was built on (or it has none). */
	behind: boolean;
	sourceStored: boolean;
	/** The one committed source whose manifest names this post's title and course. */
	committed: CommittedSource | null;
	/** Points on the post that disagree with its manifest's total (ccecb3b9). */
	pointsMismatch: boolean;
}

/**
 * THE LIST, OLDEST KIT FIRST: hand-built pages, then older kit pages, then
 * stamped pages by kit date, each group by the post's own saved time. A
 * committed source matches only when exactly one names the same manifest title
 * and course, so two posts built from one source are never confused.
 */
export function htmlHealth(
	rows: readonly HtmlHealthRow[],
	committed: readonly CommittedSource[],
	kitNow: { sha: string; date: string } | null
): HtmlHealthEntry[] {
	const entries = rows.map((row): HtmlHealthEntry => {
		const build = kitBuildOf(row);
		const matches = committed.filter(
			(c) => norm(c.title) !== '' && norm(c.title) === norm(row.manifest_title) && norm(c.course) === norm(row.manifest_course)
		);
		const behind =
			build.kind !== 'stamped' ||
			(!!kitNow && kitNow.date !== 'unknown' && build.date !== 'unknown' && (build.date < kitNow.date || (build.date === kitNow.date && build.sha !== kitNow.sha)));
		return {
			row,
			build,
			kitLine: kitWords(build),
			behind,
			sourceStored: !!row.source_filename,
			committed: matches.length === 1 ? matches[0] : null,
			pointsMismatch: htmlPointsMismatch(row.points, row.manifest_points)
		};
	});
	const rank = (e: HtmlHealthEntry) => (e.build.kind === 'hand' ? 0 : e.build.kind === 'older' ? 1 : 2);
	return entries.sort(
		(a, b) =>
			rank(a) - rank(b) ||
			(a.build.kind === 'stamped' && b.build.kind === 'stamped' ? a.build.date.localeCompare(b.build.date) : 0) ||
			(a.row.updated_at ?? '').localeCompare(b.row.updated_at ?? '')
	);
}

/**
 * THE POST'S POINTS DISAGREE WITH ITS MANIFEST (ledger 0458, report ccecb3b9):
 * unset while the manifest totals more than 0, or set to a different number.
 * One rule for the replace screen, the health list and the grading console.
 */
export function htmlPointsMismatch(postPoints: number | null | undefined, manifestPoints: number | null | undefined): boolean {
	const total = typeof manifestPoints === 'number' && Number.isFinite(manifestPoints) ? manifestPoints : null;
	if (total === null) return false;
	if (postPoints === null || postPoints === undefined) return total > 0;
	return postPoints !== total;
}

/** The sentence a mismatch reads as, with the number the manifest totals. */
export function htmlPointsMismatchLine(postPoints: number | null | undefined, manifestPoints: number): string {
	return postPoints === null || postPoints === undefined
		? `This post has no points set, and its page's rubric adds to ${manifestPoints}.`
		: `This post is worth ${postPoints} points, and its page's rubric adds to ${manifestPoints}.`;
}
