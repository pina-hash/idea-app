import { sveltekit } from '@sveltejs/kit/vite';
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import { appsForCommit, classifyNote, APPS } from './src/lib/site-manifest';

/**
 * Version + changelog substrate: exposes `virtual:site-versions`, generated
 * from the FULL git commit history at build / dev-server start (so it updates
 * on every deploy with zero manual steps). Each commit is mapped to the
 * page(s)/app(s) it touched via the route-to-path manifest in
 * `src/lib/site-manifest.ts`, and classified into a change type from its
 * subject. Per-app versions are derived from the count of commits touching
 * that app's paths, so a version bumps automatically whenever a deploy
 * includes commits for that app. Commit subjects are user-facing changelog
 * copy; write them as readable changelog lines.
 *
 * On Vercel, set `VERCEL_DEEP_CLONE=true` so the build clones full history
 * (a shallow clone still works; versions then derive from the available
 * depth). No git at all fails soft to an empty changelog and 'dev' badges.
 */
function siteVersionsPlugin(): Plugin {
	const virtualId = 'virtual:site-versions';
	const resolvedId = '\0' + virtualId;
	const REC = '\x1e';
	const F = '\x1f';

	return {
		name: 'idea-site-versions',
		resolveId(id) {
			if (id === virtualId) return resolvedId;
		},
		load(id) {
			if (id !== resolvedId) return;

			interface Entry {
				sha: string;
				date: string;
				iso: string;
				note: string;
				type: string;
				apps: string[];
			}
			let entries: Entry[] = [];
			try {
				const out = execSync(
					`git log --no-merges --date=format:"%b %e, %Y" --pretty=format:"${REC}%h${F}%cd${F}%cI${F}%s" --name-only`,
					{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
				);
				entries = out
					.split(REC)
					.map((record) => {
						const lines = record.split('\n');
						const [sha, date, iso, note] = (lines[0] ?? '').split(F);
						const files = lines
							.slice(1)
							.map((l) => l.trim())
							.filter(Boolean);
						return {
							sha: (sha ?? '').trim(),
							date: (date ?? '').trim().replace(/\s+/g, ' '),
							iso: (iso ?? '').trim().slice(0, 10),
							note: (note ?? '').trim(),
							type: classifyNote(note ?? ''),
							apps: appsForCommit(files)
						};
					})
					.filter((e) => e.sha.length > 0 && e.note.length > 0);
			} catch {
				// No git history available (e.g. some CI checkouts): fail soft.
				entries = [];
			}

			// Per-app version: commit count across the whole history (newest first,
			// so the first hit per app is its latest commit).
			const apps: Record<string, { version: string; count: number; lastSha: string; lastDate: string }> =
				{};
			for (const a of APPS) apps[a.id] = { version: 'v1.0', count: 0, lastSha: '', lastDate: '' };
			for (const e of entries) {
				for (const id of e.apps) {
					const s = apps[id] ?? (apps[id] = { version: 'v1.0', count: 0, lastSha: '', lastDate: '' });
					s.count += 1;
					if (!s.lastSha) {
						s.lastSha = e.sha;
						s.lastDate = e.date;
					}
				}
			}
			for (const id of Object.keys(apps)) apps[id].version = `v1.${apps[id].count}`;

			const deploy = {
				sha: entries[0]?.sha ?? 'dev',
				date: entries[0]?.date ?? ''
			};

			return [
				`export const entries = ${JSON.stringify(entries)};`,
				`export const apps = ${JSON.stringify(apps)};`,
				`export const deploy = ${JSON.stringify(deploy)};`
			].join('\n');
		}
	};
}

export default defineConfig({
	plugins: [siteVersionsPlugin(), sveltekit()],
	server: {
		port: process.env.PORT ? Number(process.env.PORT) : 5173
	}
});
