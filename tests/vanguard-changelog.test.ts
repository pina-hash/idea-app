// tests/vanguard-changelog.test.ts
//
// CI must fail when the VANGUARD build's VERSION constant has no matching
// CHANGELOG entry, so a version bump can no longer ship silently the way
// '213' did (see tools/check-vanguard-changelog.mjs and docs/history). This
// pins the checker against small fixtures rather than the real build file,
// so it stays meaningful whether the real file is currently green or red.

import { describe, expect, it } from 'vitest';
import { checkVanguardChangelog } from '../tools/check-vanguard-changelog.mjs';

function buildHtml(version: string, changelogVersions: string[]): string {
	const entries = changelogVersions
		.map((v) => ` {ver:'${v}',date:'2026',items:['something']},`)
		.join('\n');
	return `
const VERSION='${version}';
const CHANGELOG=[
${entries}
];
`;
}

describe('checkVanguardChangelog', () => {
	it('passes when the current VERSION has a CHANGELOG entry', () => {
		const html = buildHtml('213', ['213', '212', '211']);
		const result = checkVanguardChangelog(html);
		expect(result.ok).toBe(true);
		expect(result.version).toBe('213');
	});

	it('fails when the current VERSION has no CHANGELOG entry', () => {
		const html = buildHtml('213', ['212', '211']);
		const result = checkVanguardChangelog(html);
		expect(result.ok).toBe(false);
		expect(result.version).toBe('213');
		expect(result.message).toContain("no entry with ver:'213'");
	});

	it('fails when VERSION cannot be found at all', () => {
		const result = checkVanguardChangelog('const CHANGELOG=[\n {ver:\'1\',date:\'2026\',items:[\'x\']},\n];');
		expect(result.ok).toBe(false);
		expect(result.message).toContain('VERSION');
	});

	it('fails when CHANGELOG cannot be found at all', () => {
		const result = checkVanguardChangelog("const VERSION='1';");
		expect(result.ok).toBe(false);
		expect(result.version).toBe('1');
		expect(result.message).toContain('CHANGELOG');
	});
});
