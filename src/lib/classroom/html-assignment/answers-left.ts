/**
 * WHAT IS STILL OWED ON A PORTED WORKSHEET, AS A LIST A STUDENT CAN WALK
 * (ledger 0431, report cb6d42bc: "i want to be able to click on answers left,
 * see all the stuff remaining in a list that i can then click each answer and
 * ill be taken to it").
 *
 * IT IS `hxProgress`'S OWN BLOCKS, NEVER A SECOND JUDGMENT. A row is here
 * exactly when the rail counts the block and does not count it met, so the
 * list and the chip's "N answers left" are one answer: the chip's count is the
 * number of rows under its module. Header blocks and optional blocks carry
 * weight 0 and are never listed, for the reason they never hold the bar back.
 *
 * Plain data and plain functions: the components draw it, and a test can put
 * a manifest to it with no browser.
 */
import { hxBlockPrompt, type HtmlAssignmentManifest } from './manifest';
import type { HxProgress, HxProgressBlock } from './progress';

/** What a jump achieved: at the answer, at the top of the worksheet, or nothing. */
export type HxJumpResult = 'answer' | 'frame' | 'none';

export interface HxAnswerLeft {
	field: string;
	blockId: string;
	/** What the student reads first: the block's own prompt, or its place. */
	label: string;
	/** What it still wants, in a few words. */
	want: string;
}

export interface HxAnswersLeftGroup {
	moduleId: string | null;
	title: string;
	items: HxAnswerLeft[];
}

/** The prompt for each field the manifest declares a prompt for. */
function promptsByField(manifest: HtmlAssignmentManifest): Map<string, string> {
	const out = new Map<string, string>();
	const consider = (block: unknown) => {
		const field = (block as { field?: unknown })?.field;
		const prompt = hxBlockPrompt(block);
		if (typeof field === 'string' && prompt) out.set(field, prompt);
	};
	for (const block of manifest.header ?? []) consider(block);
	for (const mod of manifest.modules ?? []) for (const block of mod.blocks ?? []) consider(block);
	return out;
}

/** Where a block sits among its module's required answers, in words. */
function placeOf(block: HxProgressBlock): string {
	if (block.type === 'image') return block.photosOf > 1 ? `Photo ${block.photoPosition} of ${block.photosOf}` : 'Photo';
	return block.of > 1 ? `Answer ${block.position} of ${block.of}` : 'Answer';
}

/** What an unmet block still wants. Short: the row is a link, not a paragraph. */
export function hxAnswerWant(block: HxProgressBlock): string {
	if (block.type === 'image') return 'Needs a photo';
	if (block.reason === 'short') {
		const left = Math.max(1, block.need - block.have);
		return `${left} more ${left === 1 ? 'sentence' : 'sentences'}`;
	}
	if (block.type === 'checkbox') return 'Box to check';
	if (block.type === 'radio') return 'Pick one';
	if (block.type === 'table') return 'Empty table';
	return 'Empty';
}

/**
 * THE ROWS, grouped by module in manifest order, each module once. A label
 * longer than a line is cut at a word, because the whole prompt is in the
 * worksheet the row takes you to.
 */
export function hxAnswersLeft(manifest: HtmlAssignmentManifest, progress: HxProgress): HxAnswersLeftGroup[] {
	const prompts = promptsByField(manifest);
	const groups: HxAnswersLeftGroup[] = [];
	const byModule = new Map<string, HxAnswersLeftGroup>();
	for (const block of progress.blocks) {
		if (block.weight <= 0 || block.met) continue;
		const key = block.moduleId ?? '';
		let group = byModule.get(key);
		if (!group) {
			group = { moduleId: block.moduleId, title: block.moduleTitle ?? 'Top of the page', items: [] };
			byModule.set(key, group);
			groups.push(group);
		}
		const prompt = prompts.get(block.field);
		group.items.push({
			field: block.field,
			blockId: block.blockId,
			label: prompt ? clip(prompt, 90) : placeOf(block),
			want: hxAnswerWant(block)
		});
	}
	return groups;
}

/** How many rows `hxAnswersLeft` has, which is the rail's own unmet count. */
export function hxAnswersLeftCount(progress: HxProgress): number {
	return progress.blocks.filter((b) => b.weight > 0 && !b.met).length;
}

function clip(text: string, max: number): string {
	if (text.length <= max) return text;
	const cut = text.slice(0, max);
	const at = cut.lastIndexOf(' ');
	return `${(at > 40 ? cut.slice(0, at) : cut).replace(/[\s,.;:]+$/, '')}...`;
}

/**
 * WHAT A STUDENT TYPED THAT THE SERVER DOES NOT HAVE, for the panel shown when
 * an assignment closes under an open worksheet (ledger 0431). Text answers
 * only, in manifest order, each with where it belongs, so it can be copied out
 * or kept until the teacher reopens it. A checkbox or a pick has nothing worth
 * copying and is counted rather than listed.
 */
export interface HxUnsavedAnswer {
	field: string;
	where: string;
	text: string;
}

export function hxUnsavedAnswers(
	manifest: HtmlAssignmentManifest,
	values: Readonly<Record<string, string | boolean>>,
	unsaved: readonly string[]
): { answers: HxUnsavedAnswer[]; others: number } {
	const owed = new Set(unsaved);
	const prompts = promptsByField(manifest);
	const answers: HxUnsavedAnswer[] = [];
	let others = 0;
	const consider = (field: string, moduleTitle: string | null) => {
		if (!owed.has(field)) return;
		owed.delete(field);
		const value = values[field];
		if (typeof value === 'string' && value.trim() !== '') {
			const prompt = prompts.get(field);
			answers.push({ field, where: [moduleTitle, prompt ? clip(prompt, 60) : null].filter(Boolean).join(': ') || 'Top of the page', text: value });
		} else others += 1;
	};
	for (const block of manifest.header ?? []) consider(block.field, null);
	for (const mod of manifest.modules ?? []) for (const block of mod.blocks ?? []) consider(block.field, mod.title);
	return { answers, others: others + owed.size };
}
