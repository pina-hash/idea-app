// tests/deploy-probe-step.test.ts
//
// THE PROBE STEP IN `deploy.yml` IS EXTRACTED FROM THE PARSED YAML AND RUN,
// under the shell GitHub actually uses, against a stub probe.
//
// WHY IT EXISTS, AND IT IS NOT A HYPOTHETICAL. That step opened `set -uo
// pipefail`, which does NOT clear ERREXIT: GitHub invokes a `run:` body as
// `bash --noprofile --norc -eo pipefail {0}`, so `-e` is already on before the
// first line, and `set -o` only turns options ON. The probe's own exit 1 and
// exit 3 therefore killed the step before `PROBE=$?` was ever read -- so the
// `case` below it, INCLUDING the typed confirmation that is the only escape
// hatch from gate 4, was unreachable code from the day it was written.
//
// Ledger 0215 measured it on two real runs of the workflow, `34743453154` with
// the confirmation field empty and `34743521550` with it typed correctly, and
// NEITHER printed the `probe exit:` line one statement below the redirect.
//
// A FIX ASSERTED FROM READING THE YAML IS NOT A FIX. Every check here runs the
// REAL body out of the REAL file, unmodified, under `bash -e`. What is stubbed
// is `tools/deploy-probe.mjs` itself -- a script in a temp tree that exits with
// whatever status the case under test needs -- so the thing being measured is
// the step's own control flow and nothing else.
//
// THE TWO DIRECTIONS THE PROMPT ASKS FOR, and they are two axes rather than
// two cases: the probe exiting 1 and exiting 3 (the statuses that used to kill
// the step), each with the confirmation PRESENT and ABSENT. All four are below,
// plus exit 0 and exit 2 so the arms that always worked are pinned too.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const WORKFLOW = fileURLToPath(new URL('../.github/workflows/deploy.yml', import.meta.url));

/* -------------------------------------------------------------------------- */
/* Getting the body out of the file.                                          */
/* -------------------------------------------------------------------------- */

/**
 * THE EXTRACTION IS A REAL YAML PARSE. There is no YAML package in this repo's
 * `node_modules` (measured: both `yaml` and `js-yaml` fail to resolve), and
 * PyYAML is what `tests/workflows.test.ts` already validates its own hand
 * reader against, so the parse is done in python3 and the body comes back as
 * JSON.
 *
 * It is addressed by the STEP'S `id`, not by its position or its name: a step
 * renamed or moved should not silently make this file measure a different
 * script, and an id is the one handle in a workflow that is meant to be stable.
 */
function stepBodyViaPyYaml(id: string): string | null {
	const py = `
import json, sys
try:
    import yaml
except Exception:
    print(json.dumps({"ok": False, "why": "PyYAML not importable"})); sys.exit(0)
with open(${JSON.stringify(WORKFLOW)}, encoding="utf8") as fh:
    doc = yaml.safe_load(fh)
for job in doc["jobs"].values():
    for step in job.get("steps", []):
        if step.get("id") == ${JSON.stringify(id)}:
            print(json.dumps({"ok": True, "run": step["run"]})); sys.exit(0)
print(json.dumps({"ok": False, "why": "no step with that id"}))
`;
	const p = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
	if (p.status !== 0) return null;
	const parsed = JSON.parse(p.stdout) as { ok: boolean; run?: string; why?: string };
	if (!parsed.ok) {
		// A MISSING STEP IS A FAILURE, A MISSING PARSER IS NOT. The first means
		// the workflow moved out from under this file; the second means the
		// instrument is absent, which the fallback below covers.
		if (parsed.why === 'no step with that id') {
			throw new Error(`deploy.yml has no step with id "${id}"`);
		}
		return null;
	}
	return parsed.run!;
}

/**
 * The fallback, used ONLY when PyYAML is not importable, so a runner without it
 * gets a real run rather than a skip. It reads one block scalar and nothing
 * else -- deliberately narrower than `tests/workflows.test.ts`'s general reader,
 * which is not exported and which this must not become a second copy of. When
 * BOTH instruments are available the test below asserts they return the SAME
 * string, which is the positive control on this half.
 */
function stepBodyByBlockScalar(id: string): string {
	const lines = readFileSync(WORKFLOW, 'utf8').replace(/\r\n/g, '\n').split('\n');
	const at = lines.findIndex((l) => l.trim() === `id: ${id}`);
	if (at < 0) throw new Error(`deploy.yml has no step with id "${id}"`);
	const runAt = lines.findIndex((l, i) => i > at && /^\s*run:\s*\|\s*$/.test(l));
	if (runAt < 0) throw new Error(`the step "${id}" has no block-scalar run:`);
	const keyIndent = lines[runAt].length - lines[runAt].trimStart().length;
	const body: string[] = [];
	for (let i = runAt + 1; i < lines.length; i++) {
		const l = lines[i];
		if (l.trim() !== '' && l.length - l.trimStart().length <= keyIndent) break;
		body.push(l.slice(keyIndent + 2));
	}
	while (body.length && body[body.length - 1].trim() === '') body.pop();
	return body.join('\n') + '\n';
}

/**
 * Every `run:` body in the file, for the syntax sweep below. Same parse, same
 * reason: a body that is read but never parsed by a shell is a body whose
 * quoting nobody has checked.
 */
function allRunBodies(): { step: string; run: string }[] | null {
	const py = `
import json, sys
try:
    import yaml
except Exception:
    print(json.dumps(None)); sys.exit(0)
with open(${JSON.stringify(WORKFLOW)}, encoding="utf8") as fh:
    doc = yaml.safe_load(fh)
out = []
for job in doc["jobs"].values():
    for step in job.get("steps", []):
        if isinstance(step.get("run"), str):
            out.append({"step": step.get("name") or step.get("id") or "(unnamed)", "run": step["run"]})
print(json.dumps(out))
`;
	const p = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
	if (p.status !== 0) return null;
	return JSON.parse(p.stdout) as { step: string; run: string }[] | null;
}

const viaYaml = stepBodyViaPyYaml('probe');
const BODY = viaYaml ?? stepBodyByBlockScalar('probe');
const INSTRUMENT = viaYaml ? 'PyYAML' : 'block-scalar fallback';

/* -------------------------------------------------------------------------- */
/* Running it the way GitHub does.                                            */
/* -------------------------------------------------------------------------- */

const TEMPS: string[] = [];
afterAll(() => {
	for (const d of TEMPS) rmSync(d, { recursive: true, force: true });
});

type Run = { status: number; stdout: string; outputs: string; summary: string };

/**
 * `bash --noprofile --norc -eo pipefail <script>` is GitHub's own default shell
 * for a `run:` body, spelled out here rather than approximated, because the
 * whole defect lives in the `-e` it carries.
 *
 * @param probeExit what the stubbed `tools/deploy-probe.mjs` exits with
 * @param env the step's own `env:` mapping, as the workflow would set it
 */
function runStep(probeExit: number, env: Record<string, string>): Run {
	const dir = mkdtempSync(join(tmpdir(), 'deploy-step-'));
	TEMPS.push(dir);
	mkdirSync(join(dir, 'tools'));

	// THE STUB IS A REAL FILE AT THE REAL PATH the step invokes, so the command
	// line, the redirects and the exit status are all the genuine article.
	// An exit of 0 or 2 needs a findings array, because those arms run `jq`
	// over it; 1 and 3 are the silent statuses and write nothing to stdout,
	// which is also what the real tool does when it cannot run.
	const findings =
		probeExit === 0 || probeExit === 2
			? JSON.stringify({
					since: 151,
					ref: 'deadbeef',
					exit: probeExit,
					// THE MERGED PAYLOAD SHAPE. `table` is the table's NAME now
					// (it was 'present'/'absent' before the 0213/0216 merge) and
					// presence, readability and the row count are three separate
					// fields, because "could not read it" and "read it and it is
					// empty" are different answers.
					history: {
						table: 'supabase_migrations.schema_migrations',
						present: true,
						readable: true,
						recorded: 209,
						why: 'supabase_migrations.schema_migrations carries 209 row(s).'
					},
					findings: [
						{
							num: '0209',
							file: '0209_ideacad_history.sql',
							object: 'table public.ideacad_history',
							state: probeExit === 0 ? 'applied' : 'not-applied',
							why: '',
							record: 'recorded',
							evidence: probeExit === 0 ? 'applied' : 'not-applied',
							agreement: probeExit === 2 ? 'conflict' : 'agree',
							readFrom: 'catalog'
						},
						// A migration with NO probeable object, carried by its
						// row. This is the shape 0202, 0203 and 0206 have on
						// this tree, and the summary must say so in words
						// rather than presenting a claim as a measurement.
						{
							num: '0202',
							file: '0202_tournament_dry_run.sql',
							object: 'no probe',
							state: probeExit === 0 ? 'applied' : 'not-applied',
							why: '',
							record: 'recorded',
							evidence: 'unknown',
							agreement: probeExit === 0 ? 'record-only' : 'neither',
							readFrom: probeExit === 0 ? 'history row' : '--'
						}
					]
				})
			: '';
	writeFileSync(
		join(dir, 'tools', 'deploy-probe.mjs'),
		`const json = process.argv.includes('--json');\n` +
			`const body = ${JSON.stringify(findings)};\n` +
			`if (json && body) process.stdout.write(body);\n` +
			`if (!json) process.stdout.write('stub text report\\n');\n` +
			`process.stderr.write('stub: probe could not confirm\\n');\n` +
			`process.exit(${probeExit});\n`
	);
	chmodSync(join(dir, 'tools', 'deploy-probe.mjs'), 0o755);

	const script = join(dir, 'step.sh');
	writeFileSync(script, BODY);

	const outputs = join(dir, 'GITHUB_OUTPUT');
	const summary = join(dir, 'GITHUB_STEP_SUMMARY');
	writeFileSync(outputs, '');
	writeFileSync(summary, '');

	const p = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
		cwd: dir,
		encoding: 'utf8',
		env: {
			PATH: process.env.PATH,
			HOME: dir,
			GITHUB_OUTPUT: outputs,
			GITHUB_STEP_SUMMARY: summary,
			...env
		}
	});
	return {
		status: p.status ?? -1,
		stdout: (p.stdout ?? '') + (p.stderr ?? ''),
		outputs: readFileSync(outputs, 'utf8'),
		summary: readFileSync(summary, 'utf8')
	};
}

/** The last value written for an output key, which is what Actions reads. */
const outputOf = (r: Run, key: string): string | null => {
	const hits = [...r.outputs.matchAll(new RegExp(`^${key}=(.*)$`, 'gm'))];
	return hits.length ? hits[hits.length - 1][1] : null;
};

const DISPATCH = { SHA: 'deadbeef', EVENT: 'workflow_dispatch' };
const SCHEDULE = { SHA: 'deadbeef', EVENT: 'schedule' };

/* -------------------------------------------------------------------------- */

describe('the extraction itself', () => {
	it('reads a real body, and the two instruments agree when both are there', () => {
		expect(BODY).toContain('case "$PROBE"');
		expect(BODY).toContain('PROBE=$?');
		// THE POSITIVE CONTROL ON THE FALLBACK READER. A narrow hand reader that
		// agrees with a real YAML parse is a reader; one that has never been
		// compared is a guess.
		if (viaYaml) expect(stepBodyByBlockScalar('probe').trim()).toBe(viaYaml.trim());
		expect(['PyYAML', 'block-scalar fallback']).toContain(INSTRUMENT);
	});

	it('the body clears ERREXIT before it runs anything', () => {
		// The assertion that would have caught the defect by reading alone. It
		// is here as documentation of the mechanism; the runs below are the
		// proof, because this one passes for a body that clears `-e` and then
		// gets the control flow wrong anyway.
		const firstCommand = BODY.split('\n')
			.map((l) => l.trim())
			.filter((l) => l !== '' && !l.startsWith('#'))[0];
		expect(firstCommand).toBe('set +e');
	});
});

describe('every run: body in the file is valid shell', () => {
	// THIS BIT DURING THIS BUNDLE AND IS WHY IT IS HERE. A summary line added to
	// the status-2 arm contained the word `production's` INSIDE a single-quoted
	// `jq` program, which closed the quote early and made the whole step a
	// syntax error -- bash exit 2, before a single statement ran. Nothing in the
	// YAML parse, `svelte-check` or a careful re-read of the diff reports that;
	// the step tests above caught it only because they RUN the body.
	//
	// `bash -n` parses without executing, so this covers every step in the file
	// rather than only the one with a harness around it.
	const bodies = allRunBodies();

	it('at least one body was found, so this sweep is not vacuous', () => {
		expect(bodies === null || bodies.length > 0).toBe(true);
		if (bodies) expect(bodies.length).toBeGreaterThanOrEqual(4);
	});

	it('bash -n accepts every one of them', () => {
		for (const b of bodies ?? [{ step: 'probe', run: BODY }]) {
			const p = spawnSync('bash', ['-n'], { input: b.run, encoding: 'utf8' });
			expect(p.status, `${b.step}: ${(p.stderr ?? '').trim()}`).toBe(0);
		}
	});

	it('positive control: bash -n rejects the quoting mistake this sweep exists for', () => {
		// Without this, "every body parsed" cannot be told from "the sweep never
		// looked". The mutant is the real one, in miniature.
		const broken = "jq -r '.x | \"production's catalog\"' probe.json\n";
		expect(spawnSync('bash', ['-n'], { input: broken, encoding: 'utf8' }).status).not.toBe(0);
	});
});

describe('probe exit 1 -- the probe could not run at all', () => {
	// THE MEASURED DEFECT. Before the fix this step died here, so neither of
	// these two cases reached a single line of the `case`.
	it('with NOTHING typed: the step reads the status, reports, and refuses', () => {
		const r = runStep(1, { ...DISPATCH, CONFIRMED: 'no' });
		expect(r.stdout, 'the step died before reading the probe status').toContain('probe exit: 1');
		expect(r.status, 'a dispatch with nothing typed must refuse, deliberately').toBe(1);
		expect(outputOf(r, 'go')).toBe('no');
		expect(r.summary).toContain('every migration on integration is applied to production');
	});

	it('with the confirmation typed: THE FALLBACK RUNS, and the deploy proceeds', () => {
		// This is the case the whole fallback exists for and the case that had
		// never once executed. Run `34743521550` typed this exact phrase and
		// the step still died.
		const r = runStep(1, { ...DISPATCH, CONFIRMED: 'yes' });
		expect(r.stdout).toContain('probe exit: 1');
		expect(r.status, 'the typed confirmation did not carry the run').toBe(0);
		expect(outputOf(r, 'go')).toBe('yes');
		expect(r.summary).toContain('A person carried it');
	});
});

describe('probe exit 3 -- cannot confirm every migration in range', () => {
	it('with NOTHING typed on a dispatch: refuses', () => {
		const r = runStep(3, { ...DISPATCH, CONFIRMED: 'no' });
		expect(r.stdout).toContain('probe exit: 3');
		expect(r.status).toBe(1);
		expect(outputOf(r, 'go')).toBe('no');
		expect(r.summary).toContain('at least one migration has no probe to run');
	});

	it('with the confirmation typed: the fallback runs', () => {
		const r = runStep(3, { ...DISPATCH, CONFIRMED: 'yes' });
		expect(r.stdout).toContain('probe exit: 3');
		expect(r.status).toBe(0);
		expect(outputOf(r, 'go')).toBe('yes');
	});

	it('on a SCHEDULE it stops and stays green, and no typed string is consulted', () => {
		// Nothing is wrong on a scheduled run the probe cannot speak for, and a
		// red mark every night is one nobody reads. `go` is still `no`.
		const r = runStep(3, { ...SCHEDULE, CONFIRMED: 'no' });
		expect(r.status).toBe(0);
		expect(outputOf(r, 'go')).toBe('no');
		expect(r.summary).toContain('Stopped, and this run is green');
	});

	it('a SCHEDULED run cannot be carried by a confirmation, even if one is set', () => {
		// There is nobody to type on a schedule, so a `yes` arriving there is a
		// bug somewhere else and must not deploy.
		const r = runStep(3, { ...SCHEDULE, CONFIRMED: 'yes' });
		expect(r.status).toBe(0);
		expect(outputOf(r, 'go')).toBe('no');
	});
});

describe('the two statuses that always worked, pinned so the fix did not move them', () => {
	it('exit 0 deploys on the machine reading alone, with nothing typed', () => {
		const r = runStep(0, { ...SCHEDULE, CONFIRMED: 'no' });
		expect(r.stdout).toContain('probe exit: 0');
		expect(r.status).toBe(0);
		expect(outputOf(r, 'go')).toBe('yes');
		expect(r.summary).toContain('Nobody typed anything and nobody had to');
		// THE SUMMARY SAYS WHICH HALF ANSWERED EACH ROW. A claim presented as a
		// measurement is the one way this widening could be wrong and still
		// look right, so the table names both and explains the difference.
		expect(r.summary).toContain('Migration history table: present');
		expect(r.summary).toMatch(/\|\s*`0209`\s*\|\s*APPLIED\s*\|\s*catalog\s*\|/);
		expect(r.summary).toMatch(/\|\s*`0202`\s*\|\s*APPLIED\s*\|\s*history row\s*\|/);
		expect(r.summary).toContain('which is a claim nothing contradicted');
	});

	it('exit 2 REFUSES, and the typed confirmation does not override it', () => {
		// A machine-read fact about production. No trigger and no typed string
		// is exempt from it.
		for (const confirmed of ['no', 'yes']) {
			const r = runStep(2, { ...DISPATCH, CONFIRMED: confirmed });
			expect(r.stdout).toContain('probe exit: 2');
			expect(r.status, `a typed "${confirmed}" changed a status 2`).toBe(1);
			expect(outputOf(r, 'go')).toBe('no');
			expect(r.summary).toContain('REFUSED');
			// A conflict between the history row and the catalog is named in
			// the refusal rather than absorbed into a bare NOT APPLIED.
			expect(r.summary).toContain('CONFLICT');
			expect(r.summary).toContain('the catalog is the evidence');
		}
	});

	it('positive control: go is not simply always the same word', () => {
		const seen = new Set([
			outputOf(runStep(0, { ...SCHEDULE, CONFIRMED: 'no' }), 'go'),
			outputOf(runStep(2, { ...DISPATCH, CONFIRMED: 'yes' }), 'go')
		]);
		expect([...seen].sort()).toEqual(['no', 'yes']);
	});
});

describe('the defect itself, reproduced', () => {
	it('the SAME body with ERREXIT left on dies before reading the status', () => {
		// THE NEGATIVE CONTROL. Without it, "the fallback ran" cannot be told
		// from "this harness would pass on the broken file too". The one edit
		// is removing the `set +e` line -- which is exactly what the file said
		// before this bundle.
		const broken = BODY.replace(/^\s*set \+e\s*$/m, '');
		expect(broken).not.toBe(BODY);

		const dir = mkdtempSync(join(tmpdir(), 'deploy-step-broken-'));
		TEMPS.push(dir);
		mkdirSync(join(dir, 'tools'));
		writeFileSync(join(dir, 'tools', 'deploy-probe.mjs'), 'process.exit(1);\n');
		const script = join(dir, 'step.sh');
		writeFileSync(script, broken);
		const outputs = join(dir, 'GITHUB_OUTPUT');
		const summary = join(dir, 'GITHUB_STEP_SUMMARY');
		writeFileSync(outputs, '');
		writeFileSync(summary, '');
		const p = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
			cwd: dir,
			encoding: 'utf8',
			env: {
				PATH: process.env.PATH,
				HOME: dir,
				GITHUB_OUTPUT: outputs,
				GITHUB_STEP_SUMMARY: summary,
				SHA: 'deadbeef',
				EVENT: 'workflow_dispatch',
				CONFIRMED: 'yes'
			}
		});
		expect(p.stdout ?? '').not.toContain('probe exit:');
		expect(p.status).toBe(1);
		expect(readFileSync(outputs, 'utf8'), 'the broken body reached the case').toBe('');
		expect(readFileSync(summary, 'utf8')).toBe('');
	});
});

describe('the step is still wired into the job the way the workflow claims', () => {
	it('the probe step is the one whose output drives the deploy gate', () => {
		const src = readFileSync(WORKFLOW, 'utf8');
		// `steps.probe.outputs.go` is what `migrations.outputs.go` is, and
		// `needs.migrations.outputs.go == 'yes'` is what gates both later jobs.
		expect(src).toContain('go: ${{ steps.probe.outputs.go }}');
		expect(src.match(/needs\.migrations\.outputs\.go == 'yes'/g)?.length).toBe(2);
	});

	it('the real parse is used wherever it is available, and only then', () => {
		// A FALLBACK THAT SILENTLY BECAME THE ONLY INSTRUMENT IS ONE NOBODY
		// KNOWS THEY ARE RELYING ON. This does not require PyYAML to exist --
		// which would redden a runner over an optional interpreter package and
		// tell nobody anything about this workflow -- it requires the SELECTION
		// to be right in whichever environment it runs: the parse when the
		// parse is there, the fallback only when it is not.
		expect(execFileSync('python3', ['--version'], { encoding: 'utf8' }).trim()).toMatch(/^Python 3/);
		const hasYaml =
			spawnSync('python3', ['-c', 'import yaml'], { encoding: 'utf8' }).status === 0;
		expect(INSTRUMENT).toBe(hasYaml ? 'PyYAML' : 'block-scalar fallback');
	});
});
