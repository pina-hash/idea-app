/**
 * A CLASS BY THE WAY HE SAYS IT (ledger 0422): "IDEA100 Block 2", "209H 3",
 * "Block 4", or its id. Read through the admin's own session. One match or a
 * plain refusal naming the choices; never a guess.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type SectionMatch = { ok: true; id: string; label: string } | { ok: false; message: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function resolveSectionByName(supabase: SupabaseClient, said: string): Promise<SectionMatch> {
	const text = said.trim();
	const { data, error } = await supabase.from('classroom_sections').select('id, label, block, active, classroom_courses(code)');
	if (error) return { ok: false, message: 'The classes could not be read.' };
	const rows = ((data ?? []) as { id: string; label: string; block: string | null; active?: boolean; classroom_courses: { code: string } | { code: string }[] | null }[])
		.filter((s) => s.active !== false)
		.map((s) => {
			const c = Array.isArray(s.classroom_courses) ? s.classroom_courses[0] : s.classroom_courses;
			return { id: s.id, label: `${c?.code ?? ''} ${s.label}`.trim(), words: norm(`${c?.code ?? ''} ${s.label} ${s.block ?? ''}`) };
		});
	const byId = rows.find((r) => r.id === text);
	if (byId) return { ok: true, id: byId.id, label: byId.label };
	const want = norm(text).split(' ').filter(Boolean);
	if (!want.length) return { ok: false, message: 'Name the class.' };
	const hits = rows.filter((r) => want.every((w) => r.words.split(' ').some((x) => x === w || x.startsWith(w) || x.includes(w))));
	if (hits.length === 1) return { ok: true, id: hits[0].id, label: hits[0].label };
	if (hits.length === 0) return { ok: false, message: `No class matches "${said}".` };
	return { ok: false, message: `More than one class matches "${said}": ${hits.map((h) => h.label).join(', ')}.` };
}
