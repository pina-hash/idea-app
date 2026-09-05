// tests/site-versions.test.ts
//
// THE BUILD STAMP HAS TO BE TRUE OR ABSENT, NEVER QUIETLY WRONG.
//
// It is the first thing anyone reads when asking "is my change live?", so a
// stamp that disagrees with the build -- or with the other page next to it --
// does not merely mislead, it invalidates every other diagnosis made that day.
// That is not hypothetical here: two routes of the live site were seen carrying
// CLASSROOM V1.4 and CLASSROOM V1.3 at the same time, both LOWER than the V1.9
// the same footer had shown hours earlier, while the code only ever moved
// forwards.
//
// The cause is in the shape of the number. A version is a count of commits
// touching that app's paths, and a deploy clones SHALLOWLY by default, so the
// count is taken over a fixed-width window sliding along the history. Commits
// touching the app fall off the back of that window faster than new ones enter
// it, and the number goes DOWN. Nothing warns; the version is simply smaller.
//
// So the guarantees below are:
//
//   1. Over a COMPLETE history the count is the version, exactly as before.
//   2. Over a TRUNCATED one there is NO version -- not a smaller one, not a
//      "v1.0" floor. `withheld` is the whole point: a wrong number is worse
//      than no number because it is believed.
//   3. The regression is reproduced directly: the same fixed-depth window over
//      a growing history yields a DECREASING count, and the rendered stamp is
//      nonetheless the same both times, because it carries no count.
//   4. A shallow clone's boundary commit is not a diff -- git lists the whole
//      tree for it -- so it is not attributed to every app at once.
//   5. The sha names the commit the deployment was built FROM, taken from the
//      platform when it says, since that value survives any clone depth.
//   6. THE TWO SURFACES RENDER THE SAME STAMP. VersionBadge.svelte (Svelte
//      pages) and versionLine() (injected into the legacy HTML endpoints serve)
//      each used to assemble the line themselves. They are server-rendered and
//      compared here character for character, against one set of build data.
//   7. THE CHANGELOG'S MONTH HEADINGS OPEN EACH MONTH ONCE. The homepage keys
//      its {#each} on the month key, so a month grouped twice is not untidy,
//      it is fatal -- Svelte 5 throws each_key_duplicate and the page goes
//      blank on hydration. It happened: mixed committer timezones make the log
//      non-monotonic by displayed date, and the old single-pass grouping only
//      ever compared against the last group it opened.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import VersionBadge from '../src/lib/VersionBadge.svelte';
import { versionLine } from '../src/lib/version-badge';
import { apps as stubApps, deploy as stubDeploy } from './stubs/site-versions';
import {
	FIELD,
	REC,
	buildSiteVersions,
	deriveDeploy,
	groupEntriesByMonth,
	parseGitLog,
	stampParts,
	stampText,
	stampTitle,
	type VersionEntry
} from '../src/lib/site-versions';

/** One `git log --name-only` record, in the format the build actually asks for. */
function commit(sha: string, date: string, note: string, files: string[]): string {
	return [`${REC}${sha}${FIELD}${date}${FIELD}${date}${FIELD}${note}`, ...files].join('\n');
}

const CLASSROOM_FILE = 'src/lib/classroom/ClassView.svelte';
const NOTEBOOK_FILE = 'src/lib/notebook/NotebookView.svelte';
const PORTAL_FILE = 'README.md';

/** Newest first, exactly as `git log` emits it. */
function log(...records: string[]): string {
	return records.join('\n');
}

/**
 * The shape of the day this was diagnosed on, newest first: `unrelated` commits
 * touching nothing the classroom owns, sitting on top of 20 that do. The app
 * writes a commit to this repo every time an item is saved, so a burst of
 * commits landing above the last real classroom change is the ordinary case --
 * and it is what pushes classroom commits off the back of a shallow window.
 */
function history(unrelated: number): string[] {
	const out: string[] = [];
	for (let i = unrelated; i >= 1; i -= 1) {
		out.push(commit(`u${String(i).padStart(6, '0')}`, 'Aug 18, 2026', `material ${i}`, [PORTAL_FILE]));
	}
	for (let i = 20; i >= 1; i -= 1) {
		out.push(commit(`c${String(i).padStart(6, '0')}`, 'Aug 17, 2026', `classroom ${i}`, [CLASSROOM_FILE]));
	}
	return out;
}

describe('the version, over a complete history', () => {
	const raw = log(
		commit('aaaaaaa', 'Aug 18, 2026', 'Give the class page a gutter', [CLASSROOM_FILE]),
		commit('bbbbbbb', 'Aug 17, 2026', 'Fix the second scrollbar', [NOTEBOOK_FILE]),
		commit('ccccccc', 'Aug 16, 2026', 'Add a reference viewer', [CLASSROOM_FILE, PORTAL_FILE])
	);
	const site = buildSiteVersions(raw, { complete: true, envSha: null });

	it('is the count of commits touching that app', () => {
		expect(site.apps.classroom.count).toBe(2);
		expect(site.apps.classroom.version).toBe('v1.2');
		expect(site.apps.notebook.version).toBe('v1.1');
	});

	it('counts a commit once per app it touched, not once overall', () => {
		expect(site.apps.portal.count).toBe(1);
		expect(site.apps.portal.version).toBe('v1.1');
	});

	it('names the newest commit that touched the app', () => {
		expect(site.apps.classroom.lastSha).toBe('aaaaaaa');
		expect(site.apps.classroom.lastDate).toBe('Aug 18, 2026');
	});

	it('gives an untouched app a version rather than nothing to render', () => {
		expect(site.apps.gauntlet.count).toBe(0);
		expect(site.apps.gauntlet.version).toBe('v1.0');
	});

	it('never decreases when unrelated commits are added on top', () => {
		const before = buildSiteVersions(log(...history(0)), { complete: true, envSha: null });
		const after = buildSiteVersions(log(...history(6)), { complete: true, envSha: null });
		expect(after.apps.classroom.count).toBe(before.apps.classroom.count);
		expect(after.apps.portal.count).toBeGreaterThan(before.apps.portal.count);
	});
});

describe('the version, over a truncated history', () => {
	const raw = log(
		commit('aaaaaaa', 'Aug 18, 2026', 'Give the class page a gutter', [CLASSROOM_FILE]),
		commit('bbbbbbb', 'Aug 17, 2026', 'Fix the second scrollbar', [NOTEBOOK_FILE])
	);
	const site = buildSiteVersions(raw, { complete: false, envSha: null });

	it('is withheld entirely, for every app', () => {
		for (const app of Object.values(site.apps)) expect(app.version).toBeNull();
	});

	it('withholds it even for the app the truncated log did see commits for', () => {
		expect(site.apps.classroom.count).toBeGreaterThan(0);
		expect(site.apps.classroom.version).toBeNull();
	});

	it('is not replaced by a floor value that would read as a real version', () => {
		expect(Object.values(site.apps).map((a) => a.version)).not.toContain('v1.0');
	});

	it('records that the history was incomplete, so surfaces can say why', () => {
		expect(site.deploy.complete).toBe(false);
		expect(stampTitle(site.deploy)).toMatch(/truncated/i);
		expect(stampTitle({ ...site.deploy, complete: true })).not.toMatch(/truncated/i);
	});
});

describe('the reported symptom: a version that moves backwards', () => {
	const DEPTH = 10;

	/** What a shallow clone of `DEPTH` sees, after `unrelated` commits land on top. */
	function window(unrelated: number) {
		return buildSiteVersions(log(...history(unrelated).slice(0, DEPTH)), {
			complete: false,
			envSha: null
		});
	}

	const LANDING = [0, 3, 6];

	it('the raw count really does decrease as unrelated commits land', () => {
		const counts = LANDING.map((n) => window(n).apps.classroom.count);
		expect(counts[1]).toBeLessThan(counts[0]);
		expect(counts[2]).toBeLessThan(counts[1]);
		// Pinned, not just ordered: 10 commits of window, one of which is the
		// boundary and contributes nothing. Drop the boundary rule and every one
		// of these is one higher.
		expect(counts).toEqual([9, 6, 3]);
	});

	it('but the rendered stamp does not, because it carries no count', () => {
		const stamps = LANDING.map((n) => {
			const s = window(n);
			return stampParts('classroom', s.apps, s.deploy)[0];
		});
		expect(new Set(stamps).size).toBe(1);
		expect(stamps[0]).toBe('Classroom');
	});

	it('over the SAME histories with a complete clone, the version holds', () => {
		const counts = LANDING.map(
			(n) =>
				buildSiteVersions(log(...history(n)), { complete: true, envSha: null }).apps.classroom.count
		);
		expect(new Set(counts).size).toBe(1);
		expect(counts[0]).toBe(20);
	});
});

describe("a shallow clone's boundary commit", () => {
	// git grafts the oldest commit of a shallow clone to have no parent, so
	// `--name-only` prints its whole TREE rather than what it changed.
	const raw = log(
		commit('aaaaaaa', 'Aug 18, 2026', 'Give the class page a gutter', [CLASSROOM_FILE]),
		commit('bbbbbbb', 'Aug 17, 2026', 'the boundary', [
			CLASSROOM_FILE,
			NOTEBOOK_FILE,
			PORTAL_FILE,
			'src/routes/dashboard/+page.svelte'
		])
	);

	it('is not attributed to every app it happens to list', () => {
		const entries = parseGitLog(raw, { complete: false });
		expect(entries[1].apps).toEqual([]);
	});

	it('stays in the changelog, because its subject is real', () => {
		const entries = parseGitLog(raw, { complete: false });
		expect(entries.map((e) => e.note)).toContain('the boundary');
	});

	it('is left alone when the history is complete, where it IS a diff', () => {
		const entries = parseGitLog(raw, { complete: true });
		expect(entries[1].apps).toContain('notebook');
		expect(entries[1].apps).toContain('dashboard');
	});
});

describe('which commit the stamp names', () => {
	const entries: VersionEntry[] = parseGitLog(
		log(commit('aaaaaaa', 'Aug 18, 2026', 'head of the log', [PORTAL_FILE])),
		{ complete: true }
	);

	it("prefers the platform's sha, which survives any clone depth", () => {
		const d = deriveDeploy(entries, { complete: false, envSha: 'fedcba98765432100000' });
		expect(d.sha).toBe('fedcba9');
	});

	it("keeps the log's date when the platform sha IS the log's head", () => {
		const d = deriveDeploy(entries, { complete: true, envSha: 'aaaaaaa1234567890000' });
		expect(d.sha).toBe('aaaaaaa');
		expect(d.date).toBe('Aug 18, 2026');
	});

	it('withholds the date when they name different commits', () => {
		const d = deriveDeploy(entries, { complete: true, envSha: 'fedcba98765432100000' });
		expect(d.date).toBe('');
	});

	it("falls back to the log's head when the platform says nothing", () => {
		expect(deriveDeploy(entries, { complete: true, envSha: null }).sha).toBe('aaaaaaa');
	});

	it('says "dev" rather than nothing when there is no history at all', () => {
		const site = buildSiteVersions('', { complete: false, envSha: null });
		expect(site.entries).toEqual([]);
		expect(site.deploy.sha).toBe('dev');
		expect(stampParts('classroom', site.apps, site.deploy)).toEqual([
			'Classroom',
			'dev',
			'local build'
		]);
	});
});

describe('the stamp, on every surface that renders it', () => {
	/** The badge's rendered text, whitespace-collapsed the way a browser shows it. */
	function badgeText(app: string): string {
		return render(VersionBadge, { props: { app } })
			.body.replace(/<[^>]*>/g, ' ')
			.replace(/&middot;/g, '·')
			.replace(/\s+/g, ' ')
			.trim();
	}

	it('is the same on the Svelte badge and in the injected HTML line', () => {
		expect(badgeText('classroom')).toBe(versionLine('classroom'));
	});

	it('carries the version, the sha and the date, in that order', () => {
		expect(versionLine('classroom')).toBe(
			`Classroom ${stubApps.classroom.version} · ${stubDeploy.sha} · ${stubDeploy.date}`
		);
	});

	it('still agrees on both surfaces when there is no version to state', () => {
		expect(stubApps.nosuchapp).toBeUndefined();
		expect(badgeText('nosuchapp')).toBe(versionLine('nosuchapp'));
		expect(versionLine('nosuchapp')).not.toMatch(/v1\./);
	});

	it('is assembled once: the text is exactly the segments, joined', () => {
		expect(stampText('classroom', stubApps, stubDeploy)).toBe(
			stampParts('classroom', stubApps, stubDeploy).join(' · ')
		);
		expect(versionLine('classroom')).toBe(stampText('classroom', stubApps, stubDeploy));
	});
});

describe('the changelog cut into month headings', () => {
	// WHY THIS IS HERE AT ALL. `{#each logMonths as month (month.key)}` on the
	// homepage keys on the month, and Svelte 5 treats a repeated key as fatal:
	// `each_key_duplicate` is thrown during hydration, so the server HTML paints
	// correctly and the page then goes completely blank. Every other route was
	// fine, which is what made it read as a homepage bug rather than a grouping
	// one.
	//
	// THE INPUT IS NOT MONOTONIC BY DISPLAYED DATE, AND CANNOT BE MADE SO. `%cI`
	// carries each commit's own UTC offset. Commits from cloud containers are
	// stamped `+00:00`; commits made through the GitHub web UI are stamped in the
	// author's local zone. Git orders the log by ABSOLUTE INSTANT, so a commit
	// made at 18:20 -07:00 sorts between two stamped 01:08 and 02:05 +00:00 while
	// displaying a date one day earlier. Committer timezones in history are
	// immutable and mixed-zone commits keep arriving, so the grouping has to be
	// correct for a non-monotonic log rather than the log being cleaned up.

	/**
	 * Entries built through their REAL producer. `parseGitLog` is what turns a
	 * `%cI` into the `iso` the grouping reads -- including the `slice(0, 10)`
	 * that drops the offset and leaves the DISPLAYED date -- so hand-writing
	 * VersionEntry objects here would test a shape the build never emits.
	 */
	function entriesFrom(rows: Array<[sha: string, cI: string]>): VersionEntry[] {
		const raw = rows
			.map(([sha, cI]) => `${REC}${sha}${FIELD}${cI}${FIELD}${cI}${FIELD}subject for ${sha}`)
			.join('\n');
		return parseGitLog(raw, { complete: true });
	}

	/**
	 * The grouping AS IT WAS: one pass, comparing each entry's month only against
	 * the last group opened. Written out rather than imported, so this file
	 * states the defect it protects against instead of merely passing.
	 */
	function groupTheOldWay(entries: VersionEntry[]): Array<{ key: string; n: number }> {
		return entries.reduce<Array<{ key: string; n: number }>>((months, entry) => {
			const key = entry.iso.slice(0, 7);
			const last = months[months.length - 1];
			if (!last || last.key !== key) months.push({ key, n: 1 });
			else last.n += 1;
			return months;
		}, []);
	}

	describe('the exact sequence that took production down', () => {
		// The real head of main at 2026-09-01, committer dates verbatim. The two
		// -07:00 stamps are GitHub web UI uploads; everything else is +00:00.
		const PRODUCTION: Array<[string, string]> = [
			['3c24243', '2026-09-01T02:05:23+00:00'],
			['2cf9b94', '2026-08-31T18:20:17-07:00'],
			['57af18c', '2026-09-01T01:08:48+00:00'],
			['0d9ed94', '2026-09-01T00:14:50+00:00'],
			['3b12b14', '2026-08-31T23:42:11+00:00']
		];
		const entries = entriesFrom(PRODUCTION);

		it('is genuinely out of order by displayed date, which is the whole cause', () => {
			// If this ever stops holding, the fixture has stopped reproducing the
			// bug and the assertions below would pass for the wrong reason.
			expect(entries.map((e) => e.iso)).toEqual([
				'2026-09-01',
				'2026-08-31',
				'2026-09-01',
				'2026-09-01',
				'2026-08-31'
			]);
		});

		it('opened four groups under the old single-pass rule', () => {
			const old = groupTheOldWay(entries);
			expect(old).toHaveLength(4);
			expect(old.map((m) => m.key)).toEqual(['2026-09', '2026-08', '2026-09', '2026-08']);
		});

		it('opens one group per month, newest first', () => {
			const months = groupEntriesByMonth(entries);
			expect(months).toHaveLength(2);
			expect(months.map((m) => m.key)).toEqual(['2026-09', '2026-08']);
		});

		it('produces no duplicate key, which is what Svelte refuses to render', () => {
			const keys = groupEntriesByMonth(entries).map((m) => m.key);
			expect(new Set(keys).size).toBe(keys.length);
		});

		it('files every commit under its own displayed month', () => {
			const months = groupEntriesByMonth(entries);
			expect(months[0].entries.map((e) => e.sha)).toEqual(['3c24243', '57af18c', '0d9ed94']);
			expect(months[1].entries.map((e) => e.sha)).toEqual(['2cf9b94', '3b12b14']);
		});

		it('labels each heading from the month number', () => {
			expect(groupEntriesByMonth(entries).map((m) => m.label)).toEqual([
				'September 2026',
				'August 2026'
			]);
		});
	});

	describe('over a shuffled log spanning several months', () => {
		// 200 entries across 5 months, interleaved rather than sorted, which is
		// the general case the single-pass rule got wrong. `sha` is unique per
		// entry so a dropped or duplicated one is visible rather than absorbed.
		const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
		const shuffled: Array<[string, string]> = Array.from({ length: 200 }, (_, i) => {
			const month = MONTHS[(i * 7) % MONTHS.length];
			const day = String(((i * 13) % 28) + 1).padStart(2, '0');
			const offset = i % 3 === 0 ? '-07:00' : '+00:00';
			return [`s${String(i).padStart(5, '0')}`, `${month}-${day}T12:00:00${offset}`];
		});
		const entries = entriesFrom(shuffled);
		const months = groupEntriesByMonth(entries);

		it('is a fixture that would really have broken the old rule', () => {
			expect(entries).toHaveLength(200);
			expect(groupTheOldWay(entries).length).toBeGreaterThan(MONTHS.length);
		});

		it('loses nothing: count in equals count out', () => {
			const out = months.reduce((n, m) => n + m.entries.length, 0);
			expect(out).toBe(entries.length);
		});

		it('carries every sha through exactly once', () => {
			const seen = months.flatMap((m) => m.entries.map((e) => e.sha));
			expect(seen).toHaveLength(200);
			expect(new Set(seen).size).toBe(200);
			expect(new Set(seen)).toEqual(new Set(entries.map((e) => e.sha)));
		});

		it('opens each month exactly once', () => {
			const keys = months.map((m) => m.key);
			expect(new Set(keys).size).toBe(keys.length);
			expect(new Set(keys)).toEqual(new Set(entries.map((e) => e.iso.slice(0, 7))));
		});

		it('reads newest month first', () => {
			const keys = months.map((m) => m.key);
			expect(keys).toEqual([...keys].sort().reverse());
		});

		it('reads newest entry first inside each month', () => {
			for (const month of months) {
				const isos = month.entries.map((e) => e.iso);
				expect(isos).toEqual([...isos].sort().reverse());
			}
		});
	});

	it('keeps the order git listed them in when two entries share a date', () => {
		// Ties are what a mixed-offset month is full of, and a month that
		// visibly reshuffles between two renders reads as lost work.
		const entries = entriesFrom([
			['ddddddd', '2026-08-31T23:42:11+00:00'],
			['eeeeeee', '2026-08-31T18:20:17-07:00'],
			['fffffff', '2026-08-31T01:00:00+00:00']
		]);
		const [month] = groupEntriesByMonth(entries);
		expect(month.entries.map((e) => e.sha)).toEqual(['ddddddd', 'eeeeeee', 'fffffff']);
	});

	describe('an entry whose month cannot be read', () => {
		it('is labelled Undated rather than throwing', () => {
			const entries = entriesFrom([['aaaaaaa', '']]);
			expect(entries[0].iso).toBe('');
			const months = groupEntriesByMonth(entries);
			expect(months).toHaveLength(1);
			expect(months[0].label).toBe('Undated');
			expect(months[0].entries.map((e) => e.sha)).toEqual(['aaaaaaa']);
		});

		it('is labelled Undated when the month is not 1 through 12', () => {
			const entries = entriesFrom([
				['bbbbbbb', '2026-13-01T00:00:00+00:00'],
				['ccccccc', '2026-00-01T00:00:00+00:00'],
				['ddddddd', 'not-a-date']
			]);
			expect(groupEntriesByMonth(entries).map((m) => m.label)).toEqual([
				'Undated',
				'Undated',
				'Undated'
			]);
		});

		it('does not swallow the datable entries beside it', () => {
			const entries = entriesFrom([
				['aaaaaaa', '2026-09-01T02:05:23+00:00'],
				['bbbbbbb', ''],
				['ccccccc', '2026-08-31T18:20:17-07:00']
			]);
			const months = groupEntriesByMonth(entries);
			expect(months.map((m) => m.label)).toEqual(['September 2026', 'August 2026', 'Undated']);
			expect(months.reduce((n, m) => n + m.entries.length, 0)).toBe(3);
		});
	});
});
