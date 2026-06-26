import { sveltekit } from '@sveltejs/kit/vite';
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';

/**
 * Auto-changelog: exposes `virtual:changelog` as the site changelog, generated
 * from git commit history at build / dev-server start. Every commit becomes an
 * entry ({ date, note } from the commit date + subject), so the changelog
 * updates itself and is never hand-edited. Write commit subjects as readable,
 * user-facing changelog lines.
 */
function changelogPlugin(): Plugin {
	const virtualId = 'virtual:changelog';
	const resolvedId = '\0' + virtualId;
	const SEP = '\x1f';

	return {
		name: 'idea-changelog',
		resolveId(id) {
			if (id === virtualId) return resolvedId;
		},
		load(id) {
			if (id !== resolvedId) return;
			let entries: { date: string; note: string }[] = [];
			try {
				const out = execSync(
					`git log -n 50 --no-merges --date=format:"%b %e, %Y" --pretty=format:"%cd${SEP}%s"`,
					{ encoding: 'utf8' }
				);
				entries = out
					.split('\n')
					.map((line) => {
						const [date, note] = line.split(SEP);
						return { date: (date ?? '').trim(), note: (note ?? '').trim() };
					})
					.filter((e) => e.note.length > 0);
			} catch {
				// No git history available (e.g. some CI checkouts): fail soft.
				entries = [];
			}
			return `export default ${JSON.stringify(entries)};`;
		}
	};
}

export default defineConfig({
	plugins: [changelogPlugin(), sveltekit()]
});
