/**
 * THE QUESTIONS AND EVERY STUDENT'S ANSWER TO ONE OF THEM, FOR A PORTED
 * WORKSHEET (ledger 0360, report 41c7fcd5).
 *
 * Mr. Pina: a quick view of just the questions and answers "that I don't have
 * to see so much scrolling down the HTML to be able to see the students work".
 * The worksheets are long documents and getting longer; reading one question
 * across a class meant opening thirty documents and scrolling each one to the
 * same place.
 *
 * THE QUESTIONS COME FROM THE STORED MANIFEST, NEVER FROM THE DOCUMENT. A block's
 * `prompt` display key is its question when the author declared one, and
 * `<module title>: <field>` otherwise -- the same name the exports use, because
 * it is read through the same walk (`htmlAnswerSheet`). Reading question text
 * out of the HTML would be a second parser of the document and a per-view read
 * of `classroom_html_assignments.document`, which the 2026-09-29/30 outage
 * (ledger 0357) is the reason nothing may add.
 *
 * THE ANSWERS ARE THE ROWS THE CONSOLE ALREADY HOLDS, projected through
 * `hxValuesFromResponses` and `hxImagesFromFiles` -- the two projections the
 * read-only frame is seeded with -- so the Q&A view cannot show a grader an
 * answer the document would not have shown them. Pure, so every rule here is
 * asserted in node (`tests/html-assignment-qa.test.ts`).
 */

import type { StudentWork } from '$lib/classroom/assignment-spec';
import { cellLinks, type AnswerLink } from '$lib/classroom/answer-links';
import { tableRowsText, worksheetTableRows } from '$lib/classroom/grading-export';
import { hxImagesFromFiles, hxValuesFromResponses } from './answers';
import type { HtmlAssignmentManifest, HtmlLinkKind } from './manifest';
import { htmlAnswerSheet, htmlAnswerText, type HtmlAnswerCell } from './mount';

/** One question, in manifest order, header first. */
export interface QaQuestion {
	blockId: string;
	/** The module's title, or 'Identity' for a header block. */
	moduleTitle: string;
	/** True for a header (identity) block. */
	header: boolean;
	/** What a grader reads: the `prompt`, else `<module title>: <field>`. */
	label: string;
	/** The document author's own name for the input. */
	field: string;
	/** Did the author declare a prompt (so `field` is worth printing beside it). */
	prompted: boolean;
	type: string;
	link: HtmlLinkKind | null;
}

/** One student's answer to the chosen question. */
export interface QaAnswer {
	email: string;
	displayName: string;
	active: boolean;
	/**
	 * The answer as text: null for NO ANSWER SAVED, '' for an answer opened and
	 * left blank (a grader is telling those two apart), a word for a checkbox, and
	 * a table flattened to `Row 1: key=value, ...` the way the answers CSV reads it.
	 */
	text: string | null;
	/** The photograph attached to this block, if any. */
	image: { name: string; caption: string | null } | null;
	/** Links in this answer (`cellLinks`, the one finder). */
	links: AnswerLink[];
}

function cellText(cell: HtmlAnswerCell): string | null {
	if (cell.type === 'table' && typeof cell.value === 'string' && cell.value !== '') {
		const table = worksheetTableRows(cell.value);
		if (table.raw !== null) return table.raw;
		return tableRowsText(table.columns, table.rows);
	}
	return htmlAnswerText(cell.value);
}

/**
 * EVERY QUESTION THE WORKSHEET ASKS, in the order the document asks it, the
 * identity header first. A manifest this cannot walk asks nothing, which is the
 * same fail-closed answer every other reader of a stored manifest gives.
 */
export function htmlQaQuestions(manifest: unknown): QaQuestion[] {
	const out: QaQuestion[] = [];
	for (const group of htmlAnswerSheet(manifest, {}, {})) {
		for (const cell of group.cells) {
			out.push({
				blockId: cell.blockId,
				moduleTitle: group.title,
				header: group.moduleId === null,
				label: cell.prompt ?? (group.title ? `${group.title}: ${cell.field}` : cell.field),
				field: cell.field,
				prompted: cell.prompt !== null,
				type: cell.type,
				link: cell.link
			});
		}
	}
	return out;
}

/**
 * EVERY STUDENT'S ANSWER TO ONE QUESTION, in the order the students are given
 * (the list on screen). A block the manifest does not declare answers nobody:
 * there is no question to read an answer under, and inventing one would show
 * a grader an answer under the wrong question.
 */
export function htmlQaColumn(
	manifest: HtmlAssignmentManifest | null | undefined,
	students: readonly StudentWork[],
	blockId: string
): QaAnswer[] {
	if (!manifest) return [];
	const groups = htmlAnswerSheet(manifest, {}, {});
	const groupOf = groups.find((g) => g.cells.some((c) => c.blockId === blockId));
	if (!groupOf) return [];
	return students.map((s) => {
		const values = hxValuesFromResponses(manifest, s.responses);
		const images = hxImagesFromFiles(manifest, s.files);
		const group = htmlAnswerSheet(manifest, values, images).find(
			(g) => g.moduleId === groupOf.moduleId
		);
		const cell = group?.cells.find((c) => c.blockId === blockId) ?? null;
		return {
			email: s.email,
			displayName: s.displayName,
			active: s.active,
			text: cell ? cellText(cell) : null,
			image: cell?.image ? { name: cell.image.name, caption: cell.image.caption || null } : null,
			links: cell ? cellLinks(cell, groupOf.title) : []
		};
	});
}

/** How many of a column's students have answered: any text, or a photograph. */
export function htmlQaAnsweredCount(column: readonly QaAnswer[]): number {
	return column.filter((a) => (a.text !== null && a.text.trim() !== '') || a.image !== null).length;
}
