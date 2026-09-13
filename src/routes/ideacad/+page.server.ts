import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { IdeaCadDocumentSource, IdeaCadDocumentSummary, IdeaCadPaneLayout } from '$lib/ideacad/app/types';

const DEFAULT_LAYOUT: IdeaCadPaneLayout = { left: 260, right: 240, leftOpen: true, rightOpen: true };

export const load: PageServerLoad = async ({ locals: { supabase, claims }, parent }) => {
	if (!claims) redirect(303, '/');
	const [{ data: documentRows }, { data: editorRows }, parentData] = await Promise.all([
		supabase.from('ideacad_documents').select('id,item_id,updated_at').is('archived_at', null).order('updated_at', { ascending: false }),
		supabase.from('ideacad_editors').select('item_id'),
		parent()
	]);
	const itemIds = [...new Set([...(documentRows ?? []).map((r) => r.item_id), ...(editorRows ?? []).map((r) => r.item_id)])];
	const { data: itemRows } = itemIds.length ? await supabase.from('classroom_items').select('id,title').in('id', itemIds) : { data: [] };
	const titles = new Map((itemRows ?? []).map((row) => [row.id, row.title || 'Untitled document']));
	const documents: IdeaCadDocumentSummary[] = (documentRows ?? []).map((row) => ({ id: row.id, itemId: row.item_id, title: titles.get(row.item_id) ?? 'IdeaCAD document', updatedAt: row.updated_at }));
	const existing = new Set(documents.map((row) => row.itemId));
	const sources: IdeaCadDocumentSource[] = (editorRows ?? []).filter((row) => !existing.has(row.item_id)).map((row) => ({ itemId: row.item_id, title: titles.get(row.item_id) ?? 'New IdeaCAD document' }));
	const raw = (parentData.userProfile?.preferences as Record<string, unknown> | undefined)?.ideacad as { panes?: Partial<IdeaCadPaneLayout> } | undefined;
	return { documents, sources, userId: claims.sub, initialLayout: { ...DEFAULT_LAYOUT, ...(raw?.panes ?? {}) } };
};
