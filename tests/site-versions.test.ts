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
