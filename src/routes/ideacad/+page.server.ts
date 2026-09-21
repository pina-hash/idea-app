/**
 * THE CHOOSER'S LOAD. It answers one question -- what can this caller open, and
 * what does each of those things look like -- and it is the only place that
 * question is asked.
 *
 * WHAT MAKES THE LIST IS RLS AND NOT A FILTER WRITTEN HERE.
 * `_ideacad_can_read_document` (0205) admits the owner, a grantee, a class the
 * document was shared with, and a MANAGER of the assignment -- so a teacher's
 * chooser legitimately contains every student's document on every IdeaCAD
 * assignment they run. Nothing below re-states who may see what; the policy is
 * the boundary. What the projection adds is the ATTRIBUTION that makes such a
 * list readable: thirty documents on one assignment all carry the same title,
 * because the title IS the assignment's.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ideacadNormalizeEmail } from '$lib/ideacad/sharing';
import {
	ideaCadProfileSketch,
	type IdeaCadDocumentSource,
	type IdeaCadDocumentSummary,
	type IdeaCadPaneLayout
} from '$lib/ideacad/app/types';
import { normalizeDocument, normalizeFolder } from '$lib/ideacad/solid/launch/library';
import { STORAGE_UNAVAILABLE } from '$lib/ideacad/solid/launch/wording';

const DEFAULT_LAYOUT: IdeaCadPaneLayout = { left: 260, right: 240, leftOpen: true, rightOpen: true };

/** One row of `ideacad_documents`, with `0214`'s column optional. See the ladder. */
type DocumentRow = {
	id: string;
	item_id: string;
	student_email: string;
	active_concept_id: string | null;
	updated_at: string;
	archived_at?: string | null;
	model_format?: string;
};

/**
 * THE SELECT LADDER, AND IT REPLACES A SELECT THAT COULD RETURN NOTHING AT ALL.
 *
 * This read used to be a single `.is('archived_at', null)`, and `archived_at`
 * is `0214`'s column. PostgREST REJECTS A FILTER NAMING AN UNKNOWN COLUMN and
 * fails the whole select, so on a deployment sitting between 0213 and 0214 --
 * a real state, since every migration here is applied one file at a time by
 * hand -- the documents read answered nothing and the chooser told a student
 * with a term of work that they had no documents. Silent, total, and
 * indistinguishable from a new account.
 *
 * So the wide rung asks for the column and the narrow rung does not, and the
 * ARCHIVE FLAG IS THE CAPABILITY THAT REPORTS ITSELF: without `0214` no
 * document can be archived, so `archived_at` is null for every row, which is
 * the truth on that deployment rather than a guess.
 */
async function readDocuments(
	supabase: App.Locals['supabase']
): Promise<{ rows: DocumentRow[]; archiveColumn: boolean }> {
	const direct = await supabase.from('ideacad_documents').select('id,item_id,student_email,active_concept_id,updated_at,archived_at,model_format').order('updated_at',{ascending:false});
	if(!direct.error)return{rows:(direct.data??[]) as DocumentRow[],archiveColumn:true};
	const wide = await supabase
		.from('ideacad_documents')
		.select('id,item_id,student_email,active_concept_id,updated_at,archived_at')
		.order('updated_at', { ascending: false });
	if (!wide.error) return { rows: (wide.data ?? []) as DocumentRow[], archiveColumn: true };
	const narrow = await supabase
		.from('ideacad_documents')
		.select('id,item_id,student_email,active_concept_id,updated_at')
		.order('updated_at', { ascending: false });
	return { rows: (narrow.data ?? []) as DocumentRow[], archiveColumn: false };
}

/**
 * HOW MANY IDS GO INTO ONE `in(...)`.
 *
 * A MANAGER'S LIST IS NOT SMALL. `_ideacad_can_read_document` admits the manager
 * of an assignment, so a teacher running five IdeaCAD assignments across four
 * sections can legitimately read several hundred documents -- and PostgREST
 * takes an `in` list in the QUERY STRING, where a few hundred uuids is tens of
 * kilobytes and the request comes back 414 with the whole read lost. The failure
 * is silent in the worst way: the chooser would answer "no documents" to the one
 * person with the most of them, and only after a year of use.
 *
 * CHUNKING RATHER THAN A `limit`, deliberately. Capping the read would make the
 * search and the filters describe a window instead of the list, so a document
 * that is simply old would be unfindable with nothing on screen saying why. 100
 * uuids is about 3.7 kB of query string, comfortably inside any deployment's
 * limit, and the chunks are issued together.
 */
const IN_CHUNK = 100;

const chunked = <T>(ids: readonly string[]): string[][] => {
	const out: string[][] = [];
	for (let i = 0; i < ids.length; i += IN_CHUNK) out.push([...ids.slice(i, i + IN_CHUNK)]);
	return out;
};

/** Run one `in(...)` read per chunk and flatten. An errored chunk contributes
 *  nothing, which costs a thumbnail or a tally and never the whole list. */
async function readIn<T>(
	ids: readonly string[],
	read: (chunk: string[]) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
	if (ids.length === 0) return [];
	const pages = await Promise.all(chunked(ids).map((chunk) => read(chunk)));
	return pages.flatMap((page) => page.data ?? []);
}

/**
 * WHICH ASSIGNMENTS THIS CALLER MANAGES, asked only where the answer can change
 * what is drawn.
 *
 * `_classroom_manages_item` is not a question a browser can ask and there is no
 * projected flag for it on any read this page already makes. `ideacad_archive`
 * IS that question -- it raises for anyone who is not a manager of the item --
 * and it is a read that writes nothing, so it doubles as the probe.
 *
 * IT IS ASKED ONLY FOR ITEMS CARRYING A DOCUMENT THE CALLER DOES NOT OWN, which
 * is the only population where archiving is on the table: a student owns every
 * document in their own list and asks nothing at all. That keeps the ordinary
 * student load at zero extra round trips and a teacher's at one per assignment.
 *
 * IT FAILS CLOSED. `PGRST202` (no `0214` on this deployment), a refusal, or any
 * other error all answer "not a manager here", and the control is then ABSENT
 * rather than present-and-refusing -- the rule every other IdeaCAD capability
 * follows.
 */
async function readManagedItems(
	supabase: App.Locals['supabase'],
	itemIds: readonly string[]
): Promise<Set<string>> {
	if (itemIds.length === 0) return new Set();
	const answers = await Promise.all(
		itemIds.map(async (itemId) => {
			const { error } = await supabase.rpc('ideacad_archive', { p_item_id: itemId });
			return error ? null : itemId;
		})
	);
	return new Set(answers.filter((id): id is string => id !== null));
}

export const load: PageServerLoad = async ({ locals: { supabase, claims }, parent }) => {
	if (!claims) redirect(303, '/');
	/* WITH NO ADDRESS ON THE CLAIMS, NOTHING IS THE CALLER'S OWN, and that is the
	   safe direction rather than an oversight: every card then carries an owner
	   line, which over-attributes rather than claiming somebody else's work is
	   yours. The database never consults this -- every RPC reads
	   `current_user_email()` for itself -- so only the rendering degrades. */
	const viewerEmail = ideacadNormalizeEmail(claims.email ?? '');

	const [{ rows: allDocumentRows }, { data: editorRows }, parentData,directResult,folderResult] = await Promise.all([
		readDocuments(supabase),
		supabase.from('ideacad_editors').select('item_id'),
		parent(),
		supabase.rpc('ideacad_direct_documents'),
		/* THE LAUNCH PAGE'S FOLDERS, from 0217. A deployment before it answers
		   `PGRST202`, which is a state to name in one sentence, never a failed
		   load: the list below still renders and the rail says why filing is
		   not on offer yet. Any other error is reported verbatim. */
		supabase.rpc('ideacad_direct_folders')
	]);
	const directDocuments=(Array.isArray(directResult.data)?directResult.data:[]).map(normalizeDocument);
	const directFolders=(Array.isArray(folderResult.data)?folderResult.data:[]).map(normalizeFolder);
	const directFoldersError=folderResult.error?(folderResult.error.code==='PGRST202'?STORAGE_UNAVAILABLE:folderResult.error.message):null;
	const directIds=new Set(directDocuments.map(row=>row.id));
	const documentRows=allDocumentRows.filter(row=>row.item_id&&row.model_format!=='solid-v1'&&!directIds.has(row.id));

	const itemIds = [
		...new Set([...documentRows.map((r) => r.item_id), ...(editorRows ?? []).map((r) => r.item_id)])
	];
	const activeIds = documentRows
		.map((row) => row.active_concept_id)
		.filter((id): id is string => typeof id === 'string');
	const documentIds = documentRows.map((row) => row.id);

	/* The thumbnail's tree and the concept tally are two TARGETED reads rather
	   than one read of every concept: a class of thirty with four concepts each
	   is 120 stored trees, and a card draws exactly one of them. */
	const [itemRows, activeRows, conceptRows, managed] = await Promise.all([
		readIn<{ id: string; title: string | null }>(itemIds, (chunk) =>
			supabase.from('classroom_items').select('id,title').in('id', chunk)
		),
		readIn<{ id: string; features: unknown }>(activeIds, (chunk) =>
			supabase.from('ideacad_concepts').select('id,features').in('id', chunk)
		),
		readIn<{ document_id: string }>(documentIds, (chunk) =>
			supabase.from('ideacad_concepts').select('document_id').in('document_id', chunk).is('deleted_at', null)
		),
		readManagedItems(
			supabase,
			[
				...new Set(
					documentRows
						.filter((row) => ideacadNormalizeEmail(row.student_email) !== viewerEmail)
						.map((row) => row.item_id)
				)
			]
		)
	]);

	const titles = new Map(itemRows.map((row) => [row.id, row.title || 'Untitled document']));
	const trees = new Map(activeRows.map((row) => [row.id, row.features]));
	const counts = new Map<string, number>();
	for (const row of conceptRows) {
		counts.set(row.document_id, (counts.get(row.document_id) ?? 0) + 1);
	}

	const documents: IdeaCadDocumentSummary[] = documentRows.map((row) => ({
		id: row.id,
		itemId: row.item_id,
		title: titles.get(row.item_id) ?? 'IdeaCAD document',
		updatedAt: row.updated_at,
		ownerEmail: row.student_email,
		isOwn: ideacadNormalizeEmail(row.student_email) === viewerEmail,
		archivedAt: row.archived_at ?? null,
		conceptCount: counts.get(row.id) ?? 0,
		profile: row.active_concept_id ? ideaCadProfileSketch(trees.get(row.active_concept_id)) : null,
		canArchive: managed.has(row.item_id)
	}));

	/* A starter is an assignment with an editor and no document of the CALLER'S
	   OWN. It is keyed on the caller rather than on the item because a manager's
	   list carries other people's documents on assignments they have never
	   started themselves, and excluding those would take the New document card
	   away from the one person who most needs to open the thing they set. */
	const started = new Set([...documents.filter((row) => row.isOwn).map((row) => row.itemId),...directDocuments.filter(row=>row.isOwn).map(row=>row.itemId)]);
	const sources: IdeaCadDocumentSource[] = (editorRows ?? [])
		.filter((row) => !started.has(row.item_id))
		.map((row) => ({ itemId: row.item_id, title: titles.get(row.item_id) ?? 'New IdeaCAD document' }));

	const raw = (parentData.userProfile?.preferences as Record<string, unknown> | undefined)
		?.ideacad as { panes?: Partial<IdeaCadPaneLayout> } | undefined;
	return {
		directDocuments,directError:directResult.error?.message??null,directFolders,directFoldersError,
		documents,
		sources,
		userId: claims.sub,
		initialLayout: { ...DEFAULT_LAYOUT, ...(raw?.panes ?? {}) }
	};
};
