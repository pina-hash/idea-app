/**
 * The Deno half of the HTML reader: deno-dom supplies the parser, the shared
 * factory supplies the walk, and `$lib/foundry/preflight` supplies every rule
 * applied to what comes out. The browser preflight builds the identical reader
 * from its own `DOMParser`.
 *
 * The WASM build specifically. The native build wants a dynamic library the
 * Edge Runtime does not provide, and the pages being parsed are a few hundred
 * kilobytes at most.
 */

import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';
import { makeDomHtmlReader } from '../../../src/lib/foundry/html-dom.ts';
import type { HtmlReader } from '../../../src/lib/foundry/preflight.ts';

export const readHtml: HtmlReader = makeDomHtmlReader(new DOMParser());
