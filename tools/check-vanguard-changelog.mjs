// Asserts that the VERSION constant baked into the served VANGUARD build has
// a matching entry in its CHANGELOG array. Run in CI (see .github/workflows/ci.yml)
// so a version bump with no changelog line fails the build instead of shipping
// silently -- see docs/history for the session that replaced the unwired
// post-commit-vanguard.js hook with this.
//
// This does not generate a changelog entry. A generated line describes
// nothing about what changed; the point is to make a human write the
// sentence, not to produce one automatically.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} html */
export function checkVanguardChangelog(html) {
	const versionMatch = html.match(/const\s+VERSION\s*=\s*'(\d+)'/);
	if (!versionMatch) {
		return { ok: false, message: 'Could not find a VERSION constant in the VANGUARD build.' };
	}
	const version = versionMatch[1];

	const changelogMatch = html.match(/const\s+CHANGELOG\s*=\s*\[([\s\S]*?)\n\];/);
	if (!changelogMatch) {
		return { ok: false, version, message: 'Could not find a CHANGELOG array in the VANGUARD build.' };
	}

	const hasEntry = new RegExp(`ver\\s*:\\s*'${version}'`).test(changelogMatch[1]);
	if (!hasEntry) {
		return {
			ok: false,
			version,
			message: `VANGUARD VERSION is '${version}' but CHANGELOG has no entry with ver:'${version}'.`
		};
	}

	return { ok: true, version, message: `CHANGELOG has an entry for VERSION '${version}'.` };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	const indexHtmlPath = path.resolve(__dirname, '..', 'src/lib/legacy/vanguard/index.html');
	const html = fs.readFileSync(indexHtmlPath, 'utf-8');
	const result = checkVanguardChangelog(html);
	console.log(`[vanguard-changelog-check] ${result.message}`);
	if (!result.ok) {
		process.exit(1);
	}
}
