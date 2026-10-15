// tests/cert-server-package.test.ts
//
// THE PACKAGE ZIP, ROUND TRIPPED (ledger 0391, PACKAGE_FORMAT.md). A parser that
// silently dropped a field, or a builder that wrote a key the parser did not
// read, would import a certification missing a piece of its kit with nothing
// on screen to say so. So: build, parse, build again, and compare every JSON
// file of the two archives byte for byte, using the Foundry zip reader (the
// production reader) to pull them back out. Then the problems a bad package
// must name, and the diff the engine shows.

import { describe, expect, it } from 'vitest';
import { inflateEntry, readCentralDirectory } from '../src/lib/foundry/zip';
import {
	PACKAGE_FILES,
	buildPackageZip,
	diffPackages,
	manifestOf,
	normalizePackage,
	packageZipName,
	parsePackageZip,
	type PackageBundle,
	type PackageLesson
} from '../src/lib/server/certifications/package-zip';
import { buildZip } from '../src/lib/foundry/zip-write';
import { emptyPackage, type CertPackage, type ExamQuestion } from '../src/lib/certifications/types';

const Q1 = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

function samplePackage(): CertPackage {
	return {
		...emptyPackage(),
		code: 'MILL-1',
		name: 'Manual Mill Level 1',
		level: 1,
		category: 'Machining',
		sort_order: 10,
		renewal: 'never',
		definition: 'Can set up and run the manual mill alone.',
		allows: 'Running the manual mill.',
		does_not_allow: 'Running the CNC router.',
		prerequisites: ['SAFE-1'],
		parts: { guided: true, exam: true, autonomous: true, checkout: true },
		training: {
			items: [
				{ kind: 'video', key: 'yt:dQw4w9WgXcQ', title: 'Part 1: the vise', youtube_id: 'dQw4w9WgXcQ', start: 0 },
				{ kind: 'video', key: 'yt:abcdefghijk', title: 'Part 2: speeds', youtube_id: 'abcdefghijk' },
				{ kind: 'lesson', key: 'lesson:tramming', title: 'Tramming the head', slug: 'tramming' }
			],
			quick_checks: [{ id: 'qc-1', after: 'yt:dQw4w9WgXcQ', prompt: 'Which jaw is fixed?', options: ['Back', 'Front'], answer: 0, explain: 'The back jaw is fixed.' }]
		},
		practice_quiz: [{ id: 'pq-1', prompt: 'A reamer does what?', options: ['Trues a hole', 'Cuts a slot', 'Faces stock'], answer: 0 }],
		study_guide: '# Study guide\n\nRead this with café ☕ and "quotes", then try the quiz.\n',
		common_mistakes: [{ title: 'Climb milling the first pass', body: 'Conventional first.' }],
		exam: { time_limit_minutes: 30, questions_per_exam: 4, topics: [{ id: 'setup', name: 'Setup', minimum: 2 }, { id: 'speeds', name: 'Speeds and feeds', minimum: 1 }] },
		guided_project: {
			objective: 'Square a block.',
			spec: 'Square 2x2x1 stock to 0.002 in.',
			acceptance: ['Flat to 0.002 in', 'Edges deburred'],
			references: [{ label: 'Drawing', href: 'https://example.org/drawing.pdf' }],
			steps: [
				{ title: 'Square the stock', body: 'Full instructions.', fade: 'full' },
				{ title: 'Cut the step', body: 'The goal only.', fade: 'goal', hint: 'Climb mill the last pass.' },
				{ title: 'Finish', body: '', fade: 'hint', hint: 'Think about deflection.' }
			],
			self_inspection: ['I measured every dimension'],
			evidence: [{ kind: 'photo', label: 'The part beside the drawing', required: true }, { kind: 'text', label: 'Your dimensions', required: false }]
		},
		autonomous_project: {
			objective: 'Make the proving part.',
			spec: 'To the drawing, alone.',
			acceptance: ['Within tolerance'],
			references: [],
			self_inspection: ['I worked alone'],
			evidence: [{ kind: 'photo', label: 'Finished part', required: true }]
		},
		checkout: { card: 'Square a block cold.', filming_guide: 'One continuous take, unlisted.' }
	};
}

function samplePool(): ExamQuestion[] {
	return [
		{ id: Q1, topic: 'setup', type: 'multiple_choice', prompt: 'The vise should be...', options: [{ key: 'a', text: 'trammed' }, { key: 'b', text: 'loose' }], answer: 'a', explain: 'Always tram.', active: true },
		{ topic: 'setup', type: 'multiple_select', prompt: 'Pick the PPE.', options: [{ key: 'a', text: 'Glasses' }, { key: 'b', text: 'Gloves' }, { key: 'c', text: 'Apron' }], answer: ['a', 'c'], active: true },
		{ topic: 'speeds', type: 'numeric', prompt: 'RPM for a 1/2 in HSS end mill in aluminum at 300 SFM?', options: null, answer: { value: 2292, tolerance: 50, unit: 'rpm' }, active: true },
		{ topic: 'speeds', type: 'short', prompt: 'Name the tool that trues a hole to size.', options: null, answer: { accept: ['reamer', 'a reamer'] }, active: false }
	];
}

function sampleLessons(): PackageLesson[] {
	return [{ slug: 'tramming', title: 'Tramming the head', document: '<!doctype html><html><body><h1>Tramming</h1></body></html>', manifest: {} }];
}

async function filesOf(zip: Uint8Array): Promise<Map<string, Uint8Array>> {
	const records = readCentralDirectory(zip);
	if (!records) throw new Error('not a zip');
	const out = new Map<string, Uint8Array>();
	for (const r of records) out.set(r.name, await inflateEntry(zip, r, r.name));
	return out;
}

const text = (b: Uint8Array | undefined) => new TextDecoder().decode(b ?? new Uint8Array());

describe('build then parse then build', () => {
	it('writes every file the format names and parses back with no problems', async () => {
		const zip = await buildPackageZip({ package: samplePackage() }, samplePool(), sampleLessons());
		const files = await filesOf(zip);
		for (const name of ['certification.json', 'study-guide.md', 'common-mistakes.json', 'practice-quiz.json', 'exam-pool.json', 'guided-project.json', 'autonomous-project.json', 'checkout.json', 'videos.json', 'README.md', 'lessons/tramming.html', 'lessons/tramming.manifest.json']) {
			expect(files.has(name), name).toBe(true);
		}
		expect(JSON.parse(text(files.get('certification.json')))).toEqual(manifestOf(samplePackage()));
		expect(text(files.get('study-guide.md'))).toBe(samplePackage().study_guide);
		expect(text(files.get('README.md'))).toContain('MILL-1');
		expect(text(files.get('README.md'))).not.toMatch(/\u2014/);

		const parsed = await parsePackageZip(zip);
		expect(parsed.problems).toEqual([]);
		expect(parsed.package).toEqual(normalizePackage(samplePackage()));
		expect(parsed.lessons).toEqual(sampleLessons());
		expect(parsed.pool).toHaveLength(4);
		expect(parsed.pool[0].id).toBe(Q1);
		expect(parsed.pool[1].id).toBeUndefined();
		expect(parsed.pool[3].active).toBe(false);
	});

	it('is byte-identical on every JSON file after a second build from the parsed result', async () => {
		const first = await buildPackageZip({ package: samplePackage() }, samplePool(), sampleLessons());
		const parsed = await parsePackageZip(first);
		expect(parsed.problems).toEqual([]);
		const second = await buildPackageZip({ package: parsed.package! }, parsed.pool, parsed.lessons);
		const a = await filesOf(first);
		const b = await filesOf(second);
		expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
		let compared = 0;
		for (const [name, bytes] of a) {
			if (!name.endsWith('.json') && !name.endsWith('.md') && !name.endsWith('.html')) continue;
			expect(Buffer.from(b.get(name)!).equals(Buffer.from(bytes)), name).toBe(true);
			compared += 1;
		}
		expect(compared).toBe(12);
		expect(packageZipName('MILL-1')).toBe('MILL-1.idea-certification.zip');
	});

	it('accepts a bare item array in videos.json and a zip re-zipped inside one folder', async () => {
		const enc = new TextEncoder();
		const zip = await buildZip([
			{ path: 'MILL-1/certification.json', bytes: enc.encode(JSON.stringify(manifestOf(samplePackage()))) },
			{ path: 'MILL-1/videos.json', bytes: enc.encode(JSON.stringify([{ kind: 'video', key: 'yt:dQw4w9WgXcQ', title: 'One', youtube_id: 'dQw4w9WgXcQ' }])) },
			{ path: 'MILL-1/lessons/tramming.html', bytes: enc.encode('<p>x</p>') }
		]);
		const parsed = await parsePackageZip(zip);
		expect(parsed.problems).toEqual([]);
		expect(parsed.package?.training.items).toEqual([{ kind: 'video', key: 'yt:dQw4w9WgXcQ', title: 'One', youtube_id: 'dQw4w9WgXcQ' }]);
		expect(parsed.package?.practice_quiz).toEqual([]);
		expect(parsed.package?.guided_project).toBeNull();
		expect(parsed.lessons).toEqual([{ slug: 'tramming', title: 'tramming', document: '<p>x</p>', manifest: {} }]);
	});
});

describe('problems', () => {
	it('names the file and the field, and never throws', async () => {
		const enc = new TextEncoder();
		const manifest = { ...manifestOf(samplePackage()), level: 12, renewal: 'yearly', prerequisites: ['MILL-1', 'bad code'], exam: { time_limit_minutes: 0, questions_per_exam: 2, topics: [{ id: 'setup', name: 'Setup', minimum: 2 }, { id: 'setup', name: 'Again', minimum: 1 }] } };
		const zip = await buildZip([
			{ path: 'certification.json', bytes: enc.encode(JSON.stringify(manifest)) },
			{ path: 'videos.json', bytes: enc.encode(JSON.stringify({ items: [{ kind: 'video', title: 'x', youtube_id: 'short' }, { kind: 'podcast' }], quick_checks: [{ id: 'q', after: 'yt:nothing', prompt: 'p', options: ['a', 'b'], answer: 5 }] })) },
			{ path: 'exam-pool.json', bytes: enc.encode(JSON.stringify([{ topic: 'nope', type: 'multiple_choice', prompt: 'p', options: [{ key: 'a', text: 'x' }, { key: 'a', text: 'y' }], answer: 'z' }, { topic: 'setup', type: 'teleport', prompt: 'p' }, { topic: 'setup', type: 'numeric', prompt: 'p', answer: { value: 'x' } }])) },
			{ path: 'autonomous-project.json', bytes: enc.encode(JSON.stringify({ objective: 'o', steps: [{ title: 't', body: 'b', fade: 'full' }] })) },
			{ path: 'guided-project.json', bytes: enc.encode(JSON.stringify({ objective: 'o', steps: [{ title: 't', body: 'b', fade: 'sideways' }], evidence: [{ kind: 'hologram', label: 'x' }], references: [{ label: 'l', href: 'ftp://x' }] })) },
			{ path: 'common-mistakes.json', bytes: enc.encode('{ not json') },
			{ path: 'practice-quiz.json', bytes: enc.encode(JSON.stringify({ not: 'an array' })) },
			{ path: 'checkout.json', bytes: enc.encode(JSON.stringify({ card: 1 })) },
			{ path: 'lessons/Bad Slug.html', bytes: enc.encode('<p>') },
			{ path: 'lessons/orphan.manifest.json', bytes: enc.encode('{}') }
		]);
		const parsed = await parsePackageZip(zip);
		const p = parsed.problems;
		const has = (file: string, fragment: string) => p.some((x) => x.startsWith(`${file}: `) && x.includes(fragment));
		expect(has('certification.json', '"level"')).toBe(true);
		expect(has('certification.json', '"renewal"')).toBe(true);
		expect(has('certification.json', 'name the certification itself')).toBe(true);
		expect(has('certification.json', '"prerequisites[1]"')).toBe(true);
		expect(has('certification.json', '"exam.time_limit_minutes"')).toBe(true);
		expect(has('certification.json', 'repeats "setup"')).toBe(true);
		expect(has('certification.json', 'add up to 3')).toBe(true);
		expect(has('videos.json', '"items[0].youtube_id"')).toBe(true);
		expect(has('videos.json', '"items[1].kind"')).toBe(true);
		expect(has('videos.json', '"quick_checks[0].after"')).toBe(true);
		expect(has('videos.json', '"[0]" "answer"')).toBe(true);
		expect(has('exam-pool.json', 'not a topic id')).toBe(true);
		expect(has('exam-pool.json', '"options[1].key" repeats "a"')).toBe(true);
		expect(has('exam-pool.json', '"[1]" "type"')).toBe(true);
		expect(has('exam-pool.json', '"[2]" "answer" must be { "value"')).toBe(true);
		expect(has('autonomous-project.json', 'objective only')).toBe(true);
		expect(has('guided-project.json', '"steps[0].fade"')).toBe(true);
		expect(has('guided-project.json', '"evidence[0].kind"')).toBe(true);
		expect(has('guided-project.json', '"references[0].href"')).toBe(true);
		expect(has('common-mistakes.json', 'not valid JSON')).toBe(true);
		expect(has('practice-quiz.json', 'must be an array')).toBe(true);
		expect(has('checkout.json', '"card"')).toBe(true);
		expect(has('lessons/Bad Slug.html', 'lowercase')).toBe(true);
		expect(has('lessons/orphan.manifest.json', 'orphan.html')).toBe(true);
		// Still a package object, so the engine can show the problems beside what it read.
		expect(parsed.package?.code).toBe('MILL-1');
	});

	it('a missing manifest, a non-zip and an oversized file are each one plain problem', async () => {
		const noManifest = await parsePackageZip(await buildZip([{ path: 'study-guide.md', bytes: new TextEncoder().encode('x') }]));
		expect(noManifest.package).toBeNull();
		expect(noManifest.problems).toEqual(['certification.json: is missing. A package needs its manifest.']);
		const garbage = await parsePackageZip(new TextEncoder().encode('this is not a zip at all, not even close'));
		expect(garbage.problems).toEqual(['package: the file is not a ZIP archive this portal can read.']);
		expect(await parsePackageZip(new Uint8Array(0))).toMatchObject({ package: null, problems: ['package: the file is not a ZIP archive this portal can read.'] });
	});
});

describe('diffPackages', () => {
	it('lists only what changed, by path, with before and after', async () => {
		const current: PackageBundle = { package: samplePackage(), pool: samplePool(), lessons: sampleLessons() };
		const incoming: PackageBundle = {
			package: { ...samplePackage(), name: 'Manual Mill, Level 1', common_mistakes: [] },
			pool: samplePool().map((q) => (q.id === Q1 ? { ...q, prompt: 'The vise must be...' } : q)),
			lessons: [{ ...sampleLessons()[0], document: '<p>new</p>' }]
		};
		const diff = diffPackages(current, incoming);
		const paths = diff.map((d) => d.path);
		expect(paths).toContain('package.name');
		expect(paths).toContain('package.common_mistakes');
		expect(paths).toContain(`pool[${Q1}].prompt`);
		expect(paths).toContain('lessons[tramming].document');
		expect(diff.find((d) => d.path === 'package.name')).toEqual({ path: 'package.name', before: 'Manual Mill Level 1', after: 'Manual Mill, Level 1' });
		expect(paths.some((p) => p.startsWith('package.study_guide'))).toBe(false);
		expect(diffPackages(current, current)).toEqual([]);
		// Everything is new against nothing.
		const fresh = diffPackages(null, incoming);
		expect(fresh.every((d) => d.before === undefined)).toBe(true);
		expect(fresh.length).toBeGreaterThan(20);
	});
});
