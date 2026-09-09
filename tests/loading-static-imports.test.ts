import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * TWO PAYLOADS THAT MUST NOT BE STATICALLY IMPORTED, AND WHY THIS IS A SOURCE
 * SWEEP RATHER THAN A BYTE COUNT.
 *
 * Both defects are the same shape: a module imported by something the ROOT
 * LAYOUT mounts, which puts it on every route in the site. Neither is visible
 * to `svelte-check` and neither fails anything at runtime -- the only symptom
 * is a bigger download, which nothing reports.
 *
 * A weight assertion is the obvious test and is the wrong one here: the numbers
 * come out of a production build, this suite does not run one, and a threshold
 * written down would be a ratchet recording whatever the log happened to weigh
 * that day (it grows every time the classroom's GitHub export commits). What is
 * stable is the STRUCTURE -- static versus dynamic -- which is the thing that
 * decides which chunk the bytes land in.
 *
 * MEASURED ONCE, IN A REAL BUILD, so the structure this pins has a number
 * behind it: before the split, the static closure every route loads was 22
 * files and 664,121 bytes (181,891 gzipped), including a 247,850-byte chunk
 * holding all 1,433 commit records, reachable from BOTH `nodes/0` (the root
 * layout) and `entry/app.js`. After, it is 23 files and 413,284 bytes (126,083
 * gzipped) and the changelog is reached only through `await import()`.
 */

const src = (rel: string) =>
	readFileSync(fileURLToPath(new URL('../src/' + rel, import.meta.url)), 'utf8');

/**
 * PROSE IS NOT CODE, and this sweep learned that the hard way. The FRC footer's
 * own header says the log "arrives from `virtual:site-changelog`", which a
 * naive match for `from '<spec>'` reads as a static import. A checker that
 * reports a component as importing what its comment merely NAMES is one nobody
 * can act on, so comments come out before anything is matched.
 */
function stripComments(code: string): string {
	return code
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.split('\n')
		.filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
		.join('\n');
}

/** A static import of `spec`, in any of the forms a `.svelte` file uses. */
function staticallyImports(code: string, spec: string): boolean {
	const quoted = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const body = stripComments(code).replace(/\bimport\s*\(\s*(['"`])/g, 'DYNAMIC_IMPORT($1');
	return new RegExp('(?:^|[^a-zA-Z0-9_$])(?:from|import)\\s*[\'"`]' + quoted + '[\'"`]', 'm').test(
		body
	);
}

describe('the commit log never rides the eager chunk', () => {
	const home = src('routes/+page.svelte');
	const footer = src('lib/frc/ChangelogFooter.svelte');

	it('the landing page fetches it, and does not import it', () => {
		expect(staticallyImports(home, 'virtual:site-changelog')).toBe(false);
		expect(home).toMatch(/await import\(\s*['"`]virtual:site-changelog['"`]\s*\)/);
	});

	it('the FRC footer fetches it, and does not import it', () => {
		expect(staticallyImports(footer, 'virtual:site-changelog')).toBe(false);
		expect(footer).toMatch(/await import\(\s*['"`]virtual:site-changelog['"`]\s*\)/);
	});

	/* THE POSITIVE CONTROL for the predicate: it must still SEE a real static
	   import, or `false` above would mean "this sweep matches nothing". */
	it('both still statically import the small eager half', () => {
		expect(staticallyImports(home, 'virtual:site-versions')).toBe(true);
		expect(staticallyImports(footer, 'virtual:site-versions')).toBe(true);
	});

	it('neither takes `entries` off the eager module any more', () => {
		for (const code of [home, footer]) {
			const eager = /import\s*\{([^}]*)\}\s*from\s*['"`]virtual:site-versions['"`]/.exec(
				stripComments(code)
			);
			expect(eager).not.toBeNull();
			expect(eager?.[1]).not.toMatch(/\bentries\b/);
		}
	});

	it('the eager module emits the scalars those surfaces render instead', () => {
		const config = readFileSync(
			fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
			'utf8'
		);
		expect(config).toContain('virtual:site-changelog');
		/* `total` and `latest` keep the count readout and the FRC summary line
		   correct while the log itself is absent. */
		expect(config).toMatch(/export const total =/);
		expect(config).toMatch(/export const latest =/);
	});
});

describe('the matrix rain never rides the eager chunk', () => {
	const themeRoot = src('lib/design-system/themes/ThemeRoot.svelte');

	it('is fetched, not imported, by the root-layout theme component', () => {
		expect(staticallyImports(themeRoot, '$lib/MatrixRain.svelte')).toBe(false);
		expect(themeRoot).toMatch(/import\(\s*['"`]\$lib\/MatrixRain\.svelte['"`]\s*\)/);
	});

	it('is fetched only for the theme that uses it', () => {
		/* The guard and the request live in one effect, so nothing is asked for
		   until the resolved attribute is actually `matrix`. */
		expect(stripComments(themeRoot)).toMatch(
			/attr !== 'matrix'[\s\S]{0,400}?import\(\s*['"`]\$lib\/MatrixRain/
		);
	});

	/* POSITIVE CONTROL, as above. */
	it('still statically imports the theme helpers beside it', () => {
		expect(staticallyImports(themeRoot, '$lib/theme.svelte')).toBe(true);
	});

	it('MatrixRain still renders no markup, so deferring it cannot change the DOM', () => {
		const rain = src('lib/MatrixRain.svelte');
		const close = '</scr' + 'ipt>';
		const markup = rain.slice(rain.lastIndexOf(close) + close.length).trim();
		expect(markup).toBe('');
	});
});
