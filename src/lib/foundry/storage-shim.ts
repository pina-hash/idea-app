/**
 * THE STORAGE SHIM, and why a bundle is dead on load without it.
 *
 * A document on an OPAQUE ORIGIN -- which is what `sandbox allow-scripts`
 * without `allow-same-origin` produces, and the whole reason the sandbox is
 * worth having -- has no storage area. `window.localStorage` is not undefined
 * there: the GETTER THROWS a `SecurityError`. So the first line of a generated
 * app that reads `localStorage.getItem('state')` throws before anything
 * renders, and the app is a blank frame with a console message no student will
 * ever see. That shape -- read saved state at the top of the script -- is the
 * single most common thing an AI tool writes.
 *
 * So the proxy defines both storages as in-memory objects before any student
 * code runs. The data does not survive a reload, which the build contract
 * already tells students, and it is per-frame, which is what a sandbox means.
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
 * IT IS INJECTED, NOT REWRITTEN IN. The proxy inserts this as the first
 * element inside `<head>` and touches nothing else in the document -- see
 * `$lib/server/foundry-serve`. Parse-and-reserialize would mangle bundles in
 * ways nobody asked for.
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
function install(name){
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
