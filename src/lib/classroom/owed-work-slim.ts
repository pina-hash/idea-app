/**
 * WHAT AN OWED-WORK SURFACE SHIPS OF AN ITEM, AND THAT IS NOT ITS BODY
 * (ledger 0360, report R08).
 *
 * `loadClassroomWork` reads every item in every class the caller takes, with
 * the item read's widest columns -- `body` and `body_doc` included, every
 * paragraph of every item. The home page and the to-do page then handed that
 * whole read to the browser, serialized into the page, although nothing on
 * either surface prints a word of a body: a row is a title, a due date, a
 * chip and at most a thumbnail. The ONE reader of a body on those surfaces is
 * `feedCover` in `$lib/classroom/feed`, and it reads only the first image
 * (`itemCoverImage(itemBodyDoc(item))`). So the shipped item keeps that image
 * and nothing else, and `feedCover` of the slim item is `feedCover` of the
 * full one in every case (`tests/home-classroom-load-budget.test.ts` holds
 * that over an image-first body, an image after paragraphs, no image, an SVG
 * and a row with no document).
 *
 * THE PRECEDENT is `readCheckIns` in `$lib/classroom/student-work.ts`, which
 * already strips a check-in's `guidance_doc` for the same reason: the guidance
 * is the class page's to render, and an owed-work list prints a label and a
 * date.
 *
 * WHY A FUNCTION THE ROUTE CALLS RATHER THAN A NARROWER SELECT. The item read
 * is one shared ladder (`selectItemsWithDoc`) that the class page, the item
 * page and these surfaces all call, and the class page DOES render bodies. A
 * second select string is a second ladder to keep in step with every migration
 * that widens it. The bytes still cross from the database to the server; what
 * this saves is the server-to-browser leg, which is the one a phone on school
 * wifi pays for, and the page's own serialize and hydrate.
 *
 * A FUTURE OWED-WORK SURFACE THAT WANTS AN ITEM'S TEXT READS THE ITEM ITSELF.
 * Nothing downstream of these two loads may assume `body` is the item's body:
 * it is the empty string on purpose.
 *
 * Pure, client-safe and free of the DOM.
 */
import { itemBodyDoc, itemCoverImage } from '$lib/classroom/classroom-doc';
import type { ClassroomItem } from '$lib/classroom/classroom';

export function slimOwedWorkItem(item: ClassroomItem): ClassroomItem {
	const cover = itemCoverImage(itemBodyDoc(item));
	return { ...item, body: '', body_doc: cover ? [cover] : null };
}
