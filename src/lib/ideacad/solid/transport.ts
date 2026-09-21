import type {SupabaseClient} from '@supabase/supabase-js';
import {diffTrees} from '../history';
import {canonical,historyAtRevision,readPinnedHistory} from './history';
import {emptyManifest,type GeometryArtifact,type SolidDocument,type SolidSave,type SolidTransport} from './types';
import type {AdvisoryLimits,AdvisoryRules,AdvisoryTransport} from './advisory';
import {normalizeDocument,normalizeFolder,normalizeTrashed,type LaunchDocument,type LaunchFolder,type TrashedDocument} from './launch/library';
import type {TrashReceipt} from './launch/api';
import {STORAGE_UNAVAILABLE} from './launch/wording';

/** One row of `ideacad_direct_documents`, normalised (`launch/library.ts`): 0217's fields are present on every deployment, defaulted to what is true before it is applied. */
export type DirectSummary=LaunchDocument;
export class SolidConflict extends Error {}
const bytes=(value:string)=>Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0));
const base64=(value:Uint8Array)=>{let text='';for(let i=0;i<value.length;i+=16384)text+=String.fromCharCode(...value.subarray(i,i+16384));return btoa(text);};
export function createSolidTransports(supabase:SupabaseClient){
	async function rpc(name:string,args?:Record<string,unknown>):Promise<any>{const {data,error}=await supabase.rpc(name,args);if(error)throw Error(error.message);if(data===null)throw Error('The server returned no document data.');return data;}
	/* THE STORAGE CALLS DEGRADE ON `PGRST202` ALONE (CLAUDE.md, RPC degradation): a function 0217 adds is absent on a
	   deployment sitting before it, and that is a deployment state to name in one sentence, never a crash. Any other
	   error is the function's own refusal and is shown verbatim where the student pressed. */
	async function storage(name:string,args?:Record<string,unknown>):Promise<any>{const {data,error}=await supabase.rpc(name,args);if(error)throw Error(error.code==='PGRST202'?STORAGE_UNAVAILABLE:error.message);return data;}
	const payloads=new Map<string,Record<string,unknown>>(),accepted=new Map<string,number>(),observed=new Map<string,number>();
	async function document(payload:any):Promise<SolidDocument>{
		const m=payload.concept?.features;if(!(m?.format==='ideacad-solid-v1'||m?.format==='ideacad-solid-v2')||m.kernel!==emptyManifest().kernel)throw Error('This document requires its original geometry reader.');
		const doc:SolidDocument={id:payload.document.id,title:m.title,conceptId:payload.concept.id,revision:payload.concept.revision,canWrite:payload.canWrite===true,owner:payload.document.student_email,archivedAt:payload.document.archived_at,deletedAt:payload.document.deleted_at??null,snapshot:{manifest:m,artifacts:[]}};
		const pinned=await readPinnedHistory((after,limit)=>rpc('ideacad_direct_concept_history',{p_concept_id:doc.conceptId,p_after_seq:after,p_limit:limit}));
		const validated=historyAtRevision(pinned.rows,doc.revision,m);doc.history=pinned.rows.filter(r=>r.seq<=validated.lastSeq);
		const hashes=new Set<string>();
		const collect=(v:unknown)=>{if(!v||typeof v!=='object')return;for(const [key,value]of Object.entries(v)){if(key==='artifact'&&typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))hashes.add(value);else collect(value);}};collect(m);collect(doc.history);
		const all=new Map<string,GeometryArtifact>();for(const a of payload.artifacts??[])all.set(a.hash,{hash:a.hash,bytes:bytes(a.data)});
		const missing=[...hashes].filter(h=>!all.has(h));for(let i=0;i<missing.length;i+=100){const data=await rpc('ideacad_read_brep_artifacts',{p_document_id:doc.id,p_hashes:missing.slice(i,i+100)});for(const a of data)all.set(a.hash,{hash:a.hash,bytes:bytes(a.data)});}
		if([...hashes].some(h=>!all.has(h)))throw Error('A saved body is missing. The document has not been changed.');
		for(const artifact of all.values()){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',artifact.bytes as Uint8Array<ArrayBuffer>))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==artifact.hash)throw Error('A saved body failed its integrity check.');}
		doc.snapshot.artifacts=[...all.values()];return doc;
	}
	const transport:SolidTransport={
		create:async(title)=>document(await rpc('ideacad_create_direct_document',{p_title:title,p_kernel:emptyManifest().kernel})),
		open:async(id)=>document(await rpc('ideacad_open_direct_document',{p_document_id:id})),
		save:async(input:SolidSave)=>{
			let revision=input.expectedRevision;
			for(const operation of input.actions){
				const receipt=accepted.get(operation.id);if(receipt!==undefined){revision=receipt;continue;}
				let payload=payloads.get(operation.id);
				if(!payload){
					const hashes=new Set(operation.after.bodies.map(b=>b.artifact));
					const artifacts=input.snapshot.artifacts.filter(a=>hashes.has(a.hash)).sort((a,b)=>a.hash.localeCompare(b.hash)).map(a=>({hash:a.hash,data:base64(a.bytes)}));
					payload=JSON.parse(JSON.stringify({p_document_id:input.documentId,p_expected_revision:revision,p_operation_id:operation.id,p_label:operation.label,p_actions:operation.changes??diffTrees(operation.before,operation.after),p_model:operation.after,p_artifacts:artifacts}));payloads.set(operation.id,payload!);
				}
				const result=await rpc('ideacad_save_direct_document',payload);
				if(!result.ok)throw new SolidConflict('This model changed in another session. Export a backup, then reopen it before continuing.');
				const target=Number(payload!.p_expected_revision)+1;
				if(result.acceptedRevision!==target)throw Error('The server returned an unexpected save revision.');
				if(!result.duplicate&&canonical(result.concept.features)!==canonical(operation.after))throw Error('The saved model did not match the submitted change.');
				accepted.set(operation.id,target);revision=target;
				observed.set(input.documentId,Math.max(observed.get(input.documentId)??0,result.concept.revision));
			}
			if((observed.get(input.documentId)??0)>revision)throw new SolidConflict('This model changed in another session. Export a backup, then reopen it before continuing.');
			return{revision};
		},
		thumbnail:async(documentId,dataUrl)=>{const {error}=await supabase.rpc('ideacad_set_direct_document_thumbnail',{p_document_id:documentId,p_thumbnail:dataUrl});if(error&&error.code!=='PGRST202')throw Error(error.message);}
	};
	const advisoryTransport:AdvisoryTransport={read:()=>rpc('ideacad_advisory_rules'),save:async(expectedRevision:number,limits:AdvisoryLimits):Promise<AdvisoryRules>=>{const result=await rpc('ideacad_set_advisory_rules',{p_expected_revision:expectedRevision,p_limits:limits});if(!result.ok)throw new SolidConflict('Another administrator changed these limits. Close and reopen settings to load the latest revision.');return result.current;}};
	return {transport,advisoryTransport,list:async():Promise<DirectSummary[]>=>((await rpc('ideacad_direct_documents')) as unknown[]).map(normalizeDocument),link:(id:string,itemId:string)=>rpc('ideacad_link_direct_document',{p_document_id:id,p_item_id:itemId}),share:(id:string,email:string,role:'viewer'|'editor'|'none')=>role==='none'?rpc('ideacad_unshare_document',{p_document_id:id,p_grantee_email:email}):rpc('ideacad_share_direct_document',{p_document_id:id,p_grantee_email:email,p_role:role}),archive:(id:string,archived:boolean)=>rpc('ideacad_set_direct_document_archived',{p_document_id:id,p_archived:archived}),
		classShare:(id:string,sectionId:string,remove=false)=>rpc(remove?'ideacad_unshare_direct_document_from_section':'ideacad_share_direct_document_with_section',{p_document_id:id,p_section_id:sectionId}),
		sections:async(itemId:string):Promise<{id:string;label:string}[]>=>{const {data,error}=await supabase.from('classroom_postings').select('section_id,classroom_sections!inner(id,label)').eq('item_id',itemId);if(error)throw Error(error.message);return(data??[]).map((r:any)=>({id:r.section_id,label:r.classroom_sections.label}));},
		/* 0217: the trash, folders, tags, rename and duplicate. Names and parameter spellings are the migration's own;
		   `tests/ideacad-solid-launch-transport.test.ts` reads them back off the migration file rather than off this module. */
		trash:(id:string):Promise<TrashReceipt>=>storage('ideacad_trash_direct_document',{p_document_id:id}),
		restore:(id:string)=>storage('ideacad_restore_direct_document',{p_document_id:id}),
		purge:(id:string)=>storage('ideacad_purge_direct_document',{p_document_id:id}),
		trashList:async():Promise<TrashedDocument[]>=>(((await storage('ideacad_direct_trash'))??[]) as unknown[]).map(normalizeTrashed),
		folders:async():Promise<LaunchFolder[]>=>(((await storage('ideacad_direct_folders'))??[]) as unknown[]).map(normalizeFolder),
		createFolder:async(name:string):Promise<LaunchFolder>=>normalizeFolder(await storage('ideacad_create_folder',{p_name:name})),
		renameFolder:async(id:string,name:string):Promise<LaunchFolder>=>normalizeFolder(await storage('ideacad_rename_folder',{p_folder_id:id,p_name:name})),
		deleteFolder:async(id:string):Promise<{movedOut:number}>=>{const r=await storage('ideacad_delete_folder',{p_folder_id:id});return{movedOut:Number(r?.movedOut??0)};},
		move:(id:string,folderId:string|null)=>storage('ideacad_move_direct_document',{p_document_id:id,p_folder_id:folderId}),
		tag:async(id:string,tags:string[]):Promise<{tags:string[]}>=>{const r=await storage('ideacad_tag_direct_document',{p_document_id:id,p_tags:tags});return{tags:Array.isArray(r?.tags)?r.tags:[]};},
		rename:(id:string,title:string)=>storage('ideacad_rename_direct_document',{p_document_id:id,p_title:title}),
		duplicate:async(id:string,title?:string):Promise<{id:string}>=>{const r=await storage('ideacad_duplicate_direct_document',{p_document_id:id,p_title:title??null});return{id:String(r?.document?.id??'')};}
	};
}
