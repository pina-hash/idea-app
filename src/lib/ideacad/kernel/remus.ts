import * as bindings from './vendor/remus/remus_wasm_bg.js';
export type { BrepKernel } from './vendor/remus/remus_wasm_bg.js';

import {REMUS_WASM} from './version';
export {REMUS_ENCODING,REMUS_WASM} from './version';
let initialized: Promise<void> | undefined;
let memory: WebAssembly.Memory | undefined;

/** The pinned upstream bundler package, instantiated without a bundler WASM plugin. */
export async function createKernel(source: string | Uint8Array = REMUS_WASM) {
	initialized ??= (async () => {
		const imports = { './remus_wasm_bg.js': bindings };
		const result = typeof source === 'string'
			? await WebAssembly.instantiateStreaming(fetch(source), imports)
			: await WebAssembly.instantiate(source as Uint8Array<ArrayBuffer>, imports);
		(bindings as unknown as { __wbg_set_wasm: (exports: WebAssembly.Exports) => void }).__wbg_set_wasm(result.instance.exports);
		(result.instance.exports.__wbindgen_start as () => void)();
		memory = result.instance.exports.memory as WebAssembly.Memory;
	})();
	try { await initialized; } catch (error) { initialized = undefined; throw error; }
	return new bindings.BrepKernel();
}
/** The linear memory the kernel module currently holds, in bytes. A measurement for the replay-cost arithmetic, never a limit. */
export function kernelMemoryBytes(): number { return memory?.buffer.byteLength ?? 0; }
