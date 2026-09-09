import { sveltekit } from '@sveltejs/kit/vite';
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import { buildSiteVersions, GIT_HEAD_FORMAT, GIT_LOG_FORMAT } from './src/lib/site-versions';
import { devRouteStub } from './src/lib/dev-routes';

/**
 * Version + changelog substrate: exposes `virtual:site-versions`, generated
 * from the git commit history at build / dev-server start (so it updates on
 * every deploy with zero manual steps). Each commit is mapped to the page(s) /
 * app(s) it touched via the route-to-path manifest in
 * `src/lib/site-manifest.ts`, and classified into a change type from its
 * subject. Commit subjects are user-facing changelog copy; write them as
 * readable changelog lines.
 *
 * THIS FILE ONLY GATHERS. Every rule about what the numbers MEAN -- how a log
 * is parsed, when a commit count is a version and when it is not, which sha
 * names the build -- lives in `src/lib/site-versions.ts`, which is pure and
 * unit-tested. A build config is the one file in the repo a test cannot reach,
 * so it holds nothing worth testing: it runs git, asks the environment two
 * questions, and hands the answers over.
 *
 * WHETHER THE HISTORY IS COMPLETE IS PART OF THE ANSWER, NOT A DETAIL. Per-app
 * versions are commit COUNTS, and a count taken over a shallow clone is a
 * sliding window that moves BACKWARDS as unrelated commits land. Vercel
 * shallow-clones by default, so `git rev-parse --is-shallow-repository` is
 * asked on every build and the result travels with the data; a truncated
 * history yields no version number at all rather than a smaller one. Set
 * `VERCEL_DEEP_CLONE=true` on the project to restore them -- and the build says
 * so, loudly, every time it has to withhold one.
 *
 * IT EMITS TWO MODULES, AND THE SPLIT IS A PAYLOAD DECISION MEASURED IN A REAL
 * BUILD RATHER THAN A TIDINESS ONE. `virtual:site-versions` is the SMALL,
 * EAGER half -- `apps`, `deploy`, `total`, `latest` -- and is imported by the
 * root layout, the error page, `VersionBadge` and four legacy endpoints, which
 * between them put it on every route in the site. `virtual:site-changelog` is
 * the full commit log, which exactly two surfaces render (`/`'s changelog panel
 * and the FRC `ChangelogFooter`) and both `await import()` on open.
 *
 * ONE MODULE COULD NOT DO THIS, AND THE REASON IS CHUNKING RATHER THAN
 * TREE-SHAKING. Rollup will happily drop an unused export from a module, but a
 * module imported by several entry points is HOISTED INTO A SHARED CHUNK, and
 * that chunk carries every binding any of its dependents needs. Measured on the
 * build before this split: the root layout and `entry/app.js` imported `deploy`
 * alone, and the shared chunk they got was 247,850 bytes (54,894 gzipped)
 * holding all 1,433 commit records -- so the changelog was downloaded on every
 * route in the site, including the signed-out landing page and every legacy
 * assignment handout. A second module is a second chunk, which is the only
 * thing that separates them.
 *
 * `total` AND `latest` ARE SCALARS, NOT A SECOND COPY OF THE LOG. `/` renders
 * `<filtered> / <total>` before the log has loaded and `ChangelogFooter` puts
 * the newest date in its collapsed summary, so both numbers have to survive the
 * lazy half being absent. A `recent` SLICE was the rejected alternative: it
 * would be a second copy of the entry data in the eager module, and two copies
 * of the changelog is the thing that quietly stops matching.
 */
function siteVersionsPlugin(): Plugin {
	const virtualIds = {
		'virtual:site-versions': 'meta',
		'virtual:site-changelog': 'log'
	} as const;
	const resolved = (id: string) => '\0' + id;

	return {
		name: 'idea-site-versions',
		resolveId(id) {
			if (id in virtualIds) return resolved(id);
		},
		load(id) {
			const wanted = (Object.keys(virtualIds) as Array<keyof typeof virtualIds>).find(
				(key) => resolved(key) === id
			);
			if (!wanted) return;

			let raw = '';
			let headRaw = '';
			let complete = false;
			try {
				raw = execSync(
					`git log --no-merges --date=format:"%b %e, %Y" --pretty=format:"${GIT_LOG_FORMAT}" --name-only`,
					{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
				);
				// The THIRD question, and it is a second git command on purpose: the
				// log above runs --no-merges, so it cannot see the commit a merged
				// deploy is built FROM, and teaching it to would put merge subjects
				// in the changelog and count everything under them twice. See
				// deriveDeploy for what the stamp did while this was missing.
				headRaw = execSync(
					`git log -1 --date=format:"%b %e, %Y" --pretty=format:"${GIT_HEAD_FORMAT}"`,
					{ encoding: 'utf8' }
				);
				complete =
					execSync('git rev-parse --is-shallow-repository', { encoding: 'utf8' }).trim() ===
					'false';
			} catch {
				// No git history available (e.g. some CI checkouts): fail soft, but
				// not silently -- see the warning below.
				raw = '';
				headRaw = '';
				complete = false;
			}

			const site = buildSiteVersions(raw, {
				complete,
				headRaw,
				envSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null
			});

			if (!complete) {
				this.warn(
					`[site-versions] ${raw ? 'shallow git clone' : 'no git history'}: build stamped ` +
						`${site.deploy.sha} with NO version numbers. A commit count over a truncated ` +
						`history decreases as commits land. Set VERCEL_DEEP_CLONE=true to restore them.`
				);
			}

			/* The warning above is emitted from whichever module the build asks
			   for first, and both are asked for in any real build. */
			if (virtualIds[wanted] === 'log') {
				return `export const entries = ${JSON.stringify(site.entries)};`;
			}

			return [
				`export const apps = ${JSON.stringify(site.apps)};`,
				`export const deploy = ${JSON.stringify(site.deploy)};`,
				`export const total = ${JSON.stringify(site.entries.length)};`,
				`export const latest = ${JSON.stringify(site.entries[0] ?? null)};`
			].join('\n');
		}
	};
}

/**
 * THE `/dev/*` HARNESSES ARE NOT COMPILED INTO A PRODUCTION BUILD.
 *
 * `apply: 'build'` is the whole gate, and it is a property of WHICH VITE
 * COMMAND IS RUNNING rather than of any value read at runtime: `vite dev`
 * never invokes this plugin, `vite build` always does. There is no environment
 * variable to set correctly on a deploy and nothing to forget.
 *
 * `enforce: 'pre'` so the stub is handed back before vite-plugin-svelte's
 * transform, which is what lets a `.svelte` stub still compile to a component.
 *
 * THIS FILE ONLY WIRES IT. Which ids are harnesses and what replaces them is
 * `src/lib/dev-routes.ts`, where a test can reach it.
 */
function stripDevRoutesPlugin(): Plugin {
	return {
		name: 'idea-strip-dev-routes',
		enforce: 'pre',
		apply: 'build',
		load(id) {
			return devRouteStub(id);
		}
	};
}

export default defineConfig({
	plugins: [siteVersionsPlugin(), stripDevRoutesPlugin(), sveltekit()],
	server: {
		port: process.env.PORT ? Number(process.env.PORT) : 5173
	}
});
