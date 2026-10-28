// tests/classroom-team-photos.test.ts
//
// LEDGER 0456, 0316: THE CLIENT HALF OF "A TEAM'S PICTURES ARE THE TEAM'S".
//
// `teamImagesFrom` turns `classroom_team_files` into the document's picture map,
// and `teamProgressFor` turns `classroom_team_progress` into every teammate's
// percent. Held, both directions, against a Launcher-shaped manifest (four role
// sketches, the individual concept sketch, a team table):
//   - a team or role picture lands on its field; an individual block's never
//     does, even when a payload names it;
//   - with 0316's progress payload (the team's boxes counted for every member)
//     the team's part reads the same percent for every teammate (report
//     aac90533), and an individual picture still counts for its owner only.

import { describe, expect, it } from 'vitest';
import { teamImagesFrom } from '../src/lib/classroom/html-assignment/team-doc';
import { teamProgressFor } from '../src/lib/classroom/html-assignment/team';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';

const block = (id: string, field: string, type: string, extra: Record<string, unknown> = {}) => ({ id, field, type, ...extra });
const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Launcher',
	points: 20,
	team: { roles: ['frame', 'energy', 'drive', 'ballpath'].map((id) => ({ id, title: id })) },
	modules: [
		{ id: 'idea', title: 'Idea', points: 4, audience: 'individual', blocks: [block('idea-line', 'ideaLine', 'text'), block('idea-sketch', 'ideaSketch', 'image')], criteria: [] },
		{ id: 'select', title: 'Pick', points: 4, audience: 'team', blocks: [block('wot', 'wot', 'table'), block('pick-why', 'pickWhy', 'longText')], criteria: [] },
		...['frame', 'energy', 'drive', 'ballpath'].map((r) => ({
			id: `m-${r}`,
			title: r,
			points: 3,
			audience: 'role',
			role: r,
			blocks: [block(`${r}-req`, `${r}Req`, 'text'), block(`${r}-sketch`, `${r}Sketch`, 'image')],
			criteria: []
		}))
	]
} as unknown as HtmlAssignmentManifest;

describe('teamImagesFrom', () => {
	it('lays a team or role picture on its field, newest from the server, read as a proxy URL', () => {
		const out = teamImagesFrom(MANIFEST, {
			ok: true,
			files: [
				{ id: '11111111-1111-1111-1111-111111111111', block_id: 'drive-sketch', filename: 'drive.png', caption: 'Top view' },
				{ id: '22222222-2222-2222-2222-222222222222', block_id: 'frame-sketch', filename: 'frame.jpg', caption: null }
			]
		});
		expect(Object.keys(out).sort()).toEqual(['driveSketch', 'frameSketch']);
		expect(out.driveSketch).toEqual({ url: '/api/classroom/submission-file/11111111-1111-1111-1111-111111111111', name: 'drive.png', caption: 'Top view' });
		expect(out.frameSketch.caption).toBe('');
	});

	it('never lays an individual picture, an unknown block or a malformed row', () => {
		const out = teamImagesFrom(MANIFEST, {
			ok: true,
			files: [
				{ id: '33333333-3333-3333-3333-333333333333', block_id: 'idea-sketch', filename: 'mine.png' },
				{ id: '44444444-4444-4444-4444-444444444444', block_id: 'gone-block', filename: 'x.png' },
				{ block_id: 'energy-sketch' },
				null,
				{ id: '55555555-5555-5555-5555-555555555555', block_id: 'energy-sketch', filename: 'e.png' }
			]
		});
		expect(Object.keys(out)).toEqual(['energySketch']);
		expect(teamImagesFrom(MANIFEST, null)).toEqual({});
		expect(teamImagesFrom(MANIFEST, { ok: false, message: 'no' })).toEqual({});
	});
});

describe('one percent for the team (aac90533)', () => {
	// 0316's payload: the team's own boxes and every member's team or role
	// pictures appear for EVERY member; each member's individual answers are their own.
	const shared = ['wot', 'pick-why', 'frame-req', 'energy-req', 'drive-req', 'ballpath-req'];
	const sharedImages = ['frame-sketch', 'energy-sketch', 'drive-sketch', 'ballpath-sketch'];
	const raw = {
		teams: [
			{
				team_name: 'Torque',
				members: [
					{ name: 'Ana', me: true, state: 'draft', answered: [...shared, 'idea-line'], images: [...sharedImages, 'idea-sketch'] },
					{ name: 'Ben', me: false, state: 'draft', answered: [...shared], images: [...sharedImages] },
					{ name: 'Cara', me: false, state: 'draft', answered: [...shared, 'idea-line'], images: [...sharedImages] }
				]
			}
		]
	};

	it('every teammate reads every team and role module met', () => {
		const p = teamProgressFor(MANIFEST, raw)!;
		for (const m of p.members) {
			const team = m.modules.filter((mod) => mod.id !== 'idea');
			expect(team.length).toBe(5);
			expect(team.every((mod) => mod.met === mod.of)).toBe(true);
		}
	});

	it('the individual part still differs by member, and so does the whole percent', () => {
		const p = teamProgressFor(MANIFEST, raw)!;
		const idea = Object.fromEntries(p.members.map((m) => [m.name, m.modules.find((mod) => mod.id === 'idea')!.met]));
		expect(idea).toEqual({ Ana: 2, Ben: 0, Cara: 1 });
		expect(p.members[0].percent).toBe(100);
		expect(p.members[1].percent).toBeLessThan(100);
	});
});
