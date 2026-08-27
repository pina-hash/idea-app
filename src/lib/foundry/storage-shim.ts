/**
 * THE STORAGE SHIM, and why a bundle is dead on load without it.
 *
 * A document on an OPAQUE ORIGIN -- which is what `sandbox allow-scripts`
 * without `allow-same-origin` produces -- has no storage area.
 * `window.localStorage` is not undefined there: the GETTER THROWS a
 * `SecurityError`. So the first line of a generated app that reads
 * `localStorage.getItem('state')` throws before anything renders, and the app
 * is a blank frame with a console message no student will ever see. That shape
 * -- read saved state at the top of the script -- is the single most common
 * thing an AI tool writes.
 *
 * IT INSTALLS ONLY WHEN REAL STORAGE IS UNAVAILABLE, AND THAT IS THE CHANGE.
 * It used to replace both storages UNCONDITIONALLY, which was right while every
 * bundle ran on an opaque origin and there was never anything to replace.
 * `foundrySandboxFlags` now grants `allow-same-origin` when the bundle origin
 * and the portal origin differ, so a served bundle usually HAS a real, durable
 * storage area -- and an unconditional shim would overwrite it with an
 * in-memory object, losing every save slot and every high score exactly as the
 * opaque origin did. The fix one file over would have bought nothing.
 *
 * SO EACH STORAGE IS PROBED BEFORE IT IS REPLACED: write a key, read it back,
 * remove it, all inside a try/catch. A throw -- the opaque-origin
 * `SecurityError`, a private-browsing quota refusal, a missing API -- installs
 * the in-memory replacement. A clean round trip leaves the real thing alone,
 * untouched, with the probe key removed. The probe is the whole of the
 * condition: there is no origin sniffing and no flag read, because what matters
 * is whether storage WORKS and not why it might not.
 *
 * When the replacement does go in, its data does not survive a reload, which
 * the build contract tells students, and it is per-document.
 *
 * IT IS A PROXY, NOT A PLAIN OBJECT WITH FIVE METHODS, because half of the
 * real Storage interface is the index properties: `localStorage.score = 5`,
 * `localStorage.score`, `delete localStorage.score`, `Object.keys(localStorage)`
 * and `'score' in localStorage` are all ordinary things to write and all of
 * them are silently wrong against a plain object with a `getItem` on it. The
 * trap here is that a plain-object shim FAILS QUIETLY: the assignment lands on
 * the object, the read comes back, and only `length`, `key()` and enumeration
 * disagree -- so a save/load feature half works.
 *
 * VALUES AND KEYS ARE STRINGIFIED, because that is what Storage does and
 * because the difference is visible: `setItem('n', 5)` then `getItem('n') === 5`
 * is false against a real Storage and must be false here too, or a student's
 * app behaves one way in the frame and another way anywhere else.
 *
 * THE INSTALL TRIES TWO PLACES. `localStorage` is an own accessor on the
 * window instance in some engines and an accessor on `Window.prototype` in
 * others, and only the first of those can be replaced by defining on `window`.
 * So: define on the instance, READ IT BACK to confirm the definition actually
 * took (a `defineProperty` that succeeds over a non-configurable accessor is
 * not a thing, but a `defineProperty` that succeeds and is then shadowed is),
 * and fall back to the prototype. Every step is inside a try/catch, because
 * the one outcome worse than no shim is a shim that throws at the top of the
 * head and takes the document with it.
 *
 * IT ARRIVES TWO WAYS, ON PURPOSE, AND IT IS ONE STRING.
 *
 * `injectShim` below puts it into every HTML response the serving routes send
 * -- the frame src and the direct page alike, through one shared responder --
 * as the first element inside `<head>`, touching nothing else
 * in the document -- parse-and-reserialize would mangle bundles in ways nobody
 * asked for. That rescues every app whose author never read the contract,
 * which is most of them, and every app already published.
 *
 * `foundryBuildContract()` ALSO EMBEDS IT, verbatim, for the student to paste.
 * That copy is not redundant: the contract tells a student to open
 * `index.html` off their own filesystem and check the app works before
 * uploading, and an app that behaves one way there and another way here is an
 * app they cannot debug. Running twice is harmless -- both run before any
 * student code, and the second replaces an empty store with an empty store.
 *
 * Two DELIVERIES, one SOURCE. There is exactly one copy of the shim text in
 * the repo and both sides read it from here.
 *
 * NOTE ON `instanceof Storage`: the shim is not a real `Storage`, so
 * `localStorage instanceof Storage` is false. Giving it the real prototype
 * would not help -- the native methods are bound to a native storage area and
 * throw on an opaque origin, which is the thing being worked around.
 */

/**
 * The shim's source, as it is injected. Written as ES5 with no arrow functions
 * and no `const`: it runs before anything else in the document, in whatever
 * browser a student has open, and it must never be the thing that fails.
 *
 * `Proxy` itself is ES6 and has no ES5 fallback, but it is in every browser
 * that has been shipped since 2016 and there is no way to implement index
 * properties without it. A browser without `Proxy` gets the plain object,
 * which is the degraded case rather than a throw.
 */
export const FOUNDRY_STORAGE_SHIM_JS = `(function(){
try{
var W=window;
function make(){
var d=Object.create(null);
var api={
getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null;},
setItem:function(k,v){d[String(k)]=String(v);},
removeItem:function(k){delete d[String(k)];},
clear:function(){d=Object.create(null);},
key:function(i){var ks=Object.keys(d);i=Math.floor(Number(i))||0;return i>=0&&i<ks.length?ks[i]:null;}
};
if(typeof Proxy!=='function'){try{Object.defineProperty(api,'length',{get:function(){return Object.keys(d).length;}});}catch(e){}return api;}
return new Proxy(api,{
get:function(t,p,r){
if(p==='length')return Object.keys(d).length;
if(typeof p!=='string')return Reflect.get(t,p,r);
if(Object.prototype.hasOwnProperty.call(t,p))return t[p];
return Object.prototype.hasOwnProperty.call(d,p)?d[p]:undefined;
},
set:function(t,p,v){
if(typeof p==='string'&&!Object.prototype.hasOwnProperty.call(t,p))d[p]=String(v);
return true;
},
has:function(t,p){
return (typeof p==='string'&&Object.prototype.hasOwnProperty.call(d,p))||p in t;
},
deleteProperty:function(t,p){if(typeof p==='string')delete d[p];return true;},
ownKeys:function(){return Object.keys(d);},
getOwnPropertyDescriptor:function(t,p){
if(typeof p==='string'&&Object.prototype.hasOwnProperty.call(d,p))
return {value:d[p],writable:true,enumerable:true,configurable:true};
return undefined;
}
});
}
function usable(name){
try{
var real=W[name];
if(!real)return false;
var pk='__fdy_probe__';
real.setItem(pk,'1');
var back=real.getItem(pk);
real.removeItem(pk);
return back==='1';
}catch(e){return false;}
}
function install(name){
if(usable(name))return true;
var s=make();
var desc={value:s,configurable:true,enumerable:true,writable:false};
try{Object.defineProperty(W,name,desc);if(W[name]===s)return true;}catch(e){}
try{Object.defineProperty(Window.prototype,name,desc);if(W[name]===s)return true;}catch(e){}
return false;
}
install('localStorage');
install('sessionStorage');
}catch(e){}
})();`;

/**
 * The whole element, exactly as it is inserted.
 *
 * NO `type` ATTRIBUTE and no `defer`: it has to run synchronously, before the
 * next byte of the document is parsed, or a `<script>` two lines further down
 * beats it.
 */
export const FOUNDRY_STORAGE_SHIM_TAG = `<script>${FOUNDRY_STORAGE_SHIM_JS}</script>`;

/**
 * THE DOCTYPE A DOCUMENT WITHOUT ONE IS GIVEN.
 *
 * A served HTML document with no doctype renders in QUIRKS MODE, which is a
 * different box model, a different `line-height` inheritance and a different
 * table-cell font resolution -- so a ported page laid out against standards
 * mode arrives visibly broken, in a way that reads as a bad upload rather than
 * a missing string. A single HTML file typed by hand or emitted by a tool that
 * assumed a wrapper is exactly the shape that lacks one, and it is a shape the
 * submit surface accepts first-class.
 *
 * It is `<!DOCTYPE html>` and nothing else: the doctype is not a version
 * declaration any more, it is a one-bit switch, and this is the spelling that
 * sets it.
 */
const FOUNDRY_DOCTYPE = '<!DOCTYPE html>';

/**
 * Whether the document already declares one.
 *
 * LEADING WHITESPACE AND A BOM ARE TOLERATED, because a browser tolerates them
 * -- a doctype after a blank line still switches the mode -- and prepending a
 * SECOND doctype to a document that has one is the one outcome worse than
 * leaving it alone.
 */
function hasDoctype(html: string): boolean {
	return /^[\s\uFEFF]*<!doctype/i.test(html);
}

/**
 * Insert the shim as the first element inside `<head>`, and a doctype at the
 * front of a document that has none.
 *
 * FAILING A `<head>`, the shim goes straight after `<html>` or the doctype, and
 * failing those, the very front of the document. A page with no `<head>` is
 * ORDINARY rather than exotic -- browsers synthesize one -- so those are the
 * common case for a hand-written file, not defensive padding.
 *
 * THE DOCTYPE GOES AT THE FRONT OF THE DOCUMENT, NOT BESIDE THE SHIM, and that
 * is forced rather than chosen: a doctype anywhere after the first element is
 * ignored, so putting it next to a shim that landed inside `<head>` would
 * change the bytes and fix nothing. In the fallback case -- no head, no html
 * tag -- the two land together anyway, because the shim is itself at the front.
 *
 * IT INSERTS AND DOES NOT REWRITE. Nothing in the document is modified,
 * reordered or reserialized; the original bytes survive contiguously with at
 * most two strings inserted in front of them. That property is load-bearing --
 * parse-and-reserialize would mangle bundles in ways nobody asked for -- and it
 * survives the doctype, which is one more insert.
 */
export function injectStorageShim(html: string): string {
	const withShim = insertShim(html);
	return hasDoctype(html) ? withShim : FOUNDRY_DOCTYPE + withShim;
}

function insertShim(html: string): string {
	const head = /<head\b[^>]*>/i.exec(html);
	if (head) {
		const at = head.index + head[0].length;
		return html.slice(0, at) + FOUNDRY_STORAGE_SHIM_TAG + html.slice(at);
	}

	const htmlTag = /<html\b[^>]*>/i.exec(html);
	if (htmlTag) {
		const at = htmlTag.index + htmlTag[0].length;
		return html.slice(0, at) + FOUNDRY_STORAGE_SHIM_TAG + html.slice(at);
	}

	const doctype = /^<!doctype[^>]*>/i.exec(html);
	if (doctype) {
		return html.slice(0, doctype[0].length) + FOUNDRY_STORAGE_SHIM_TAG + html.slice(doctype[0].length);
	}

	return FOUNDRY_STORAGE_SHIM_TAG + html;
}
