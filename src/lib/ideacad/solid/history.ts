import {applyActions, invertAction, stateAt, type IdeacadAction, type IdeacadHistoryRow} from '../history';

export type DirectRow=IdeacadHistoryRow&{
	operationId?:string|null; operationStart?:boolean|null; operationLabel?:string|null; resultRevision?:number|null;
};
export interface HistoryPage {rows:DirectRow[];newestSeq:number;total:number}
export interface Operation {
	id:string;label:string;rows:DirectRow[];firstSeq:number;lastSeq:number;revision:number;
	targetId:string|null;depth:number;
}
export const canonical=(value:unknown):string=>JSON.stringify(value,(_key,x)=>
	x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const actionShape=(a:IdeacadAction)=>({kind:a.kind,path:a.path,before:a.before??null,after:a.after??null});

/** Pin the first page's committed head. Every page repeats origin, consuming a slot. */
export async function readPinnedHistory(fetchPage:(after:number,limit:number)=>Promise<HistoryPage>,limit=2000){
	const bySeq=new Map<number,DirectRow>();let cursor=-1,head:number|undefined;
	do{
		const page=await fetchPage(cursor,Math.max(2,limit));head??=page.newestSeq;
		if(!Number.isSafeInteger(head)||head<0)throw Error('Invalid history head.');
		let next=cursor;
		for(const row of page.rows){
			if(row.seq>head)continue;
			if(row.seq>next)next=row.seq;
			const prior=bySeq.get(row.seq);
			if(prior&&canonical(prior)!==canonical(row))throw Error('A stored history row changed.');
			bySeq.set(row.seq,row);
		}
		if(next===cursor&&cursor<head)throw Error('History pagination made no progress.');
		cursor=next;
	}while(cursor<head!);
	const rows=[...bySeq.values()].sort((a,b)=>a.seq-b.seq);
	if(rows.length!==head!+1||rows.some((r,i)=>r.seq!==i))throw Error('History has a missing row.');
	return {rows,head:head!};
}

/** Validate whole, contiguous committed operations; never infer undo from its label. */
export function groupHistory(rows:DirectRow[]):Operation[]{
	if(rows[0]?.seq!==0||rows[0]?.kind!=='origin')throw Error('History has no origin.');
	if(rows.some((r,i)=>r.seq!==i))throw Error('History has a missing row.');
	const groups:Operation[]=[],bySeq=new Map<number,Operation>(),ids=new Set<string>();
	for(let i=1;i<rows.length;){
		const first=rows[i];
		if(!first.operationId||first.operationStart!==true||ids.has(first.operationId)||first.resultRevision!==groups.length+2)throw Error('Invalid operation header.');
		const run:DirectRow[]=[first];let j=i+1;
		while(j<rows.length&&rows[j].operationId===first.operationId){
			if(rows[j].operationStart!==false||rows[j].resultRevision!=null)throw Error('Invalid operation continuation.');
			run.push(rows[j++]);
		}
		const targets=run.map(r=>r.undoesSeq??null);let target:Operation|undefined;
		if(targets.some(s=>s!==null)){
			if(targets.some(s=>s===null))throw Error('An operation mixes edits and inverses.');
			target=bySeq.get(targets[0]!);
			if(!target||run.length!==target.rows.length)throw Error('An inverse does not cover one whole operation.');
			for(let n=0;n<run.length;n++){
				const targetRow=target.rows[target.rows.length-1-n];
				if(run[n].undoesSeq!==targetRow.seq||canonical(actionShape(run[n]))!==canonical(actionShape(invertAction(targetRow))))throw Error('An inverse must reverse its target rows in reverse order.');
			}
		}
		const group:Operation={id:first.operationId,label:first.operationLabel??'Edit',rows:run,firstSeq:first.seq,lastSeq:run.at(-1)!.seq,revision:first.resultRevision,targetId:target?.id??null,depth:target?target.depth+1:0};
		groups.push(group);ids.add(group.id);for(const row of run)bySeq.set(row.seq,group);i=j;
	}
	return groups;
}

/** Chronological stack fold retains redo discard across any later inverse chain. */
export function foldGroups(groups:Operation[]){
	const undo:Operation[]=[],redo:Operation[]=[];
	for(const group of groups){
		if(group.targetId===null){undo.push(group);redo.length=0;continue;}
		for(const stack of [undo,redo]){const index=stack.findIndex(g=>g.id===group.targetId);if(index!==-1)stack.splice(index,1);}
		(group.depth%2===0?undo:redo).push(group);
	}
	return {undo,redo,undoTarget:undo.at(-1)??null,redoTarget:redo.at(-1)??null};
}

export function historyAtRevision<T>(rows:DirectRow[],revision:number,manifest:T){
	const all=groupHistory(rows),groups=all.filter(g=>g.revision<=revision);
	if(!Number.isSafeInteger(revision)||revision<1||(groups.at(-1)?.revision??1)!==revision)throw Error('History does not contain this model revision.');
	const lastSeq=groups.at(-1)?.lastSeq??0;
	if(canonical(stateAt(rows,lastSeq))!==canonical(manifest))throw Error('History replay does not match this saved model.');
	return {groups,lastSeq,...foldGroups(groups)};
}

export function inverseOperation<T>(current:T,target:Operation){
	const actions=[...target.rows].reverse().map(row=>({...invertAction(row),undoesSeq:row.seq}));
	return {actions,after:applyActions(current,actions)};
}
