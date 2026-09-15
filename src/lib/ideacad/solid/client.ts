import { base } from '$app/paths';
import { REMUS_WASM } from '../kernel/version';
/** Svelte proxies cannot cross a structured-clone boundary. Preserve binary views. */
function plain(value:any):any {if(value===null||typeof value!=='object'||ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return value;if(Array.isArray(value))return value.map(plain);return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,plain(item)]));}
export class SolidClient {
	private worker = new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
	private sequence=0;
	private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
	constructor(){
		this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);};
		this.worker.onerror=()=>{for(const p of this.pending.values())p.reject(Error('The geometry worker stopped. Reload your last saved document.'));this.pending.clear();};
	}
	request<T>(method:string,value?:unknown):Promise<T>{return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,method,value:plain(value),wasmUrl:`${base}${REMUS_WASM}`});});}
	destroy(){this.worker.terminate();for(const p of this.pending.values())p.reject(Error('Document closed.'));this.pending.clear();}
}
