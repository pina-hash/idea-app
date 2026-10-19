// tests/armory-drive-mirror.test.ts
//
// THE NIGHTLY ARMORY SHARED DRIVE MIRROR (ledger 0404), over a fake store and
// a fake Drive. No container here can reach R2, Supabase or Google, so this is
// where the job's decisions are held, and each one would fail silently:
//   - A FILE IS COPIED AGAIN EVERY NIGHT (gigabytes for nothing), or a changed
//     one is skipped and the backup quietly goes stale.
//   - A REMOVED FILE IS DELETED from the backup, or never moved and so reads
//     as current.
//   - A RUN CUT OFF HALFWAY LEAVES A DUPLICATE, or the next run never finishes
//     what it started.
//   - BYTES THAT DO NOT MATCH THEIR HASH ARE UPLOADED AS THE FILE.
//   - THE JOB WRITES TO STORAGE OR THE DATABASE, or reads more than it says.

import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import { contentObjectKey as storageKey } from '../src/lib/server/armory/storage';
import { contentObjectKey } from '../src/lib/server/armory/object-key';

// Imported through a computed URL so svelte-check never pulls the tool's JS
// into its program (CLAUDE.md, Testing).
type Mod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let plan: Mod;
let cli: Mod;
const FIXTURE = JSON.parse(readFileSync(new URL('../tools/armory-drive-mirror.fixture.json', import.meta.url), 'utf8'));
const WORKFLOW = readFileSync(new URL('../.github/workflows/armory-drive-mirror.yml', import.meta.url), 'utf8');
const CLI_SRC = readFileSync(new URL('../tools/armory-drive-mirror.mjs', import.meta.url), 'utf8');
const PLAN_SRC = readFileSync(new URL('../tools/armory-drive-mirror-plan.mjs', import.meta.url), 'utf8');

beforeAll(async () => {
	plan = await import(/* @vite-ignore */ new URL('../tools/armory-drive-mirror-plan.mjs', import.meta.url).href);
	cli = await import(/* @vite-ignore */ new URL('../tools/armory-drive-mirror.mjs', import.meta.url).href);
});

/** A fresh in-memory world from the fixture, optionally carrying a Drive left by an earlier run. */
function world(drive?: Mod, edit?: (data: Mod) => void) {
	const data = structuredClone(FIXTURE);
	edit?.(data);
	const loaded = cli.loadFixture(data);
	if (drive) loaded.drive = plan.fakeDrive({ rootId: 'root', folders: drive.state.folders, files: drive.state.files, texts: drive.state.texts });
	return loaded;
}
const pathOf = (drive: Mod, fileOrFolderParent: string): string => {
	const names: string[] = [];
	let id = fileOrFolderParent;
	while (id !== 'root') {
		const f = drive.state.folders.find((x: Mod) => x.id === id);
		if (!f) return '?';
		names.unshift(f.name);
		id = f.parentId;
	}
	return names.join('/');
};
const where = (drive: Mod, fileId: string) => {
	const n = drive.state.files.find((f: Mod) => f.fileId === fileId);
	return n ? `${pathOf(drive, n.parentId)}/${n.name}` : null;
};

describe('the plan over the fixture', () => {
	test('one of each: copy, update, move, skip, remove; the person\'s own file and the empty one untouched', async () => {
		const { source, drive } = world();
		const snapshot = plan.buildSnapshot({
			projects: await source.projects(),
			files: await source.files(),
			versions: await source.versions(),
			releases: await source.releases()
		});
		expect(snapshot.entries.map((e: Mod) => e.path)).toEqual([
			'Offseason Swerve/Module/Wheel/Wheel.SLDPRT',
			'Robot 2026/Drive/Gearbox.SLDPRT',
			'Robot 2026/Drive/Plate.SLDPRT',
			'Robot 2026/Frame.SLDASM'
		]);
		expect(snapshot.noVersion).toBe(1);
		const gearbox = snapshot.entries.find((e: Mod) => e.fileId === 'f-gearbox');
		expect(gearbox).toMatchObject({ version: 2, author: 'ben@boscotech.net', savedRelease: 2025 });
		const p = plan.planMirror(snapshot, await drive.list());
		const kinds = Object.fromEntries(p.actions.map((a: Mod) => [a.entry?.fileId ?? a.id, a.kind]));
		expect(kinds).toEqual({ 'f-module': 'copy', 'f-gearbox': 'update', 'f-plate': 'skip', 'f-frame': 'move', 'g-old': 'remove' });
		const removal = p.actions.find((a: Mod) => a.kind === 'remove');
		expect(removal.to).toBe('_removed/Robot 2024/Bumper.SLDPRT');
		expect(p.folders.map((f: Mod) => f.name)).toEqual(['Offseason Swerve', 'Module', 'Wheel', '_removed', 'Robot 2024']);
		// The untagged file is never in a plan.
		expect(p.actions.some((a: Mod) => a.id === 'g-mine')).toBe(false);
	});
});

describe('a run, and a second run', () => {
	test('the first run lands every file with the right bytes; the second copies nothing and makes no folder', async () => {
		const first = world();
		const r1 = await plan.runMirror({ source: first.source, drive: first.drive });
		expect(r1).toMatchObject({ copied: 1, updated: 1, moved: 1, skipped: 1, removed: 1, failed: 0 });
		expect(where(first.drive, 'f-module')).toBe('Offseason Swerve/Module/Wheel/Wheel.SLDPRT');
		expect(where(first.drive, 'f-frame')).toBe('Robot 2026/Frame.SLDASM');
		const gearbox = first.drive.state.files.find((f: Mod) => f.fileId === 'f-gearbox');
		expect(first.drive.state.contents.get(gearbox.id).toString()).toBe('gearbox second');
		expect(first.drive.state.texts.map((t: Mod) => t.name).sort()).toEqual(['ARMORY-MANIFEST.csv', 'ARMORY-MANIFEST.json', 'README.txt']);

		const second = world(first.drive);
		const r2 = await plan.runMirror({ source: second.source, drive: second.drive });
		expect(r2).toMatchObject({ copied: 0, updated: 0, moved: 0, removed: 0, skipped: 4, keptRemoved: 1, failed: 0, foldersCreated: 0 });
		expect(second.drive.state.writes).toMatchObject({ upload: 0, updateContent: 0, move: 0, createFolder: 0 });
		expect(second.source.reads.objects).toBe(0);
		// The manifest is rewritten in place, never a second copy of it.
		expect(second.drive.state.texts).toHaveLength(3);
		expect(second.drive.state.writes.writeText).toBe(3);
	});

	test('a dry run reads and plans but writes nothing, not even a folder or the manifest', async () => {
		const { source, drive } = world();
		const r = await plan.runMirror({ source, drive, dryRun: true });
		expect(r).toMatchObject({ copied: 1, updated: 1, moved: 1, skipped: 1, removed: 1, foldersCreated: 5 });
		expect(Object.values(drive.state.writes).every((n) => n === 0)).toBe(true);
		expect(source.reads.objects).toBe(0);
		// Positive control: the same world, not dry, writes.
		const live = world();
		await plan.runMirror({ source: live.source, drive: live.drive });
		expect(live.drive.state.writes.upload).toBe(1);
	});
});

describe('stopping halfway', () => {
	test('a dropped upload leaves no copy and no duplicate; the next run finishes it', async () => {
		const first = world(undefined, (d) => {
			d.drive.failUploadsAfter = 0;
		});
		const r1 = await plan.runMirror({ source: first.source, drive: first.drive });
		expect(r1.failed).toBe(2);
		expect(r1.problems.join(' ')).toContain('the connection dropped');
		expect(first.drive.state.files.filter((f: Mod) => f.fileId === 'f-module')).toHaveLength(0);
		const csv = first.drive.state.texts.find((t: Mod) => t.name === 'ARMORY-MANIFEST.csv').text as string;
		expect(csv).toMatch(/Wheel\.SLDPRT,1,lead@boscotech\.net,2026,[0-9a-f]{64},[^,]+,12,no,not yet/);

		const second = world(first.drive);
		const r2 = await plan.runMirror({ source: second.source, drive: second.drive });
		expect(r2).toMatchObject({ copied: 1, updated: 1, failed: 0 });
		for (const id of ['f-module', 'f-gearbox', 'f-plate', 'f-frame']) {
			expect(second.drive.state.files.filter((f: Mod) => f.fileId === id), id).toHaveLength(1);
		}
	});

	test('a run that reaches its time limit leaves the rest for the next run, which takes them', async () => {
		let t = 0;
		const first = world();
		const r1 = await plan.runMirror({ source: first.source, drive: first.drive, budgetMs: 10, clock: () => (t += 100) });
		expect(r1.copied + r1.updated).toBe(0);
		expect(r1.left).toBe(2);
		expect(plan.summaryMarkdown(r1)).toContain('continues with the 2 left');
		const second = world(first.drive);
		const r2 = await plan.runMirror({ source: second.source, drive: second.drive });
		expect(r2).toMatchObject({ copied: 1, updated: 1, left: 0 });
	});
});

describe('removed files', () => {
	test('a file removed in Armory moves to _removed with its path, and nothing is deleted', async () => {
		const first = world();
		await plan.runMirror({ source: first.source, drive: first.drive });
		const before = first.drive.state.files.length;
		const second = world(first.drive, (d) => {
			d.files.find((f: Mod) => f.id === 'f-plate').deleted_at = '2026-10-10T00:00:00Z';
		});
		const r = await plan.runMirror({ source: second.source, drive: second.drive });
		expect(r.removed).toBe(1);
		expect(where(second.drive, 'f-plate')).toBe('_removed/Robot 2026/Drive/Plate.SLDPRT');
		expect(second.drive.state.files.length).toBe(before);
		// The fake Drive has no delete or trash to call; neither has the real one.
		expect(Object.keys(second.drive).filter((k) => /delete|trash|remove/i.test(k))).toEqual([]);
		expect(CLI_SRC).not.toMatch(/'DELETE'|trashed:\s*true|"trashed":\s*true/);
		// Positive control: the same sweep finds the backup tool's delete.
		expect(readFileSync(new URL('../tools/backup/drive-upload.mjs', import.meta.url), 'utf8')).toMatch(/'DELETE'/);
	});

	test('a file that comes back in Armory moves back out of _removed', async () => {
		const first = world(undefined, (d) => {
			d.files.find((f: Mod) => f.id === 'f-plate').deleted_at = '2026-10-10T00:00:00Z';
		});
		await plan.runMirror({ source: first.source, drive: first.drive });
		expect(where(first.drive, 'f-plate')).toBe('_removed/Robot 2026/Drive/Plate.SLDPRT');
		const second = world(first.drive);
		const r = await plan.runMirror({ source: second.source, drive: second.drive });
		expect(r.moved).toBe(1);
		expect(where(second.drive, 'f-plate')).toBe('Robot 2026/Drive/Plate.SLDPRT');
	});

	test('a renamed project renames its folder, and its files stay in it', async () => {
		const first = world();
		await plan.runMirror({ source: first.source, drive: first.drive });
		const second = world(first.drive, (d) => {
			d.projects.find((p: Mod) => p.id === 'p-robot').name = 'Robot 2027';
		});
		const r = await plan.runMirror({ source: second.source, drive: second.drive });
		expect(r).toMatchObject({ foldersRenamed: 1, moved: 0, copied: 0 });
		expect(where(second.drive, 'f-gearbox')).toBe('Robot 2027/Drive/Gearbox.SLDPRT');
	});
});

describe('integrity', () => {
	test('bytes that do not hash to their name are refused, not uploaded, and the run goes on', async () => {
		const { source, drive } = world(undefined, (d) => {
			d.versions.find((v: Mod) => v.id === 'v-module-1').stored = 'not the wheel';
		});
		const r = await plan.runMirror({ source, drive });
		expect(r.failed).toBe(1);
		expect(r.problems[0]).toMatch(/^Offseason Swerve\/Module\/Wheel\/Wheel\.SLDPRT: the stored bytes hash to /);
		expect(drive.state.files.some((f: Mod) => f.fileId === 'f-module')).toBe(false);
		expect(r.updated).toBe(1);
	});

	test('the mirror reads the bucket by the same key rule the website signs with', () => {
		const h = 'ab'.repeat(32);
		expect(contentObjectKey(h)).toBe(storageKey(h));
		expect(storageKey).toBe(contentObjectKey);
		expect(CLI_SRC).toContain("from '../src/lib/server/armory/object-key.ts'");
	});
});

describe('the store adapter reads, narrowly, and never writes', () => {
	test('every request is a GET, to the four tables, naming only the columns the manifest needs', async () => {
		const seen: Array<{ method: string; url: string }> = [];
		const fetcher = async (url: string, init: Mod = {}) => {
			seen.push({ method: init.method ?? 'GET', url });
			if (url.includes('r2.cloudflarestorage.com')) return new Response('wheel bytes');
			return new Response('[]', { headers: { 'content-type': 'application/json' } });
		};
		const env = Object.fromEntries(plan.MIRROR_SECRETS.map((k: string) => [k, `x-${k}`]));
		env.ARMORY_MIRROR_SUPABASE_URL = 'https://ref.supabase.co/';
		const s = cli.supabaseSource(env, fetcher);
		await Promise.all([s.projects(), s.files(), s.versions(), s.releases()]);
		const blob = await s.fetchObject('cd'.repeat(32));
		expect(blob.bytes).toBe(11);
		expect(blob.sha256).toBe(plan.sha256Of(Buffer.from('wheel bytes')));
		expect(existsSync(blob.path)).toBe(true);
		await blob.cleanup();
		expect(existsSync(blob.path)).toBe(false);
		expect(seen.every((r) => r.method === 'GET')).toBe(true);
		const tables = seen.filter((r) => r.url.includes('/rest/v1/')).map((r) => new URL(r.url).pathname.split('/').pop());
		expect(tables.sort()).toEqual(['armory_files', 'armory_projects', 'armory_version_releases', 'armory_versions']);
		const selects = seen.filter((r) => r.url.includes('/rest/v1/')).map((r) => new URL(r.url).searchParams.get('select'));
		expect(selects.sort()).toEqual([
			'id,file_id,content_sha256,byte_length,author_email,created_at',
			'id,name,pinned_release,archived_at',
			'id,project_id,folder,name,current_version_id,deleted_at',
			'version_id,saved_release'
		]);
		const r2 = seen.find((r) => r.url.includes('r2.cloudflarestorage.com'))!;
		expect(new URL(r2.url).pathname).toBe(`/x-ARMORY_MIRROR_R2_BUCKET/${contentObjectKey('cd'.repeat(32))}`);
	});

	test('a page of exactly 1000 rows asks for the next page; a short page ends it', async () => {
		const offsets: string[] = [];
		const fetcher = async (url: string) => {
			const off = new URL(url).searchParams.get('offset')!;
			offsets.push(off);
			const n = off === '0' ? 1000 : 3;
			return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `${off}-${i}` }))));
		};
		const env = Object.fromEntries(plan.MIRROR_SECRETS.map((k: string) => [k, 'x']));
		env.ARMORY_MIRROR_SUPABASE_URL = 'https://ref.supabase.co';
		const rows = await cli.supabaseSource(env, fetcher).projects();
		expect(rows).toHaveLength(1003);
		expect(offsets).toEqual(['0', '1000']);
	});
});

describe('the secrets and the workflow', () => {
	test('every secret is the job\'s own name, and the workflow hands over exactly that list', () => {
		expect(plan.MIRROR_SECRETS.length).toBe(10);
		expect(plan.MIRROR_SECRETS.every((s: string) => s.startsWith('ARMORY_MIRROR_'))).toBe(true);
		const named = [...WORKFLOW.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
		expect([...new Set(named)].sort()).toEqual([...plan.MIRROR_SECRETS].sort());
		// No reader of the website's own credential names.
		for (const src of [CLI_SRC, PLAN_SRC, WORKFLOW]) {
			expect(src).not.toMatch(/\b(?<!ARMORY_MIRROR_)SUPABASE_SERVICE_ROLE_KEY\b/);
			expect(src).not.toMatch(/\bARMORY_R2_[A-Z_]+\b/);
			expect(src).not.toMatch(/\bGOOGLE_DRIVE_REFRESH_TOKEN\b/);
		}
	});

	test('unset secrets are "not set up", naming each one; set ones are not named', () => {
		expect(plan.missingSecrets({})).toEqual(plan.MIRROR_SECRETS);
		const all = Object.fromEntries(plan.MIRROR_SECRETS.map((k: string) => [k, 'v']));
		expect(plan.missingSecrets(all)).toEqual([]);
		expect(plan.missingSecrets({ ...all, ARMORY_MIRROR_R2_BUCKET: '  ' })).toEqual(['ARMORY_MIRROR_R2_BUCKET']);
		const md = plan.notSetUpMarkdown(['ARMORY_MIRROR_R2_BUCKET']);
		expect(md).toContain('not set up');
		expect(md).toContain('`ARMORY_MIRROR_R2_BUCKET`');
	});

	test('it runs on a schedule after school in Los Angeles and by hand, never on a pull request, one at a time', () => {
		expect(WORKFLOW).toMatch(/^on:\n {2}schedule:\n {4}- cron: '7 11 \* \* \*'\n {2}workflow_dispatch:/m);
		const triggers = WORKFLOW.slice(WORKFLOW.indexOf('\non:'), WORKFLOW.indexOf('\nconcurrency:'));
		expect(triggers).toContain('schedule');
		expect(triggers).not.toMatch(/pull_request/);
		expect(WORKFLOW).toMatch(/concurrency:\n {2}group: armory-drive-mirror\n {2}cancel-in-progress: false/);
		expect(WORKFLOW).toMatch(/permissions:\n {2}contents: read/);
		// 11:07 UTC is 4:07 or 3:07 in Los Angeles: both outside 6 a.m. to 10 p.m.
		for (const day of ['2026-07-01', '2026-12-01']) {
			const hour = Number(new Date(`${day}T11:07:00Z`).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false }));
			expect(hour < 6 || hour >= 22).toBe(true);
		}
	});
});

describe('the manifest', () => {
	test('one header and one row per file, a comma or quote in a name kept intact', () => {
		const snap = plan.buildSnapshot({
			projects: [{ id: 'p', name: 'Robot, "B"', pinned_release: 2025, archived_at: '2026-10-01T00:00:00Z' }],
			files: [{ id: 'f', project_id: 'p', folder: '', name: 'a.SLDPRT', current_version_id: 'v', deleted_at: null }],
			versions: [{ id: 'v', file_id: 'f', content_sha256: 'e'.repeat(64), byte_length: 5, author_email: 'a@b', created_at: '2026-10-01T00:00:00Z' }],
			releases: []
		});
		const csv = plan.manifestCsv(plan.manifestRows(snap, new Set(['f'])));
		const lines = csv.trim().split('\r\n');
		expect(lines[0]).toBe('project,path,version,author,saved_release,sha256,saved_at,bytes,archived,in_drive');
		expect(lines[1]).toBe(`"Robot, ""B""","Robot, ""B""/a.SLDPRT",1,a@b,,${'e'.repeat(64)},2026-10-01T00:00:00Z,5,yes,yes`);
		expect(lines).toHaveLength(2);
	});
});
