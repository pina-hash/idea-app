// tests/dom/coin-roster-import-mount.test.ts
//
// "Import from class roster", driven through the REAL SectionManager.
//
// `tests/coin-roster-import.test.ts` proves the planner excludes teachers,
// inactive rows and anybody already in a coin section. What it cannot see is
// the WIRING: which list the component actually hands the assign RPC. The
// tempting simplification -- send the whole class roster, the RPC "handles
// duplicates" -- is silent and destructive, because
// `coin_admin_assign_section_students` OVERWRITES a student's one coin section
// (0073: the table is keyed on the email alone). A student sitting in another
// coin section would be moved out of it with nothing on screen saying so. So
// the assertion here is on the RPC PAYLOAD, not on the words.
//
// It also pins the two structural rules the control lives under: absence of
// the transport removes it (with the paste box beside it as the positive
// control), and a press whose plan no longer matches the count on the button
// writes nothing.
//
// Structure, events and which call was made. No geometry, contrast or
// tap-target claim: happy-dom has no layout engine (see tests/dom/README.md).

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import type { SupabaseClient } from '@supabase/supabase-js';
import SectionManager from '$lib/coin-desk/SectionManager.svelte';
import type { CoinSectionRow } from '$lib/coin-desk/sections';
import type { ClassRosterTransports } from '$lib/coin-desk/roster-import';
import type { ClassroomEnrollment, ClassroomSection } from '$lib/classroom/classroom';
import { mountInto, type Mounted } from './mount';

const Manager = SectionManager as unknown as Component<Record<string, unknown>>;

function coinSection(id: string, label: string): CoinSectionRow {
	return {
		id,
		label,
		color: '#00ff41',
		active: true,
		note: null,
		created_by: 'admin@boscotech.edu',
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-01T00:00:00Z',
		student_count: 0
	};
}

const SECTIONS = [coinSection('coin-b3', 'Block 3 coins'), coinSection('coin-other', 'Makeup group')];

/** What the client was asked, so an assertion can name what was NOT sent. */
interface Wire {
	assigned: { p_section_id: string; p_emails: string[] }[];
	placementReads: string[][];
}

/** The narrowest coin client SectionManager's import uses, over one placement map. */
function coinClient(placement: Map<string, string>, wire: Wire) {
	return {
		rpc(fn: string, params: Record<string, unknown> = {}) {
			if (fn === 'coin_admin_list_section_students') {
				const rows = [...placement.entries()]
					.filter(([, s]) => s === params.p_section_id)
					.map(([student_email]) => ({
						student_email,
						assigned_at: '2026-09-01T00:00:00Z',
						display_name: null,
						full_name: null
					}));
				return Promise.resolve({ data: rows, error: null });
			}
			if (fn === 'coin_admin_list_sections') {
				return Promise.resolve({ data: SECTIONS, error: null });
			}
			if (fn === 'coin_admin_assign_section_students') {
				const call = params as { p_section_id: string; p_emails: string[] };
				wire.assigned.push({ p_section_id: call.p_section_id, p_emails: [...call.p_emails] });
				// 0073's semantics exactly: an upsert on the email, which MOVES.
				for (const e of call.p_emails) placement.set(e, call.p_section_id);
				return Promise.resolve({
					data: { section_id: call.p_section_id, results: call.p_emails.map((email) => ({ email, ok: true })) },
					error: null
				});
			}
			throw new Error(`unexpected rpc ${fn}`);
		},
		from(table: string) {
			if (table !== 'coin_section_students') throw new Error(`unexpected table ${table}`);
			return {
				select() {
					return {
						in(_col: string, values: string[]) {
							wire.placementReads.push([...values]);
							const rows = values
								.filter((v) => placement.has(v))
								.map((student_email) => ({ student_email, section_id: placement.get(student_email) }));
							return Promise.resolve({ data: rows, error: null });
						}
					};
				}
			};
		}
	} as unknown as SupabaseClient;
}

const CLASS: ClassroomSection = {
	id: 'class-b3',
	course_id: 'c1',
	label: '1',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'c1', code: 'IDEA 100', title: 'Intro', active: true }
};
const ARCHIVED: ClassroomSection = { ...CLASS, id: 'class-old', block: '7', active: false };

function enrollment(email: string, extra: Partial<ClassroomEnrollment> = {}): ClassroomEnrollment {
	return { section_id: CLASS.id, student_email: email, display_name: email, active: true, manages: false, ...extra };
}

const ROSTER: ClassroomEnrollment[] = [
	enrollment('ana@boscotech.net'),
	enrollment('ben@boscotech.net'),
	enrollment('cara@boscotech.net'),
	enrollment('here@boscotech.net'),
	enrollment('elsewhere@boscotech.net'),
	enrollment('teacher@boscotech.edu', { manages: true }),
	enrollment('left@boscotech.net', { active: false })
];

const classRoster: ClassRosterTransports = {
	listClasses: async () => ({ ok: true, data: [CLASS, ARCHIVED] }),
	loadRoster: async () => ({ ok: true, data: { rows: ROSTER, managesReady: true } })
};

function startingPlacement(): Map<string, string> {
	return new Map([
		['here@boscotech.net', 'coin-b3'],
		['elsewhere@boscotech.net', 'coin-other']
	]);
}

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

async function openManage(m: Mounted, sectionIndex = 0) {
	const manage = m
		.all<HTMLButtonElement>('.section-row .actions button')
		.filter((b) => b.textContent?.trim() === 'manage');
	manage[sectionIndex].click();
	await m.settle();
}

async function chooseClass(m: Mounted, classId: string) {
	const select = m.one<HTMLSelectElement>('[data-testid="cd-roster-import-class"]');
	select.value = classId;
	select.dispatchEvent(new Event('change', { bubbles: true }));
	await m.settle();
	await m.settle();
}

describe('Import from class roster: the transport decides whether the control exists', () => {
	it('absent transport, no import; present transport, one import beside the same paste box', async () => {
		const wire: Wire = { assigned: [], placementReads: [] };
		const without = mountInto(Manager, { supabase: coinClient(startingPlacement(), wire), sections: SECTIONS });
		await openManage(without);
		const bare = {
			imports: without.all('[data-testid="cd-roster-import"]').length,
			pasteBoxes: without.all('.assign-row textarea').length
		};
		await without.stop();

		mounted = mountInto(Manager, {
			supabase: coinClient(startingPlacement(), wire),
			sections: SECTIONS,
			classRoster
		});
		await openManage(mounted);
		const wired = {
			imports: mounted.all('[data-testid="cd-roster-import"]').length,
			pasteBoxes: mounted.all('.assign-row textarea').length
		};

		expect(bare).toEqual({ imports: 0, pasteBoxes: 1 });
		expect(wired).toEqual({ imports: 1, pasteBoxes: 1 });
		// The archived class is never offered: the placeholder plus ONE class.
		const options = mounted.all<HTMLOptionElement>('[data-testid="cd-roster-import-class"] option');
		expect(options.map((o) => o.value)).toEqual(['', CLASS.id]);
	});
});

describe('Import from class roster: what reaches the assign RPC', () => {
	it('sends only active, non-teacher addresses in no coin section, and moves nobody', async () => {
		const placement = startingPlacement();
		const wire: Wire = { assigned: [], placementReads: [] };
		mounted = mountInto(Manager, { supabase: coinClient(placement, wire), sections: SECTIONS, classRoster });
		await openManage(mounted);
		await chooseClass(mounted, CLASS.id);

		const go = mounted.one<HTMLButtonElement>('[data-testid="cd-roster-import-go"]');
		// The count is on screen before the press.
		expect(go.textContent).toContain('Add 3 students from IDEA 100');
		expect(wire.assigned).toHaveLength(0);

		go.click();
		await mounted.settle();
		await mounted.settle();

		expect(wire.assigned).toEqual([
			{
				p_section_id: 'coin-b3',
				p_emails: ['ana@boscotech.net', 'ben@boscotech.net', 'cara@boscotech.net']
			}
		]);
		// The student in the other coin section is still there: nobody was moved.
		expect(placement.get('elsewhere@boscotech.net')).toBe('coin-other');
		// Whitespace collapsed the way the page renders it; the template's own
		// line breaks are in textContent.
		const outcome = (mounted.one('[data-testid="cd-roster-import-outcome"]').textContent ?? '').replace(/\s+/g, ' ');
		expect(outcome).toContain('Added 3 students');
		expect(outcome).toContain('1 student was already in this coin section');
		expect(outcome).toContain('Left in their own coin section');
		expect(outcome).toContain('1 person who teaches the class');
		expect(outcome).toContain('1 inactive enrollment');
	});

	it('a press whose plan changed since the count was drawn writes nothing and shows the new count', async () => {
		const placement = startingPlacement();
		const wire: Wire = { assigned: [], placementReads: [] };
		mounted = mountInto(Manager, { supabase: coinClient(placement, wire), sections: SECTIONS, classRoster });
		await openManage(mounted);
		await chooseClass(mounted, CLASS.id);
		expect(mounted.one('[data-testid="cd-roster-import-go"]').textContent).toContain('Add 3 students');

		// Somebody puts Ana in another coin section after the count was drawn.
		placement.set('ana@boscotech.net', 'coin-other');
		mounted.one<HTMLButtonElement>('[data-testid="cd-roster-import-go"]').click();
		await mounted.settle();
		await mounted.settle();

		expect(wire.assigned).toHaveLength(0);
		expect(mounted.one('[data-testid="cd-roster-import-go"]').textContent).toContain('Add 2 students');
		expect(mounted.target.textContent).toContain('changed since that count was worked out');
	});
});
