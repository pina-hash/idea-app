// tests/armory-solidworks-version.test.ts
//
// A PROJECT'S SOLIDWORKS VERSION ON THE WEBSITE (ledger 0404). The database
// is the boundary (tests/db/armory-release-choice.test.ts); what is held here
// is that the page offers only what the database would take, and says what a
// move costs before it is made:
//   - A KEY OFFERS A RELEASE THE SERVER REFUSES (lower, equal, not out yet).
//   - THE MOVE CONTROL REACHES SOMEBODY WITH NO TRANSPORT, or the page loses
//     the sentence saying a move cannot be undone.
//   - A 2025 PROJECT NAMES THE NEW PARAMETER, which breaks every create on a
//     database without 0285.

import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, test } from 'vitest';
import ArmoryProjectSettings from '../src/lib/armory/ArmoryProjectSettings.svelte';
import {
	ARMORY_CREATE_RELEASES,
	ARMORY_DEFAULT_RELEASE,
	newestRelease,
	raiseChoices,
	releaseErrorWords,
	releaseRaiseWords,
	RELEASE_NO_WAY_DOWN
} from '../src/lib/armory/solidworks-version';
import type { ArmoryProjectSummary } from '../src/lib/armory/view';

const OCT_2026 = Date.parse('2026-10-06T17:30:00Z');
// 06:30 UTC on 1 January is still 31 December in Los Angeles.
const NEW_YEAR_UTC = Date.parse('2027-01-01T06:30:00Z');
const project = (pinned: number | undefined): ArmoryProjectSummary => ({
	id: 'p',
	name: 'Robot 2026',
	season: null,
	role: 'mentor',
	...(pinned === undefined ? {} : { pinned_release: pinned })
});
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('what is offered', () => {
	test('the newest release is the school year plus one, on the Los Angeles calendar', () => {
		expect(newestRelease(OCT_2026)).toBe(2027);
		expect(newestRelease(NEW_YEAR_UTC)).toBe(2027);
		expect(newestRelease(NEW_YEAR_UTC + 9 * 3600_000)).toBe(2028);
	});

	test('only releases above the pin, up to the newest; nothing for a pin it cannot read', () => {
		expect(raiseChoices(2025, OCT_2026)).toEqual([2026, 2027]);
		expect(raiseChoices(2026, OCT_2026)).toEqual([2027]);
		expect(raiseChoices(2027, OCT_2026)).toEqual([]);
		expect(raiseChoices(2030, OCT_2026)).toEqual([]);
		expect(raiseChoices(undefined, OCT_2026)).toEqual([]);
		expect(raiseChoices(null, OCT_2026)).toEqual([]);
		for (const r of raiseChoices(2020, OCT_2026)) expect(r).toBeGreaterThan(2020);
	});

	test('creation offers 2025 and 2026, 2025 first and the default', () => {
		expect(ARMORY_CREATE_RELEASES).toEqual([2025, 2026]);
		expect(ARMORY_DEFAULT_RELEASE).toBe(ARMORY_CREATE_RELEASES[0]);
	});

	test('the cost names both releases, and a refusal is read from its code and words', () => {
		expect(releaseRaiseWords(2025, 2026)).toMatch(/saves a file in SolidWorks 2026, that file will not open in SolidWorks 2025/);
		expect(RELEASE_NO_WAY_DOWN).toMatch(/no way back down/);
		expect(releaseErrorWords('anything', 'PGRST202')).toMatch(/Project tab/);
		expect(releaseErrorWords('only a mentor may raise the pinned release', '42501')).toMatch(/mentor of this project or a site admin/);
		expect(releaseErrorWords('The pinned release must increase from 2026.', '22023')).toMatch(/already on that version/);
		expect(releaseErrorWords('SolidWorks 2099 is not a release yet; the newest a project can move to is 2027.', '22023')).toMatch(/not out yet/);
		expect(releaseErrorWords('project not found', 'P0002')).toMatch(/not there/);
	});
});

describe('the Project tab, both directions', () => {
	const raise = async () => ({ ok: true as const });

	test('with the transport: the version, two choices on 2025, one move key, the cost and no way down', () => {
		const html = render(ArmoryProjectSettings, { props: { project: project(2025), now: OCT_2026, raiseRelease: raise } }).body;
		expect(html).toContain('data-testid="armory-release-now"');
		expect(html).toMatch(/armory-release-now[^>]*>SolidWorks 2025</);
		expect(count(html, /data-testid="armory-release-raise"/g)).toBe(1);
		expect(count(html, /data-release="/g)).toBe(2);
		expect(html).toContain('Move up to SolidWorks 2026');
		expect(html).toContain('data-testid="armory-release-cost"');
		expect(html).toContain('data-testid="armory-release-no-down"');
		expect(count(html, /data-testid="armory-release-who"/g)).toBe(0);
	});

	test('without it: the version and who can move it, and no key at all', () => {
		const html = render(ArmoryProjectSettings, { props: { project: project(2025), now: OCT_2026 } }).body;
		expect(html).toMatch(/armory-release-now[^>]*>SolidWorks 2025</);
		expect(count(html, /data-testid="armory-release-raise"/g)).toBe(0);
		expect(count(html, /data-release="/g)).toBe(0);
		expect(count(html, /data-testid="armory-release-cost"/g)).toBe(0);
		expect(html).toContain('data-testid="armory-release-who"');
		expect(html).toContain('data-testid="armory-release-no-down"');
	});

	test('on the newest release: no key, a sentence saying so; with no pin, no panel', () => {
		const newest = render(ArmoryProjectSettings, { props: { project: project(2027), now: OCT_2026, raiseRelease: raise } }).body;
		expect(count(newest, /data-testid="armory-release-raise"/g)).toBe(0);
		expect(newest).toContain('data-testid="armory-release-newest"');
		const unknown = render(ArmoryProjectSettings, { props: { project: project(undefined), now: OCT_2026, raiseRelease: raise } }).body;
		expect(count(unknown, /data-testid="armory-release"/g)).toBe(0);
		// Positive control: the same render with a pin has the panel.
		expect(count(newest, /data-testid="armory-release"/g)).toBe(1);
	});
});

describe('the create call names the new parameter only when it is used', () => {
	const src = readFileSync(new URL('../src/routes/armory/+page.svelte', import.meta.url), 'utf8');
	test('the default goes through the deployed three-argument form', () => {
		expect(src).toContain("if (release !== ARMORY_DEFAULT_RELEASE) args.p_release = release;");
		expect(src).toMatch(/p_name: name, p_season: null, p_operation: crypto\.randomUUID\(\)/);
		expect(src).not.toMatch(/p_release: release,/);
	});
});
