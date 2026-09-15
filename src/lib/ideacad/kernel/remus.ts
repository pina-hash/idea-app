import * as bindings from './vendor/remus/remus_wasm_bg.js';
export type { BrepKernel } from './vendor/remus/remus_wasm_bg.js';

import {REMUS_WASM} from './version';
export {REMUS_ENCODING,REMUS_WASM} from './version';
let initialized: Promise<void> | undefined;

/** The pinned upstream bundler package, instantiated without a bundler WASM plugin. */
export async function createKernel(source: string | Uint8Array = REMUS_WASM) {
	initialized ??= (async () => {
		const imports = { './remus_wasm_bg.js': bindings };
		const result = typeof source === 'string'
			? await WebAssembly.instantiateStreaming(fetch(source), imports)
			: await WebAssembly.instantiate(source as Uint8Array<ArrayBuffer>, imports);
		(bindings as unknown as { __wbg_set_wasm: (exports: WebAssembly.Exports) => void }).__wbg_set_wasm(result.instance.exports);
		(result.instance.exports.__wbindgen_start as () => void)();
	})();
	try { await initialized; } catch (error) { initialized = undefined; throw error; }
	return new bindings.BrepKernel();
}
