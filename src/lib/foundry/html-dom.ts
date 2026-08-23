/**
 * The HTML reader, built once against a DOM and handed its parser.
 *
 * WHY A FACTORY. The rule "a `src` or `href` may not name a scheme or start
 * with a forward slash" is in `./preflight.ts` and is shared. What is NOT
 * shared between the two runtimes is where a `DOMParser` comes from: a browser
 * has one, and Deno does not, so the ingest function supplies deno-dom's.
 * Passing the constructed parser in keeps that difference to a single argument
 * instead of two copies of the walk.
 *
 * A REAL PARSER RATHER THAN A REGEX, and that is a usability decision as much
 * as a correctness one. A regex over attributes trips on a `>` inside a quoted
 * value, on an attribute named `data-src`, on a stray angle bracket in prose --
 * and every one of those reads to a student as the platform rejecting their app
 * for no reason they can see. The parser resolves what an attribute actually is
 * before any rule is applied to it.
 */

import type { HtmlFacts, HtmlReader, HtmlRef } from './preflight.ts';

/**
 * The smallest surface both DOM implementations genuinely share. Typed
 * structurally on purpose: `deno-dom`'s `Element` and the browser's are
 * different types with the same shape, and naming either one here would tie
 * this module to that runtime.
 */
interface MinimalElement {
	readonly tagName: string;
	getAttribute(name: string): string | null;
	readonly textContent: string | null;
}

interface MinimalDocument {
	querySelectorAll(selectors: string): Iterable<MinimalElement>;
	querySelector(selectors: string): MinimalElement | null;
}

export interface MinimalDomParser {
	parseFromString(source: string, type: string): MinimalDocument | null;
}

/**
 * The attributes that cause a load or a navigation. Deliberately just these
 * two: `srcset`, `imagesrcset`, `poster` and the rest exist, but chasing them
 * is the "exotic syntax" this component is told to leave alone, and the CSP is
 * what actually contains anything missed here.
 */
const REF_ATTRS = ['src', 'href'] as const;

export function makeDomHtmlReader(parser: MinimalDomParser): HtmlReader {
	return (html: string): HtmlFacts => {
		const doc = parser.parseFromString(html, 'text/html');
		// A NULL DOCUMENT IS A FAILURE, NEVER AN EMPTY PAGE. deno-dom returns
		// null rather than throwing when its WASM parser is not ready, and
		// treating that as "a document with nothing in it" switches every HTML
		// rule off at once while reporting a clean pass -- which is exactly what
		// it did here on a cold start, until this line existed. Throwing hands
		// it to `scanHtml`, which reports it.
		if (!doc) throw new Error('The HTML parser returned no document.');

		const refs: HtmlRef[] = [];
		for (const el of doc.querySelectorAll('[src], [href]')) {
			const tag = (el.tagName ?? '').toLowerCase();
			for (const attr of REF_ATTRS) {
				const value = el.getAttribute(attr);
				if (value !== null) refs.push({ tag, attr, value });
			}
		}

		/*
		 * INLINE SCRIPTS, WITHOUT THE ONES CARRYING A `src`.
		 *
		 * A `<script src="...">` is already a reference and is judged as one
		 * above, by the same rule that judges a stylesheet or an image; its body
		 * is empty, so scanning it would find nothing and reporting it a second
		 * time would be worse than that.
		 *
		 * `textContent` on a `<script>` is the RAW text, not entity-decoded --
		 * script is a raw-text element in the HTML spec and both parsers honour
		 * that -- which is what lets `scanHtml` find it back in the source to
		 * work out which line it starts on.
		 */
		const inlineScripts: string[] = [];
		for (const el of doc.querySelectorAll('script')) {
			if (el.getAttribute('src') !== null) continue;
			const text = el.textContent ?? '';
			if (text.trim() !== '') inlineScripts.push(text);
		}

		const titleEl = doc.querySelector('title');
		return {
			refs,
			title: titleEl === null ? null : (titleEl.textContent ?? ''),
			inlineScripts
		};
	};
}
