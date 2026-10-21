// tests/db/connector-samples.ts
//
// HOW TO CALL EVERY WRITE ENTRY IN THE REGISTRY SO THAT THE ADMIN'S CALL
// SUCCEEDS, shared by tests/db/connector-permissions.test.ts (the connector
// can never exceed the account) and tests/db/connector-levels.test.ts (every
// level holds, and every undo reverses its write). A sample is the smallest
// real setup the function accepts, seeded through the real RPCs where one
// exists and as the connection owner where the subsystem has no client writer.
//
// A write entry the registry gains with no sample here fails both suites: a
// new write is a write those files have to be told how to call.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createUser, type SeededUser } from './harness';
import type { ConnectorWorld } from './connector-fixture';
import { samplePackage, samplePool } from './cert-chain';
import { stageHtmlDocument } from '../../src/lib/classroom/html-assignment/store';
import { FUNCTIONS, liveFunction, schemaOf } from '../../src/lib/server/connector/registry';

/** Whether an entry is proven by placeholder arguments rather than a real sample (ledger 0416). */
export function isGeneric(fn: string): boolean {
	return FUNCTIONS[fn]?.proof === 'generic';
}

/**
 * Placeholder arguments of the right types for a function's narrowest form:
 * its required inputs only, less any the overlay fills when left out, with
 * `known` for the ones a placeholder cannot stand in for (a class he teaches).
 */
export function genericArgs(fn: string, known: Args = {}): Args {
	const forms = [...schemaOf(fn)].sort((a, b) => a.args.filter((x) => !x.has_default).length - b.args.filter((x) => !x.has_default).length);
	const spec = FUNCTIONS[fn]?.args ?? {};
	const out: Args = {};
	for (const a of forms[0]?.args ?? []) {
		if (a.has_default) continue;
		if (a.name in known) {
			out[a.name] = known[a.name];
			continue;
		}
		// What the connector itself sends for an argument left out.
		if (spec[a.name]?.fill === 'uuid') {
			out[a.name] = randomUUID();
			continue;
		}
		if (spec[a.name] && 'default' in spec[a.name]) {
			out[a.name] = spec[a.name].default ?? null;
			continue;
		}
		const t = a.type;
		out[a.name] = t.endsWith('[]')
			? []
			: t === 'uuid'
				? randomUUID()
				: ['integer', 'smallint', 'bigint', 'numeric', 'real', 'double precision'].includes(t)
					? 1
					: t === 'boolean'
						? false
						: t === 'jsonb' || t === 'json'
							? {}
							: t === 'date'
								? '2026-10-19'
								: t.startsWith('timestamp')
									? '2026-10-19T12:00:00Z'
									: t === 'text'
										? 'connector check'
										: null;
	}
	return out;
}

export type Args = Record<string, unknown>;

const HTML = readFileSync(fileURLToPath(new URL('../fixtures/hx-smoke-test.html', import.meta.url)), 'utf8');

export const LEVELS = [
	{ label: 'Full', short: 'Full', points: 4, descriptor: 'All of it.' },
	{ label: 'Some', short: 'Some', points: 2, descriptor: 'Some of it.' },
	{ label: 'None', short: 'None', points: 0, descriptor: 'None of it.' }
];

const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'connector-sample', title: 'Sample', totalPoints: 8 },
	approvalGate: { afterModule: 'mod-1' },
	modules: [
		{
			id: 'mod-1',
			title: 'First',
			points: 4,
			blocks: [{ type: 'textField', id: 'f1', prompt: 'Say something.', minSentences: 1 }],
			rubric: [{ id: 'c1', criterion: 'Words', levels: LEVELS }]
		},
		{
			id: 'mod-2',
			title: 'Second',
			points: 4,
			blocks: [{ type: 'textField', id: 'f2', prompt: 'Say more.', minSentences: 1 }],
			rubric: [{ id: 'c2', criterion: 'More words', levels: LEVELS }]
		}
	]
};

/** Functions only the pinned owner may call: their admin leg runs as the owner. */
export const OWNER_ONLY = new Set(['admin_grant', 'admin_revoke']);

export interface Samples {
	samples: Record<string, () => Promise<Args>>;
	owner(): Promise<SeededUser>;
	/** A value for a read entry's required argument, by its name and type, made once from the world. */
	readValues(): Promise<(param: string, type: string) => unknown>;
}

/**
 * A random tag with NO DIGITS, for a class label: the name resolver reads any
 * number in a label as its block, so "Lab Section 2e45" answered to "Block 2"
 * beside the real Block 2 and made a class name ambiguous at random.
 */
function letters(n = 6): string {
	return [...randomUUID().replace(/-/g, '').slice(0, n)].map((c) => 'abcdefghijklmnop'[parseInt(c, 16)]).join('');
}

export function connectorSamples(w: ConnectorWorld): Samples {
	let ownerUser: SeededUser | null = null;
	async function owner(): Promise<SeededUser> {
		ownerUser ??= await createUser(w.db, 'apina@boscotech.edu', 'Owner Person');
		return ownerUser;
	}

	async function as<T = Record<string, unknown>>(user: SeededUser, sql: string, params: unknown[] = []): Promise<T> {
		return w.db.asUser(user.id, async (q) => (await q(sql, params)).rows[0] as T);
	}
	async function asAdminRpc(fn: string, args: Args): Promise<Record<string, unknown>> {
		const r = await w.backend.rpc<Record<string, unknown>>(await w.backend.mintSession({ id: w.admin.id, email: w.admin.email }), fn, args);
		if (r.error) throw new Error(`${fn}: ${r.error.message}`);
		return (r.data ?? {}) as Record<string, unknown>;
	}
	const sql = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await w.db.sql(text, params)).rows as T[];

	async function newItem(title: string, points: number | null = 10, kind = 'assignment'): Promise<string> {
		const r = await asAdminRpc('classroom_create_item', { p_kind: kind, p_section_ids: [w.block2], p_title: title, p_body: '', p_points: points });
		return r.item_id as string;
	}
	async function rubricItem(title: string): Promise<string> {
		const id = await newItem(title, 4);
		await asAdminRpc('classroom_set_rubric', { p_item_id: id, p_criteria: [{ id: 'c1', criterion: 'Accuracy', points: 4, levels: LEVELS }] });
		return id;
	}
	async function specItem(title: string): Promise<string> {
		const id = await newItem(title, 8);
		await asAdminRpc('classroom_set_assignment_spec', { p_item_id: id, p_spec: SPEC });
		return id;
	}
	async function htmlItem(title: string): Promise<{ id: string; block: string }> {
		const id = await newItem(title, 10);
		const staged = stageHtmlDocument('sample.html', HTML).staged!;
		await asAdminRpc('classroom_set_html_assignment', { p_item_id: id, p_document: HTML, p_manifest: staged.manifest, p_filename: 'sample.html' });
		const block = (staged.manifest as { header?: Array<{ id: string }>; modules?: Array<{ blocks: Array<{ id: string }> }> });
		const first = block.modules?.flatMap((m) => m.blocks)[0]?.id ?? block.header?.[0]?.id;
		return { id, block: first as string };
	}
	async function attachment(itemId: string, table = 'classroom_attachments'): Promise<string> {
		const [r] = await sql<{ id: string }>(
			`insert into public.${table} (item_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by)
			 values ($1, $2, 'handout.pdf', 'application/pdf', 100, $3) returning id`,
			[itemId, `drive-${randomUUID()}`, w.admin.email]
		);
		return r.id;
	}
	async function courseId(): Promise<string> {
		const [r] = await sql<{ course_id: string }>(`select course_id from public.classroom_sections where id = $1`, [w.block2]);
		return r.course_id;
	}
	async function unit(name: string): Promise<string> {
		const r = await asAdminRpc('classroom_upsert_unit', { p_course_id: await courseId(), p_name: name });
		return r.unit_id as string;
	}
	async function teamSet(): Promise<string> {
		return (await as<{ id: string }>(
			w.admin,
			'select public.classroom_save_team_set($1::uuid, $2, $3::bigint, $4, $5::integer, $6::jsonb) as id',
			[w.block2, `Teams ${randomUUID().slice(0, 6)}`, 7, 'count', 2, JSON.stringify([
				{ team_number: 1, members: [w.students.mateo] },
				{ team_number: 2, members: [w.students.danielR] }
			])]
		)).id;
	}
	async function thread(): Promise<string> {
		const r = await asAdminRpc('classroom_feedback_post', {
			p_item_id: await newItem(`Feedback ${randomUUID().slice(0, 6)}`),
			p_student_email: w.students.mateo,
			p_block_id: null,
			p_file_id: null,
			p_body: 'Cite the datasheet.',
			p_marks: null
		});
		return (r.thread as { id: string }).id;
	}
	async function hallPass(): Promise<string> {
		const r = await asAdminRpc('classroom_hall_pass_open_for', { p_section_id: w.block4, p_student_email: w.students.leo });
		return r.pass_id as string;
	}
	async function coins(email: string, amount: number) {
		await asAdminRpc('coin_admin_adjust_balance', { p_email: email, p_amount: amount, p_note: 'sample balance' });
	}
	async function session(label: string): Promise<string> {
		const r = await asAdminRpc('notebook_admin_upsert_session', {
			p_section_ids: [w.block2],
			p_unit_number: 1,
			p_session_date: '2026-10-20',
			p_session_label: label
		});
		return r.session_id as string;
	}
	async function entry(status = 'pending_review'): Promise<string> {
		const [r] = await sql<{ id: string }>(
			`insert into public.notebook_entries (student_id, section_id, custom_label, status, submitted_at, reviewed_by, reviewed_at)
			 values ($1, $2, 'Sample page', $3, now(), case when $3 = 'compliant' then $4::uuid end, case when $3 = 'compliant' then now() end) returning id`,
			[w.student.id, w.block2, status, w.admin.id]
		);
		return r.id;
	}
	async function note(entryId: string): Promise<string> {
		const noteId = randomUUID();
		await sql(
			`insert into public.notebook_entry_notes (id, entry_id, note_id, revision, content, author_id)
			 values ($2, $1, $2, 1, $3::jsonb, $4)`,
			[entryId, noteId, JSON.stringify([{ type: 'p', runs: [{ text: 'A note.' }] }]), w.student.id]
		);
		return noteId;
	}
	async function app(status: 'submitted' | 'approved' = 'submitted'): Promise<{ app: string; version: string }> {
		const slug = `sample-${randomUUID().slice(0, 8)}`;
		const [a] = await sql<{ id: string }>(
			`insert into public.student_apps (owner, slug, title, build_notes) values ($1, $2, 'Sample App', 'Built for a test.') returning id`,
			[w.student.id, slug]
		);
		const [v] = await sql<{ id: string }>(
			`insert into public.student_app_versions (app_id, ordinal, zip_path, manifest, status)
			 values ($1, 1, $2, '{}'::jsonb, $3) returning id`,
			[a.id, `${w.student.id}/${randomUUID()}.zip`, status]
		);
		if (status === 'approved') await sql(`update public.student_apps set published_version_id = $2 where id = $1`, [a.id, v.id]);
		return { app: a.id, version: v.id };
	}
	async function tournament(name = `Cup ${randomUUID().slice(0, 6)}`, open = true, quals = false): Promise<string> {
		// Teams of three, so a sample can add a member to an entry that already has its first.
		const config = JSON.stringify({ team_size: 3, ...(quals ? { quals_enabled: true } : {}) });
		const id = (await as<{ id: string }>(w.admin, `select public.tournament_create($1, 'A test.', $2::jsonb) as id`, [name, config])).id;
		if (open) await as(w.admin, `select public.tournament_set_status($1, 'registration_open')`, [id]);
		return id;
	}
	async function tEntry(t: string, name = `Team ${randomUUID().slice(0, 4)}`): Promise<string> {
		return (await as<{ id: string }>(w.admin, `select public.tournament_host_add_entry($1, $2, '', null, null) as id`, [t, name])).id;
	}
	async function armoryFile(): Promise<{ project: string; file: string }> {
		const project = (await as<{ id: string }>(w.admin, `select public.armory_create_project($1, 2026::smallint, $2) as id`, [`P${randomUUID().slice(0, 6)}`, randomUUID()])).id;
		await as(w.admin, `select public.armory_add_member($1, $2, 'student'::public.armory_member_role, $3)`, [project, w.student.email, randomUUID()]);
		const device = (await as<{ id: string }>(w.student, 'select public.armory_register_device($1, $2) as id', ['LAB-1', randomUUID()])).id;
		const file = (await as<{ id: string }>(w.student, 'select public.armory_create_file($1, $2, $3, $4, $5) as id', [project, 'Parts', `part-${randomUUID().slice(0, 4)}.sldprt`, device, randomUUID()])).id;
		await as(w.student, 'select public.armory_acquire_lock($1, $2, $3) as ok', [file, device, randomUUID()]);
		return { project, file };
	}
	async function certId(): Promise<string> {
		const r = await as<{ r: { id?: string; certification?: { id: string } } }>(w.admin, 'select public.cert_admin_save(null, $1::jsonb, $2) as r', [
			JSON.stringify(samplePackage(`C${randomUUID().slice(0, 5).toUpperCase()}`)),
			'sample'
		]);
		return (r.r.id ?? r.r.certification?.id) as string;
	}
	async function challenge(): Promise<string> {
		return (await as<{ id: string }>(
			w.admin,
			`select public.gauntlet_author_upsert(null, 'speedrun'::public.gauntlet_mode, $1, 2::smallint, 'draft', '{}'::jsonb, '{}'::jsonb) as id`,
			[`Bracket ${randomUUID().slice(0, 4)}`]
		)).id;
	}
	async function mapsNode(): Promise<string> {
		return (await as<{ id: string }>(w.admin, `insert into public.maps_nodes (kind, name) values ('site', $1) returning id`, [`Campus ${randomUUID().slice(0, 4)}`])).id;
	}
	async function feedback(): Promise<string> {
		const [r] = await sql<{ id: string }>(
			`insert into public.app_feedback (user_id, app, kind, message) values ($1, 'site', 'bug', 'The button is stuck.') returning id`,
			[w.student.id]
		);
		return r.id;
	}

	// THE FIXTURE ADMIN RUNS THE WHOLE COIN ECONOMY, the way Mr. Pina (the
	// owner) does: the coin powers past fines and awards are a full coin
	// admin's (0244), which is a list of its own beside the site admins.
	let ready: Promise<void> | null = null;
	const init = () =>
		(ready ??= sql(`insert into public.coin_full_admins (email, added_by) values ($1, 'test') on conflict do nothing`, [w.admin.email]).then(() => undefined));

	const raw: Record<string, () => Promise<Args>> = {
		// ---- coins ----
		coin_log_transaction: async () => ({ p_email: w.students.mateo, p_category_id: 'correct_answer_in_class', p_note: 'permission test' }),
		coin_reverse_transaction: async () => {
			const r = await asAdminRpc('coin_log_transaction', { p_email: w.students.leo, p_category_id: 'correct_answer_in_class', p_note: 'to reverse' });
			return { p_transaction_id: r.transaction_id, p_note: 'reversing' };
		},
		coin_admin_adjust_balance: async () => ({ p_email: w.students.mateo, p_amount: 20, p_note: 'Shop Fix bonus' }),
		coin_admin_create_category: async () => ({
			p_id: `sample_${randomUUID().slice(0, 6).replace(/-/g, '')}`,
			p_name: 'Tool Left Out',
			p_kind: 'fine',
			p_scope: 'core',
			p_pricing_model: 'flat',
			p_amount: 3
		}),
		coin_admin_set_category_active: async () => ({ p_id: 'donation', p_active: false }),
		coin_settings_set: async () => {
			const [r] = await sql<{ key: string; value: unknown }>(`select key, value from public.coin_settings where key = 'pay_raise_cost_per_tier'`);
			return { p_key: 'pay_raise_cost_per_tier', p_value: r ? Number(r.value) + 5 : 105 };
		},
		coin_settings_set_category: async () => ({
			p_id: 'off_task_device_use',
			p_name: null,
			p_amount: 4,
			p_min_amount: null,
			p_max_amount: null,
			p_cap_period: null,
			p_cap_count: null,
			p_active: null,
			p_explanation: null
		}),
		coin_bulk_log_students: async () => ({ p_emails: [w.students.mateo, w.students.danielR], p_category_id: 'correct_answer_in_class', p_note: 'bulk' }),
		coin_fine_log: async () => ({ p_emails: [w.students.mateo], p_category_id: 'disruptive_behavior', p_note: 'fine screen' }),
		coin_log_extra_credit: async () => {
			await coins(w.students.danielV, 50);
			return { p_email: w.students.danielV, p_points: 2, p_grading_category: 'labs', p_note: 'extra credit' };
		},
		coin_log_pay_raise: async () => {
			await coins(w.students.danielR, 400);
			return { p_email: w.students.danielR, p_note: 'pay raise' };
		},
		coin_log_perfect_score: async () => ({ p_email: w.students.leo, p_points: 20, p_note: 'perfect' }),
		coin_log_property_damage_careless: async () => {
			await coins(w.students.mateo, 100);
			return { p_email: w.students.mateo, p_cost_dollars: 5, p_note: 'snapped a drill bit' };
		},
		coin_log_three_d_printing: async () => {
			await coins(w.students.leo, 200);
			return { p_email: w.students.leo, p_grams: 10, p_hours: 1, p_overnight: false, p_note: 'bracket' };
		},

		// ---- classroom posts ----
		classroom_create_item: async () => ({ p_kind: 'assignment', p_section_ids: [w.block2], p_title: 'Permission item', p_body: '', p_points: 5 }),
		classroom_update_item: async () => ({ p_id: await newItem('Update me'), p_title: 'Updated', p_body: 'new text', p_points: 7 }),
		classroom_delete_item: async () => ({ p_id: await newItem('Delete me') }),
		classroom_set_published: async () => ({ p_item_id: await newItem('Hide me'), p_published: false }),
		classroom_set_item_pinned: async () => ({ p_item_id: await newItem('Pin me'), p_pinned: true }),
		classroom_set_rubric: async () => ({ p_item_id: await newItem('Rubric me', 4), p_criteria: [{ id: 'accuracy', criterion: 'Accuracy', points: 4, levels: LEVELS }] }),
		classroom_set_html_assignment: async () => {
			const staged = stageHtmlDocument('perm.html', HTML).staged!;
			return { p_item_id: await newItem('Document me'), p_document: HTML, p_manifest: staged.manifest, p_filename: 'perm.html' };
		},
		classroom_restore_revision: async () => {
			const id = await newItem('Revise me');
			await asAdminRpc('classroom_update_item', { p_id: id, p_title: 'Revised', p_body: '', p_points: 10 });
			const rev = await sql<{ id: string }>(`select id from public.classroom_content_revisions where item_id = $1`, [id]);
			return { p_revision_id: rev[0].id };
		},
		classroom_add_postings: async () => ({ p_item_id: await newItem('Post me wider'), p_section_ids: [w.block4] }),
		classroom_remove_posting: async () => {
			const id = await newItem('Narrow me');
			await asAdminRpc('classroom_add_postings', { p_item_id: id, p_section_ids: [w.block4] });
			return { p_item_id: id, p_section_id: w.block4 };
		},
		classroom_duplicate_item: async () => ({ p_item_id: await newItem('Copy me') }),
		classroom_set_item_layout: async () => ({ p_item_id: await newItem('Lay me out'), p_files_placement: 'bottom', p_links_placement: 'top' }),
		classroom_set_item_order: async () => {
			const a = await newItem('Order A');
			const b = await newItem('Order B');
			// A settled order first, so the reorder has a real order to undo back to.
			await asAdminRpc('classroom_set_item_order', { p_item_ids: [a, b] });
			return { p_item_ids: [b, a] };
		},
		classroom_set_item_public: async () => ({ p_item_id: await newItem('Material', null, 'material'), p_public: true }),
		classroom_set_item_thumbnail: async () => ({
			p_item_id: await newItem('Thumb me'),
			p_source: 'none',
			p_image_key: null,
			p_attachment_id: null,
			p_width: null,
			p_height: null,
			p_focal_x: null,
			p_focal_y: null
		}),
		classroom_set_item_thumbnail_focus: async () => {
			const id = await newItem('Focus me');
			const att = await sql<{ id: string }>(
				`insert into public.classroom_attachments (item_id, storage_key, filename, mime_type, size_bytes, uploaded_by)
				 values ($1::uuid, $1::text || '/' || gen_random_uuid() || '.png', 'pic.png', 'application/octet-stream', 10, $2) returning id`,
				[id, w.admin.email]
			);
			await asAdminRpc('classroom_set_item_thumbnail', {
				p_item_id: id,
				p_source: 'image',
				p_image_key: null,
				p_attachment_id: att[0].id,
				p_width: 100,
				p_height: 80,
				p_focal_x: 0.5,
				p_focal_y: 0.5
			});
			return { p_item_id: id, p_focal_x: 0.25, p_focal_y: 0.75 };
		},
		classroom_set_item_unit: async () => ({ p_item_id: await newItem('File me'), p_unit_id: await unit(`Unit ${randomUUID().slice(0, 4)}`) }),
		classroom_set_assignment_spec: async () => ({ p_item_id: await newItem('Spec me', 4), p_spec: SPEC }),
		classroom_set_reference_spec: async () => ({
			p_item_id: await newItem('Reference me', null, 'material'),
			p_spec: {
				schemaVersion: 2,
				kind: 'reference',
				meta: { referenceId: 'ref-1', title: 'Course Reference' },
				navigation: 'tabs',
				sections: [{ slug: 'overview', title: 'Overview', blocks: [{ type: 'instructions', content: 'Read this.' }] }]
			}
		}),
		classroom_delete_attachment: async () => ({ p_id: await attachment(await newItem('Unattach me')) }),
		classroom_delete_instructor_attachment: async () => ({ p_id: await attachment(await newItem('Unkey me'), 'classroom_instructor_attachments') }),
		classroom_rename_attachment: async () => ({ p_attachment_id: await attachment(await newItem('Rename file')), p_filename: 'renamed.pdf' }),
		classroom_rename_instructor_attachment: async () => ({ p_attachment_id: await attachment(await newItem('Rename key'), 'classroom_instructor_attachments'), p_filename: 'key.pdf' }),
		classroom_set_attachment_order: async () => {
			const id = await newItem('Order files');
			const a = await attachment(id);
			const b = await attachment(id);
			// Two files a reader can tell apart, so the order is visible in the rows.
			await sql(`update public.classroom_attachments set filename = 'second.pdf' where id = $1`, [b]);
			await asAdminRpc('classroom_set_attachment_order', { p_item_id: id, p_attachment_ids: [a, b] });
			return { p_item_id: id, p_attachment_ids: [b, a] };
		},
		classroom_set_instructor_attachment_order: async () => {
			const id = await newItem('Order keys');
			const a = await attachment(id, 'classroom_instructor_attachments');
			const b = await attachment(id, 'classroom_instructor_attachments');
			// Two files a reader can tell apart, so the order is visible in the rows.
			await sql(`update public.classroom_instructor_attachments set filename = 'second.pdf' where id = $1`, [b]);
			await asAdminRpc('classroom_set_instructor_attachment_order', { p_item_id: id, p_attachment_ids: [a, b] });
			return { p_item_id: id, p_attachment_ids: [b, a] };
		},
		classroom_set_instructor_resources: async () => ({ p_item_id: await newItem('Key links'), p_resources: [{ url: 'https://example.com/key', label: 'Key' }] }),
		classroom_delete_deck: async () => {
			const id = await newItem('Deck me');
			await sql(
				`insert into public.classroom_decks (item_id, title, entry_path, drive_folder_id, uploaded_by) values ($1, 'Deck', 'index.html', $2, $3)`,
				[id, `folder-${randomUUID()}`, w.admin.email]
			);
			return { p_item_id: id };
		},

		// ---- units, courses, classes, roster ----
		classroom_upsert_unit: async () => ({ p_course_id: await courseId(), p_name: `Unit ${randomUUID().slice(0, 6)}` }),
		classroom_delete_unit: async () => ({ p_id: await unit(`Gone ${randomUUID().slice(0, 4)}`) }),
		classroom_set_unit_order: async () => {
			const a = await unit(`Order ${randomUUID().slice(0, 4)}`);
			const b = await unit(`Order ${randomUUID().slice(0, 4)}`);
			return { p_course_id: await courseId(), p_unit_ids: [b, a] };
		},
		classroom_upsert_course: async () => ({ p_code: `IDEA9${Math.floor(Math.random() * 90 + 10)}X`, p_title: 'Sample course' }),
		classroom_upsert_section: async () => ({ p_course_id: await courseId(), p_label: `Lab Section ${letters()}`, p_block: null, p_teacher_email: w.admin.email }),
		classroom_delete_section: async () => {
			const label = `Lab Section ${letters()}`;
			const r = await asAdminRpc('classroom_upsert_section', { p_course_id: await courseId(), p_label: label, p_block: null, p_teacher_email: w.admin.email });
			return { p_id: r.section_id, p_confirm_label: label };
		},
		classroom_set_section_active: async () => {
			const r = await asAdminRpc('classroom_upsert_section', { p_course_id: await courseId(), p_label: `Lab Section ${letters()}`, p_block: null, p_teacher_email: w.admin.email });
			return { p_id: r.section_id, p_active: false };
		},
		classroom_set_section_thumbnail_shape: async () => ({ p_section_id: w.block2, p_shape: 'wide' }),
		classroom_set_enrollment: async () => ({ p_section_id: w.block2, p_student_email: `new${randomUUID().slice(0, 4)}@boscotech.net`, p_display_name: 'New, Student' }),
		classroom_update_enrollment: async () => ({ p_section_id: w.block2, p_student_email: w.students.danielR, p_display_name: 'Ruiz, Daniel J' }),
		classroom_remove_enrollment: async () => {
			const email = `gone${randomUUID().slice(0, 4)}@boscotech.net`;
			await asAdminRpc('classroom_set_enrollment', { p_section_id: w.block2, p_student_email: email, p_display_name: 'Gone, Soon' });
			return { p_section_id: w.block2, p_student_email: email };
		},
		classroom_import_roster: async () => ({
			p_rows: [{ email: `import${randomUUID().slice(0, 4)}@boscotech.net`, name: 'Imported, Student', course_code: 'IDEA209H', section_label: 'Block 2' }]
		}),

		// ---- grading and feedback ----
		classroom_grade_direct: async () => ({ p_item_id: await newItem('Grade me'), p_student_email: w.students.mateo, p_score: 6, p_comment: 'good', p_return: true, p_extra_credit: null }),
		classroom_revoke_grade: async () => {
			const id = await newItem('Revoke me');
			await asAdminRpc('classroom_grade_direct', { p_item_id: id, p_student_email: w.students.mateo, p_score: 5, p_comment: 'x', p_return: true, p_extra_credit: null });
			return { p_item_id: id, p_student_email: w.students.mateo };
		},
		classroom_restore_grade: async () => {
			const id = await newItem('Restore me');
			await asAdminRpc('classroom_grade_direct', { p_item_id: id, p_student_email: w.students.mateo, p_score: 5, p_comment: 'x', p_return: true, p_extra_credit: null });
			await asAdminRpc('classroom_revoke_grade', { p_item_id: id, p_student_email: w.students.mateo });
			return { p_item_id: id, p_student_email: w.students.mateo };
		},
		classroom_grade_submission: async () => ({
			p_item_id: await rubricItem('Rubric grade'),
			p_student_email: w.students.mateo,
			p_scores: { c1: 4 },
			p_comment: 'Nice.',
			p_return: true,
			p_criterion_comments: null,
			p_extra_credit: null
		}),
		classroom_grade_submissions: async () => ({
			p_item_id: await rubricItem('Bulk grade'),
			p_grades: [{ student_email: w.students.mateo, scores: { c1: 4 } }],
			p_return: false
		}),
		classroom_close_assignment: async () => ({ p_item_id: await newItem('Close me'), p_student_email: w.students.mateo, p_closed: true }),
		classroom_approve_module: async () => ({ p_item_id: await specItem('Approve me'), p_student_email: w.students.mateo, p_module_id: 'mod-1', p_approved: true }),
		classroom_feedback_post: async () => ({ p_item_id: await newItem('Feedback me'), p_student_email: w.students.mateo, p_block_id: null, p_file_id: null, p_body: 'Cite the datasheet.', p_marks: null }),
		classroom_feedback_remove: async () => ({ p_thread_id: await thread() }),
		classroom_feedback_reply: async () => ({ p_thread_id: await thread(), p_body: 'One more thing.' }),
		classroom_feedback_set_state: async () => ({ p_thread_id: await thread(), p_state: 'resolved' }),
		classroom_feedback_update: async () => ({ p_thread_id: await thread(), p_body: 'Cite page 4.', p_marks: null }),
		classroom_feedback_seen: async () => {
			const t = await thread();
			const [r] = await sql<{ item_id: string }>(`select item_id from public.classroom_feedback_threads where id = $1`, [t]);
			await sql(`update public.classroom_feedback_threads set teacher_seen_at = null where id = $1`, [t]);
			return { p_item_id: r.item_id, p_student_email: w.students.mateo };
		},
		classroom_designate_instructor_key: async () => {
			const h = await htmlItem('Key me');
			await as(w.admin, 'select public.classroom_save_instructor_response($1, $2, $3::jsonb)', [h.id, h.block, JSON.stringify('the answer')]);
			return { p_item_id: h.id };
		},
		classroom_undesignate_instructor_key: async () => {
			const h = await htmlItem('Unkey me');
			await as(w.admin, 'select public.classroom_save_instructor_response($1, $2, $3::jsonb)', [h.id, h.block, JSON.stringify('the answer')]);
			await asAdminRpc('classroom_designate_instructor_key', { p_item_id: h.id });
			return { p_item_id: h.id };
		},
		classroom_save_instructor_response: async () => {
			const h = await htmlItem('Answer me');
			return { p_item_id: h.id, p_block_id: h.block, p_value: 'my answer' };
		},
		classroom_set_posting_perfect_score: async () => ({ p_item_id: await newItem('Perfect me'), p_section_id: w.block2, p_on: true }),

		// ---- hall pass ----
		classroom_hall_pass_open_for: async () => ({ p_section_id: w.block2, p_student_email: w.students.danielR }),
		classroom_hall_pass_close_by_id: async () => ({ p_pass_id: await hallPass() }),
		classroom_hall_pass_set_limits: async () => ({ p_section_id: w.block2, p_daily_minutes: 15, p_auto_minutes: 12 }),

		// ---- quick posts ----
		classroom_quick_post_create: async () => ({ p_section_ids: [w.block2], p_body: 'Shop closed.', p_expires_at: new Date(Date.now() + 86_400_000).toISOString() }),
		classroom_html_retire_blocks: async () => {
			const h = await htmlItem('Retire from me');
			return { p_item_id: h.id, p_blocks: [{ block_id: h.block, block: { id: h.block, field: 'old', type: 'text' }, module_title: 'Day 1' }] };
		},
		classroom_quick_post_set_important: async () => {
			const r = await asAdminRpc('classroom_quick_post_create', { p_section_ids: [w.block2], p_body: 'mark me', p_expires_at: new Date(Date.now() + 86_400_000).toISOString() });
			return { p_post_id: r.id, p_important: true };
		},
		classroom_quick_post_take_down: async () => {
			const r = await asAdminRpc('classroom_quick_post_create', { p_section_ids: [w.block2], p_body: 'take me down', p_expires_at: new Date(Date.now() + 86_400_000).toISOString() });
			return { p_post_id: r.id };
		},

		// ---- teams ----
		classroom_save_team_set: async () => ({
			p_section_id: w.block2,
			p_label: `Draw ${randomUUID().slice(0, 4)}`,
			p_seed: 42,
			p_mode: 'count',
			p_mode_value: 2,
			p_teams: [{ team_number: 1, members: [w.students.mateo] }, { team_number: 2, members: [w.students.danielR] }]
		}),
		classroom_archive_team_set: async () => ({ p_team_set_id: await teamSet() }),
		classroom_post_team_set: async () => ({ p_team_set_id: await teamSet(), p_visible_until: new Date(Date.now() + 86_400_000).toISOString() }),
		classroom_unpost_team_set: async () => {
			const id = await teamSet();
			await asAdminRpc('classroom_post_team_set', { p_team_set_id: id, p_visible_until: new Date(Date.now() + 86_400_000).toISOString() });
			return { p_team_set_id: id };
		},
		classroom_move_team_member: async () => {
			const id = await teamSet();
			const [t] = await sql<{ id: string }>(`select id from public.classroom_teams where team_set_id = $1 and team_number = 2`, [id]);
			return { p_team_set_id: id, p_student_email: w.students.mateo, p_to_team_id: t.id };
		},
		classroom_set_team_style: async () => {
			const id = await teamSet();
			const [t] = await sql<{ id: string }>(`select id from public.classroom_teams where team_set_id = $1 and team_number = 1`, [id]);
			return { p_team_id: t.id, p_name: 'Gearheads', p_accent_color: null, p_background_type: null, p_background_value: null, p_badge: null, p_flourish: null, p_tagline: 'Torque on.' };
		},

		// ---- songs ----
		classroom_song_approve: async () => {
			await coins(w.students.mateo, 20);
			const [r] = await sql<{ id: string }>(
				`insert into public.classroom_song_requests (section_id, student_email, url) values ($1, $2, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ') returning id`,
				[w.block2, w.students.mateo]
			);
			return { p_request_id: r.id };
		},
		classroom_song_reject: async () => {
			const [r] = await sql<{ id: string }>(
				`insert into public.classroom_song_requests (section_id, student_email, url) values ($1, $2, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ') returning id`,
				[w.block2, w.students.mateo]
			);
			return { p_request_id: r.id, p_reason: 'Not today.' };
		},

		// ---- notebook ----
		notebook_admin_upsert_session: async () => ({ p_section_ids: [w.block2], p_unit_number: 2, p_session_date: '2026-10-21', p_session_label: 'Bearing sketch' }),
		notebook_admin_delete_session: async () => ({ p_session_id: await session('Delete me') }),
		notebook_add_session_postings: async () => ({ p_session_id: await session('Post wider'), p_section_ids: [w.block4] }),
		notebook_remove_session_posting: async () => {
			const s = await session('Narrow me');
			await asAdminRpc('notebook_add_session_postings', { p_session_id: s, p_section_ids: [w.block4] });
			return { p_session_id: s, p_section_id: w.block4 };
		},
		notebook_set_session_guidance: async () => ({
			p_session_id: await session('Guide me'),
			p_guidance_doc: [{ type: 'p', runs: [{ text: 'Sketch the bearing.' }] }]
		}),
		notebook_create_item_check_in: async () => ({ p_item_id: await newItem('Check in post'), p_unit_number: 1, p_session_date: '2026-10-22', p_session_label: 'Attached' }),
		notebook_link_session_item: async () => ({ p_session_id: await session('Link me'), p_section_id: w.block2, p_item_id: await newItem('Linked post') }),
		notebook_unlink_session_item: async () => {
			const s = await session('Unlink me');
			await asAdminRpc('notebook_link_session_item', { p_session_id: s, p_section_id: w.block2, p_item_id: await newItem('Was linked') });
			return { p_session_id: s, p_section_id: w.block2 };
		},
		notebook_link_unit_item: async () => ({ p_section_id: w.block2, p_unit_number: 3, p_item_id: await newItem('Notebook grade') }),
		notebook_unlink_unit_item: async () => {
			await asAdminRpc('notebook_link_unit_item', { p_section_id: w.block2, p_unit_number: 4, p_item_id: await newItem('Unit grade') });
			return { p_section_id: w.block2, p_unit_number: 4 };
		},
		notebook_admin_set_excusal: async () => ({ p_session_id: await session('Excuse'), p_student_id: w.student.id, p_excused: true, p_note: 'absent' }),
		notebook_accept_entry: async () => ({ p_entry_id: await entry() }),
		notebook_unaccept_entry: async () => ({ p_entry_id: await entry('compliant') }),
		notebook_flag_entry: async () => ({ p_entry_id: await entry(), p_flag_reason: 'insufficient_detail', p_instructor_comment: 'Add units.' }),
		notebook_resolve_entry: async () => {
			const e = await entry();
			await asAdminRpc('notebook_flag_entry', { p_entry_id: e, p_flag_reason: 'illegible', p_instructor_comment: 'Rescan it.' });
			return { p_entry_id: e, p_instructor_comment: 'Fixed.' };
		},
		notebook_admin_override_entry: async () => ({ p_entry_id: await entry(), p_status: 'compliant', p_instructor_comment: 'Override.' }),
		notebook_staff_delete_entry: async () => ({ p_entry_id: await entry() }),
		notebook_staff_restore_entry: async () => {
			const e = await entry();
			await asAdminRpc('notebook_staff_delete_entry', { p_entry_id: e });
			return { p_entry_id: e };
		},
		notebook_staff_delete_note: async () => ({ p_note_id: await note(await entry()) }),
		notebook_staff_restore_note: async () => {
			const n = await note(await entry());
			await asAdminRpc('notebook_staff_delete_note', { p_note_id: n });
			return { p_note_id: n };
		},

		// ---- foundry ----
		foundry_review_version: async () => ({ p_version_id: (await app()).version, p_decision: 'approve', p_review_note: null, p_reject_reason: null }),
		foundry_set_app_hidden: async () => ({ p_app_id: (await app('approved')).app, p_hidden: true, p_reason: 'testing' }),
		foundry_set_app_major: async () => ({ p_app_id: (await app('approved')).app, p_major: true }),
		foundry_clear_metadata_flag: async () => {
			const a = await app('approved');
			await sql(`update public.student_apps set metadata_flagged_at = now() where id = $1`, [a.app]);
			return { p_app_id: a.app };
		},
		foundry_cover_set: async () => ({ p_app: (await app('approved')).app, p_kind: 'html', p_image_path: null, p_html: '<!doctype html><p>cover</p>' }),
		foundry_update_app_metadata: async () => ({ p_app_id: (await app('approved')).app, p_field: 'tagline', p_value: 'A better tagline.' }),
		foundry_set_section_open: async () => ({ p_section_id: w.block2, p_open: false, p_note: 'Test day.' }),
		foundry_set_site_open: async () => ({ p_open: false, p_note: 'Testing.' }),
		foundry_trusted_grant: async () => ({ p_email: w.students.leo, p_note: 'Trusted.' }),
		foundry_trusted_revoke: async () => {
			await asAdminRpc('foundry_trusted_grant', { p_email: w.students.danielV, p_note: 'to revoke' });
			return { p_email: w.students.danielV };
		},
		foundry_publisher_decide: async () => {
			const [r] = await sql<{ id: string }>(
				`insert into public.foundry_publisher_applications (applicant, applicant_email, answers) values ($1, $2, '[]'::jsonb) returning id`,
				[w.student.id, w.student.email]
			);
			return { p_application_id: r.id, p_decision: 'decline', p_note: 'Not yet.' };
		},
		foundry_publisher_set_questions: async () => ({
			p_questions: [{ prompt: 'Why do you want to publish?', kind: 'text' }]
		}),

		// ---- gauntlet ----
		gauntlet_author_upsert: async () => ({
			p_id: null,
			p_mode: 'speedrun',
			p_title: 'Sample challenge',
			p_difficulty: 2,
			p_status: 'draft',
			p_prompt: {},
			p_answer: {}
		}),
		gauntlet_author_delete: async () => ({ p_id: await challenge() }),
		gauntlet_author_set_status: async () => ({ p_id: await challenge(), p_status: 'archived' }),
		gauntlet_series_assign: async () => {
			const [s] = await sql<{ id: string }>(`insert into public.gauntlet_series (name) values ('Basics') returning id`);
			return { p_challenge_id: await challenge(), p_series_id: s.id, p_order: 1 };
		},
		gauntlet_rank_settings_set: async () => ({ p_speedrun_floor_ms: 20000 }),

		// ---- greenline ----
		greenline_decal_review: async () => {
			await sql(
				`insert into public.greenline_decals (user_id, path, status, reviewer_feedback, submitted_at) values ($1, $2, 'pending', '', now())
				 on conflict (user_id) do update set status = 'pending', reviewed_at = null`,
				[w.student.id, `${w.student.id}/decal.png`]
			);
			return { p_user_id: w.student.id, p_action: 'approve', p_feedback: '' };
		},
		greenline_track_review: async () => {
			const [t] = await sql<{ id: string }>(
				`insert into public.greenline_tracks (author_id, author_name, name, data, length_m) values ($1, 'Mateo', 'Loop', '{"v":2}'::jsonb, 900) returning id`,
				[w.student.id]
			);
			return { p_track_id: t.id, p_action: 'approve', p_feedback: null };
		},
		greenline_track_set_featured: async () => {
			const [t] = await sql<{ id: string }>(
				`insert into public.greenline_tracks (author_id, author_name, name, data, length_m, status) values ($1, 'Mateo', 'Feature', '{"v":2}'::jsonb, 900, 'approved') returning id`,
				[w.student.id]
			);
			return { p_track_id: t.id, p_featured: true };
		},
		greenline_track_remove: async () => {
			const [t] = await sql<{ id: string }>(
				`insert into public.greenline_tracks (author_id, author_name, name, data, length_m) values ($1, 'Mateo', 'Remove', '{"v":2}'::jsonb, 900) returning id`,
				[w.student.id]
			);
			return { p_track_id: t.id };
		},

		// ---- ideacad ----
		ideacad_material_save_global: async () => ({
			p_id: null,
			p_slug: `brass${randomUUID().slice(0, 4)}`,
			p_name: 'Brass',
			p_density_g_cm3: 8.5,
			p_thicknesses_in: [0.125],
			p_note: null,
			p_source: 'A published datasheet',
			p_source_verified: false
		}),
		ideacad_material_set_retired: async () => {
			const r = await asAdminRpc('ideacad_material_save_global', {
				p_id: null,
				p_slug: `copper${randomUUID().slice(0, 4)}`,
				p_name: 'Copper',
				p_density_g_cm3: 8.9,
				p_thicknesses_in: [0.125],
				p_note: null,
				p_source: 'A published datasheet',
				p_source_verified: false
			});
			return { p_id: r.id, p_retired: true };
		},

		// ---- maps ----
		maps_editor_grant: async () => ({ p_email: w.student.email, p_node_id: await mapsNode(), p_note: 'Shop helper' }),
		maps_editor_revoke: async () => {
			const node = await mapsNode();
			await asAdminRpc('maps_editor_grant', { p_email: w.student.email, p_node_id: node, p_note: null });
			return { p_email: w.student.email, p_node_id: node };
		},
		maps_publish: async () => ({ p_object_table: 'maps_nodes', p_object_id: await mapsNode() }),

		// ---- the IDEA Market banner, stocks, and the site's feedback list (ledger 0416) ----
		coin_banner_save: async () => ({
			p_id: null, p_kind: 'link', p_listing_id: null, p_title: `Tissue boxes ${letters(4)}`, p_subtitle: 'Both sizes',
			p_href: '/coins', p_starts_on: null, p_ends_on: null, p_section_id: null, p_sort_order: 0
		}),
		coin_banner_remove: async () => {
			const r = await asAdminRpc('coin_banner_save', {
				p_id: null, p_kind: 'link', p_listing_id: null, p_title: `Supplies ${letters(4)}`, p_subtitle: null,
				p_href: '/coins', p_starts_on: null, p_ends_on: null, p_section_id: null, p_sort_order: 0
			});
			return { p_id: r.pin_id };
		},
		coin_stock_admin_set: async () => ({ p_stock_id: 'gauntlet', p_active: false }),
		app_feedback_file: async () => ({ p_app: 'portal', p_kind: 'bug', p_message: `The matrix theme is still ${letters(5)}.` }),
		// ---- armory ----
		armory_app_feedback_set_status: async () => {
			const [r] = await sql<{ id: string }>(
				`insert into public.armory_app_feedback (email, app_version, kind, body, context) values ($1, '0.3.0', 'bug', 'It froze.', '{}'::jsonb) returning id`,
				[w.student.email]
			);
			return { p_id: r.id, p_status: 'seen' };
		},
		armory_app_incident_set_status: async () => {
			const [r] = await sql<{ id: string }>(
				`insert into public.armory_app_incidents (email, app_version, kind, summary, report, report_bytes) values ($1, '0.3.0', 'crash', 'It crashed.', '{}'::jsonb, 2) returning id`,
				[w.student.email]
			);
			return { p_id: r.id, p_status: 'seen' };
		},
		armory_create_project: async () => ({ p_name: `Robot ${randomUUID().slice(0, 6)}`, p_season: 2027, p_operation: randomUUID() }),
		// ledger 0416: team membership by email, with a role.
		armory_add_member: async () => ({ p_project: (await armoryFile()).project, p_email: `new.${letters()}@boscotech.net`, p_role: 'cad_lead', p_operation: randomUUID() }),
		armory_remove_member: async () => ({ p_project: (await armoryFile()).project, p_email: w.student.email, p_operation: randomUUID() }),
		armory_break_lock: async () => ({ p_file: (await armoryFile()).file, p_device: null, p_operation: randomUUID() }),
		armory_break_locks: async () => ({ p_files: [(await armoryFile()).file], p_device: null, p_operation: randomUUID() }),

		// ---- certifications ----
		cert_admin_save: async () => ({ p_id: null, p_package: samplePackage(`S${randomUUID().slice(0, 5).toUpperCase()}`), p_note: 'sample' }),
		cert_exam_pool_replace: async () => ({ p_cert: await certId(), p_questions: samplePool() }),
		cert_lesson_save: async () => ({ p_cert: await certId(), p_slug: 'tramming', p_title: 'Tramming', p_document: '<p>one</p>', p_manifest: {} }),

		// ---- site ----
		admin_grant: async () => ({ p_email: `staff${randomUUID().slice(0, 4)}@boscotech.edu`, p_note: 'sample' }),
		admin_revoke: async () => {
			const email = `staff${randomUUID().slice(0, 4)}@boscotech.edu`;
			await sql(`insert into public.app_admins (email, granted_by) values ($1, 'test')`, [email]);
			return { p_email: email };
		},
		app_feedback_set_status: async () => ({ p_id: await feedback(), p_status: 'seen' }),
		app_feedback_set_horizon: async () => ({ p_id: await feedback(), p_horizon: 'long_term' }),
		app_feedback_edit: async () => ({ p_id: await feedback(), p_kind: 'bug', p_message: 'The Save button is stuck.', p_tried: null, p_base_revision: 0 }),
		app_short_link_upsert: async () => ({ p_slug: `blade${randomUUID().slice(0, 4)}`, p_target: '/classroom', p_label: 'Blade', p_active: true }),
		app_short_link_delete: async () => {
			const slug = `old${randomUUID().slice(0, 4)}`;
			await asAdminRpc('app_short_link_upsert', { p_slug: slug, p_target: '/classroom', p_label: null, p_active: true });
			return { p_slug: slug };
		},
		clear_fsp_session: async () => {
			await sql(`insert into public.fsp_questions (question, session_id) values ('Why gears?', 'session-1')`);
			return { p_session_id: 'session-1' };
		},
		frc_mark_complete: async () => ({ p_user_id: w.student.id, p_unit_id: 'safety-101' }),
		frc_unmark_complete: async () => {
			await sql(`insert into public.frc_user_progress (user_id, unit_id) values ($1, 'cad-201') on conflict do nothing`, [w.student.id]);
			return { p_user_id: w.student.id, p_unit_id: 'cad-201' };
		},
		profile_avatar_hide: async () => {
			await sql(`update public.profiles set avatar = 'preset:gear' where id = $1`, [w.student.id]);
			return { p_email: w.student.email, p_reason: 'Not school appropriate.' };
		},
		profile_avatar_restore: async () => {
			await sql(`update public.profiles set avatar = 'preset:gear' where id = $1`, [w.student.id]);
			await asAdminRpc('profile_avatar_hide', { p_email: w.student.email, p_reason: 'to restore' });
			return { p_email: w.student.email };
		},

		// ---- tournaments ----
		tournament_create: async () => ({ p_name: `Blade Night ${randomUUID().slice(0, 4)}`, p_description: 'A test.', p_config: null }),
		tournament_delete: async () => {
			const name = `Gone ${randomUUID().slice(0, 4)}`;
			return { p_tournament_id: await tournament(name), p_confirm_name: name, p_acknowledge_payout_loss: false };
		},
		tournament_update: async () => ({ p_tournament_id: await tournament(), p_name: 'Renamed Cup', p_description: 'Changed.', p_config: null }),
		tournament_set_status: async () => ({ p_tournament_id: await tournament(undefined, false), p_status: 'registration_open' }),
		tournament_host_add_entry: async () => ({ p_tournament_id: await tournament(), p_display_name: 'Gearheads', p_description: '', p_thumbnail_url: null, p_linked_user_id: null }),
		tournament_remove_entry: async () => ({ p_entry_id: await tEntry(await tournament()) }),
		tournament_update_entry: async () => ({ p_entry_id: await tEntry(await tournament()), p_display_name: 'Gear Grinders', p_description: 'Renamed.', p_thumbnail_url: null }),
		tournament_add_entry_member: async () => ({ p_entry_id: await tEntry(await tournament()), p_name: 'Mateo R', p_email: null }),
		tournament_remove_entry_member: async () => {
			const e = await tEntry(await tournament());
			const m = (await as<{ id: string }>(w.admin, `select public.tournament_add_entry_member($1, 'Leo L', null) as id`, [e])).id;
			return { p_member_id: m };
		},
		tournament_rename_entry_member: async () => {
			const e = await tEntry(await tournament());
			const m = (await as<{ id: string }>(w.admin, `select public.tournament_add_entry_member($1, 'Leo L', null) as id`, [e])).id;
			return { p_member_id: m, p_name: 'Leo Lee' };
		},
		tournament_reorder_seed: async () => {
			const t = await tournament();
			await tEntry(t, 'First');
			const second = await tEntry(t, 'Second');
			return { p_tournament_id: t, p_entry_id: second, p_new_position: 1 };
		},
		tournament_shuffle_seeds: async () => {
			const t = await tournament();
			await tEntry(t, 'One');
			await tEntry(t, 'Two');
			return { p_tournament_id: t };
		},
		tournament_generate_qual_pools: async () => {
			const t = await tournament(undefined, true, true);
			for (const n of ['A', 'B', 'C', 'D']) await tEntry(t, `Team ${n}`);
			await as(w.admin, `select public.tournament_set_status($1, 'seeding')`, [t]);
			return { p_tournament_id: t, p_pool_count: 2 };
		},
		tournament_add_host: async () => ({ p_tournament_id: await tournament(), p_user_id: w.teacher.id, p_email: null }),
		tournament_send_invite: async () => ({ p_tournament_id: await tournament(), p_invited_user_id: w.student.id, p_email: null }),
		tournament_set_entry_style: async () => ({
			p_entry_id: await tEntry(await tournament()),
			p_background_type: null,
			p_background_value: null,
			p_accent_color: '#2a9d8f',
			p_badge: null,
			p_flourish: null,
			p_tagline: 'Torque on.'
		}),
		tournament_set_reward_rules: async () => ({ p_tournament_id: await tournament(), p_rules: [{ trigger_type: 'win', amount: 2 }] }),

		// ---- the connector's own ----
		connector_admin_set_enabled: async () => ({ p_enabled: false }),
		connector_admin_disconnect: async () => {
			const r = await sql<{ id: string }>(
				`insert into public.connector_tokens (user_id, email, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
				 values ($1, $2, 'perm', md5(random()::text) || md5(random()::text), md5(random()::text) || md5(random()::text), now() + interval '1 hour', now() + interval '1 day') returning id`,
				[w.admin.id, w.admin.email]
			);
			return { p_token_id: r[0].id };
		},
		connector_admin_disconnect_all: async () => {
			await sql(
				`insert into public.connector_tokens (user_id, email, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
				 values ($1, $2, 'perm', md5(random()::text) || md5(random()::text), md5(random()::text) || md5(random()::text), now() + interval '1 hour', now() + interval '1 day')`,
				[w.admin.id, w.admin.email]
			);
			return {};
		},
		connector_admin_set_gap: async () => {
			const [g] = await sql<{ id: string }>(
				`insert into public.connector_gaps (user_id, email, said, said_norm, missing) values ($1, $2, 'make a seating chart', 'make a seating chart', 'Seating charts.') returning id`,
				[w.admin.id, w.admin.email]
			);
			return { p_id: g.id, p_status: 'declined', p_ledger: null, p_note: null };
		}
	};
	// A GENERIC-PROOF ENTRY (every generated one, and a hand entry marked
	// `proof: generic`) is called with placeholder arguments of the right
	// types: enough to reach its gate as a student, a teacher or nobody, and to
	// show that asking first holds for the admin. What it does for the admin
	// with real arguments is not judged here (no sample says what real is).
	for (const e of Object.values(FUNCTIONS)) {
		if (e.proof !== 'generic' || !liveFunction(e.name) || e.level === 'read' || raw[e.name]) continue;
		raw[e.name] = async () => genericArgs(e.name, { p_section_id: w.block2 });
	}
	const samples: Record<string, () => Promise<Args>> = Object.fromEntries(
		Object.entries(raw).map(([name, make]) => [name, async () => (await init(), make())])
	);
	async function readValues(): Promise<(param: string, type: string) => unknown> {
		await init();
		const item = await newItem('Read me');
		const files = await armoryFile();
		const cert = await certId();
		const made = await app('approved');
		const t = await tournament();
		const ch = await challenge();
		const [att] = await sql<{ id: string }>(
			`insert into public.classroom_attachments (item_id, storage_key, filename, mime_type, size_bytes, uploaded_by)
			 values ($1::uuid, $1::text || '/' || gen_random_uuid() || '.pdf', 'handout.pdf', 'application/octet-stream', 10, $2) returning id`,
			[item, w.admin.email]
		);
		const known: Record<string, unknown> = {
			p_section_id: w.block2,
			p_project: files.project,
			p_item_id: item,
			p_item_ids: [item],
			p_email: w.students.mateo,
			p_student_email: w.students.mateo,
			p_student_id: w.students.mateo,
			p_query: 'Mateo',
			p_slug: 'syllabus',
			p_limit: 10,
			p_cert: cert,
			p_code: 'IDEA209H',
			p_app_id: made.app,
			p_file: files.file,
			p_file_id: files.file,
			p_attachment_id: att.id,
			p_kind: 'notes',
			p_from: '2026-09-01T00:00:00Z',
			p_to: '2026-12-01T00:00:00Z',
			p_owner: w.student.id,
			p_challenge_id: ch,
			p_tournament_id: t,
			p_document_id: item,
			p_scope: 'all'
		};
		return (param, type) => {
			if (param in known) return known[param];
			if (type === 'uuid') return randomUUID();
			if (type === 'uuid[]') return [];
			if (type === 'integer' || type === 'smallint' || type === 'bigint') return 1;
			if (type === 'boolean') return false;
			return 'sample';
		};
	}
	return { samples, owner, readValues };
}
