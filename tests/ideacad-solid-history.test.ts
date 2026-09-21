import {describe,it,expect} from 'vitest';
import {diffTrees,applyActions,foldHistory,invertAction,type IdeacadAction} from '../src/lib/ideacad/history';
import {readPinnedHistory,groupHistory,foldGroups,historyAtRevision,inverseOperation,type DirectRow,canonical} from '../src/lib/ideacad/solid/history';
import {upgradeManifest} from '../src/lib/ideacad/solid/features';
import {KERNEL_ID,type LegacyManifest} from '../src/lib/ideacad/solid/types';

function history(){
	let model:any={a:0,b:0,c:0};const rows:DirectRow[]=[{seq:0,kind:'origin',path:'',before:null,after:model}];let revision=1;
	function append(actions:(IdeacadAction&{undoesSeq?:number})[],label='Edit'){
		const id=crypto.randomUUID();revision++;
		actions.forEach((a,n)=>rows.push({...a,seq:rows.length,operationId:id,operationStart:n===0,resultRevision:n===0?revision:null,operationLabel:n===0?label:null}));
		model=applyActions(model,actions);return groupHistory(rows).at(-1)!;
	}
	return {rows,get model(){return model;},get revision(){return revision;},edit(after:any){return append(diffTrees(model,after));},inverse(target:ReturnType<typeof groupHistory>[number]){return append(inverseOperation(model,target).actions,'Undo or redo');}};
}

describe('an undo across the version 1 to 2 boundary',()=>{
	it('sends the tree its exact inverse rows produce, which is version 1, and never the engine\'s upgraded snapshot',()=>{
		/* Measured before the workspace kept a server-side tree of its own: the first edit of a stored version 1 document diffs v1 -> v2+edit (the upgrade rides along), so the undo's exact inverse lands the server on v1 while the engine, which upgrades on load, reports v2 -- and the save was refused with 'The history actions do not produce the saved model.' on every document saved before the feature graph. */
		const v1:LegacyManifest={format:'ideacad-solid-v1',kernel:KERNEL_ID,units:'in',title:'Old',bodies:[{id:'b-old',name:'Old box',artifact:'h',materialId:null,role:'part'}],sketches:[],addons:{ideaBlade:false}};
		const edited={...upgradeManifest(v1),title:'Renamed'};
		const rows:DirectRow[]=[{seq:0,kind:'origin',path:'',before:null,after:v1}];
		const id='op-1';diffTrees(v1,edited).forEach((a,n)=>rows.push({...a,seq:rows.length,operationId:id,operationStart:n===0,resultRevision:n===0?2:null,operationLabel:n===0?'Rename':null}));
		const target=groupHistory(rows).at(-1)!;
		expect(target.rows.map(r=>r.path)).toContain('/format');
		const inverse=inverseOperation(edited,target);
		/* What the server will hold after the inverse rows: exactly version 1. */
		expect(canonical(inverse.after)).toBe(canonical(v1));
		expect(canonical(applyActions(edited,inverse.actions))).toBe(canonical(v1));
		/* What the engine reports after loading it: version 2, which is NOT what the server holds, so p_model must be `inverse.after`. */
		expect(canonical(upgradeManifest(inverse.after as unknown as LegacyManifest))).not.toBe(canonical(inverse.after));
		/* And the inverse rows are the ones groupHistory accepts as an undo of that operation. */
		inverse.actions.forEach((a,n)=>rows.push({...a,seq:rows.length,operationId:'op-2',operationStart:n===0,resultRevision:n===0?3:null,operationLabel:n===0?'Undo':null}));
		expect(foldGroups(groupHistory(rows)).redoTarget?.id).toBe('op-2');
	});
});

describe('grouped durable history proof',()=>{
	it('inverts a multi-row gesture as one operation with exact descending target mappings',()=>{
		const h=history(),a=h.edit({a:1,b:2,c:0});expect(a.rows).toHaveLength(2);
		const inverse=inverseOperation(h.model,a);expect(inverse.actions.map(a=>a.undoesSeq)).toEqual([2,1]);expect(inverse.after).toEqual({a:0,b:0,c:0});
		const u=h.inverse(a);const reopened=historyAtRevision(h.rows,h.revision,h.model);expect(reopened.undoTarget).toBeNull();expect(reopened.redoTarget?.id).toBe(u.id);
		h.inverse(u);expect(historyAtRevision(h.rows,h.revision,h.model).undoTarget?.depth).toBe(2);expect(h.model).toEqual({a:1,b:2,c:0});
	});
	it('never resurrects an abandoned redo branch after nested undo/redo and reload',()=>{
		const h=history(),a=h.edit({a:1,b:0,c:0}),b=h.edit({a:1,b:1,c:0});
		h.inverse(b);const c=h.edit({a:1,b:0,c:1}),uc=h.inverse(c),ua=h.inverse(a);h.inverse(ua);h.inverse(uc);
		const reopened=historyAtRevision(h.rows,h.revision,h.model);expect(reopened.redoTarget).toBeNull();expect(reopened.undoTarget?.depth).toBe(2);expect(h.model).toEqual({a:1,b:0,c:1});
		// Counterexample: current row-level fold offers the abandoned B inverse.
		expect(foldHistory(h.rows).redoTarget?.seq).toBe(3);
	});
	it('pins one page head and deduplicates origin across pages split inside a gesture',async()=>{
		const h=history();h.edit({a:1,b:2,c:3});const expectedModel=structuredClone(h.model),atRevision=h.revision;let calls=0;
		const loaded=await readPinnedHistory(async(after,limit)=>{
			calls++;const response={rows:h.rows.filter(r=>r.seq===0||r.seq>after).slice(0,limit).map(r=>structuredClone(r)),newestSeq:h.rows.at(-1)!.seq,total:h.rows.length};
			if(calls===1)h.edit({a:9,b:9,c:9});return response;
		},2);
		expect(calls).toBe(3);expect(loaded.head).toBe(3);expect(loaded.rows.map(r=>r.seq)).toEqual([0,1,2,3]);expect(historyAtRevision(loaded.rows,atRevision,expectedModel).groups).toHaveLength(1);
	});
	it('matches an earlier opened model when the first history read already sees later saves',async()=>{
		const h=history();h.edit({a:1,b:0,c:0});const model=structuredClone(h.model),revision=h.revision;h.edit({a:1,b:1,c:0});
		const loaded=await readPinnedHistory(async(after,limit)=>({rows:h.rows.filter(r=>r.seq===0||r.seq>after).slice(0,limit),newestSeq:h.rows.at(-1)!.seq,total:h.rows.length}),2);
		const atOpen=historyAtRevision(loaded.rows,revision,model);expect(atOpen.groups).toHaveLength(1);expect(atOpen.lastSeq).toBe(1);
	});
	it('rejects missing rows, pagination stalls, partial inverse groups and replay mismatch',async()=>{
		const h=history(),a=h.edit({a:1,b:2,c:0});
		expect(()=>groupHistory([h.rows[0],h.rows[2]])).toThrow('missing row');
		await expect(readPinnedHistory(async()=>({rows:[h.rows[0]],newestSeq:2,total:3}),2)).rejects.toThrow('no progress');
		const bad=[...h.rows,{...invertAction(a.rows[1]),seq:3,undoesSeq:2,operationId:'partial',operationStart:true,resultRevision:3}];
		expect(()=>groupHistory(bad)).toThrow('whole operation');
		expect(()=>historyAtRevision(h.rows,h.revision,{a:9,b:9,c:9})).toThrow('does not match');
	});
	it('keeps a frozen operation identical after an uncertain send and later cache changes',async()=>{
		const receipts=new Map<string,{fingerprint:string;acceptedRevision:number}>();let revision=1;let loseAck=true;
		const ops=[{id:'A',expectedRevision:1,actions:['a'],model:{a:1},artifacts:['hash-a']},{id:'B',expectedRevision:2,actions:['b'],model:{a:1,b:1},artifacts:['hash-a','hash-b']}];
		async function send(op:typeof ops[number]){
			const fingerprint=canonical(op),receipt=receipts.get(op.id);
			if(receipt){expect(fingerprint).toBe(receipt.fingerprint);return {...receipt,currentRevision:revision,duplicate:true};}
			if(op.expectedRevision!==revision)throw Error('stale');
			receipts.set(op.id,{fingerprint,acceptedRevision:++revision});
			if(op.id==='B'&&loseAck){loseAck=false;throw Error('connection lost after commit');}
			return {acceptedRevision:revision,currentRevision:revision,duplicate:false};
		}
		await send(ops[0]);await expect(send(ops[1])).rejects.toThrow('after commit');
		const a=await send(ops[0]);expect(a.acceptedRevision).toBe(2);expect(a.currentRevision).toBe(3);
		// Use B's frozen base 2, not duplicate A's reported current revision 3.
		expect((await send(ops[1])).duplicate).toBe(true);expect(revision).toBe(3);expect(receipts.size).toBe(2);
	});
});
