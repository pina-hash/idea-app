/**
 * The Deno half of the HTML reader: deno-dom supplies the parser, the shared
 * factory supplies the walk, and `$lib/foundry/preflight` supplies every rule
 * applied to what comes out. The browser preflight builds the identical reader
 * from its own `DOMParser`.
 *
 * The WASM build specifically. The native build wants a dynamic library the
 * Edge Runtime does not provide, and the pages being parsed are a few hundred
 * kilobytes at most.
 *
 * THE PARSER IS INITIALIZED EXPLICITLY, AND THAT IS THE ROOT-CAUSE HALF OF A
 * REAL ESCAPE. deno-dom's WASM parser answers `parseFromString` with NULL until
 * its module is ready, and a cold Edge Function instance is exactly when it is
 * not. `html-dom.ts` turns that null into a throw and `scanHtml` now turns the
 * throw into a hard failure -- but a refusal a student did nothing to earn is a
 * bad outcome even when it is the safe one, so the parser is made ready here
 * rather than merely caught downstream.
 *
 * `deno-dom-wasm.ts` initializes itself with a top-level await; the `-noinit`
 * entry point exposes `initParser` so the wait is OURS and is guaranteed to
 * have finished before `readHtml` exists at all. Top-level await is a module
 * boundary in Deno, so nothing can import this and get an uninitialized parser.
 */

import {
	DOMParser,
	initParser
} from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm-noinit.ts';
import { makeDomHtmlReader } from '../../../src/lib/foundry/html-dom.ts';
import type { HtmlReader } from '../../../src/lib/foundry/preflight.ts';

await initParser();

export const readHtml: HtmlReader = makeDomHtmlReader(new DOMParser());
