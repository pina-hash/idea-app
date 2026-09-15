import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { startTestDb, createUser, type TestDb, type SeededUser } from './harness';
import { diffTrees, stateAt, invertAction, applyAction } from '../../src/lib/ideacad/history';
import { createKernel } from '../../src/lib/ideacad/kernel/remus';
import {createSolidTransports} from '../../src/lib/ideacad/solid/transport';
import type {SolidSave,SolidDocument} from '../../src/lib/ideacad/solid/types';

const SQL = 'supabase/migrations/0216_ideacad_direct_documents.sql';
const KERNEL = 'remus-f7907f5-2.130.20';
const ROOT = process.cwd();
const schema = readFileSync(SQL, 'utf8');
const rulesSchema=schema;
const migrations = readdirSync(`${ROOT}/supabase/migrations`).filter(f => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0,4)) <= 215).sort();
let db: TestDb;
let owner: SeededUser, editor: SeededUser, viewer: SeededUser, stranger: SeededUser, teacher: SeededUser, otherTeacher: SeededUser;
let sectionA: string, sectionB: string, itemId: string;
let boxBytes: Uint8Array, boxHash: string;
let kernel: Awaited<ReturnType<typeof createKernel>>;
const measurements: Record<string, unknown> = {};

function clientFor(user:SeededUser,after?:(name:string,args:Record<string,unknown>,result:any)=>void){
	return {rpc:async(name:string,args:Record<string,unknown>={})=>{
		try{
			const keys=Object.keys(args),values=keys.map(k=>['p_actions','p_model','p_artifacts','p_limits'].includes(k)?JSON.stringify(args[k]):args[k]);
			const data=await call(user,`public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')})`,values);after?.(name,args,data);return {data,error:null};
		}catch(error){return {data:null,error:{message:(error as Error).message}};}
	}} as never;
}
function titleInput(document:SolidDocument,...titles:string[]):SolidSave{
	let before=document.snapshot.manifest;
	const actions=titles.map(title=>{const after={...before,title},action={id:randomUUID(),label:'Rename',before,after,createdAt:new Date().toISOString()};before=after;return action;});
	return {documentId:document.id,conceptId:document.conceptId,expectedRevision:document.revision,requestId:actions[0].id,title:before.title,snapshot:{manifest:before,artifacts:document.snapshot.artifacts},actions};
}

async function call(user: SeededUser, expression: string, params: unknown[] = []): Promise<any> {
	return db.asUser(user.id, async q => (await q(`select ${expression} as result`, params)).rows[0].result);
}
async function denied(user: SeededUser, expression: string, params: unknown[] = []): Promise<string> {
	try { await call(user, expression, params); return ''; } catch(error) { return (error as Error).message; }
}
const create = (user = owner, title = 'Scratch bracket') => call(user, 'public.ideacad_create_direct_document($1,$2)', [title,KERNEL]);
const open = (id: string, user = owner) => call(user, 'public.ideacad_open_direct_document($1::uuid)', [id]);
const blob = (bytes = boxBytes) => ({ hash: createHash('sha256').update(bytes).digest('hex'), data: Buffer.from(bytes).toString('base64') });
const body = () => ({ id: randomUUID(), name: 'Box', artifact: boxHash, materialId: null, role: 'part', topologyEpoch: randomUUID() });
const withBody = (opened: any) => ({ ...structuredClone(opened.concept.features), bodies: [body()] });

function saveArgs(opened: any, model: any, options: { id?: string; actions?: any[]; artifacts?: any[]; base?: number; label?: string } = {}) {
	return [opened.document.id, options.base ?? opened.concept.revision, options.id ?? randomUUID(), options.label ?? 'Shape',
		JSON.stringify(options.actions ?? diffTrees(opened.concept.features, model)), JSON.stringify(model), JSON.stringify(options.artifacts ?? [])];
}
const saveExpression = 'public.ideacad_save_direct_document($1::uuid,$2::integer,$3::uuid,$4,$5::jsonb,$6::jsonb,$7::jsonb)';
const save = (opened: any, model: any, options: Parameters<typeof saveArgs>[2] = {}, user = owner) => call(user, saveExpression, saveArgs(opened,model,options));
async function counts(id: string) {
	return (await db.sql(`select
		(select count(*)::int from public.ideacad_brep_artifacts where document_id=$1) as artifacts,
		(select count(*)::int from public.ideacad_history h join public.ideacad_concepts c on c.id=h.concept_id where c.document_id=$1) as history,
		(select revision from public.ideacad_concepts c join public.ideacad_documents d on d.active_concept_id=c.id where d.id=$1) as revision`,[id])).rows[0];
}

beforeAll(async () => {
	const started = performance.now();
	db = await startTestDb(['../../tests/db/full-chain-fixture-completion.sql',...migrations]);
	const applied:any=await db.sql(schema);
	const readiness=Array.isArray(applied)?applied.at(-1).rows:applied.rows;
	measurements.readiness=readiness;expect(readiness).toHaveLength(27);expect(readiness.every((r:any)=>r.ready)).toBe(true);
	measurements.migrationCount = migrations.length;
	measurements.schemaApplyMs = performance.now()-started;
	[owner,editor,viewer,stranger,teacher,otherTeacher] = await Promise.all([
		createUser(db,'audit.owner@boscotech.net','Owner'),
		createUser(db,'audit.editor@boscotech.net','Editor'),
		createUser(db,'audit.viewer@boscotech.net','Viewer'),
		createUser(db,'audit.stranger@boscotech.net','Stranger'),
		createUser(db,'audit.teacher@boscotech.edu','Teacher A'),
		createUser(db,'audit.other@boscotech.edu','Teacher B')
	]);
	const course = await call(teacher,"public.classroom_upsert_course('DRAUDIT','Direct Audit')");
	sectionA = (await call(teacher,'public.classroom_upsert_section($1::uuid,$2,null,$3)',[course.course_id,'A',teacher.email])).section_id;
	sectionB = (await call(otherTeacher,'public.classroom_upsert_section($1::uuid,$2,null,$3)',[course.course_id,'B',otherTeacher.email])).section_id;
	await call(teacher,'public.classroom_set_enrollment($1::uuid,$2,$3,true)',[sectionA,owner.email,'Owner']);
	itemId = (await call(teacher,"public.classroom_create_item('assignment',$1::uuid[],'Blade','Build it.',20,null,null,true,'[]'::jsonb,false)",[[sectionA]])).item_id;
	await call(teacher,"public.ideacad_set_editor($1::uuid,'blade',$2::jsonb)",[itemId,JSON.stringify({defaultFeatures:{legacy:true},rules:{maxDiameterIn:5}})]);
	await db.sql('insert into public.classroom_postings(item_id,section_id) values($1,$2)',[itemId,sectionB]);
	kernel = await createKernel(readFileSync(`${ROOT}/static/ideacad/kernels/remus-9307e73.wasm`));
	const box = kernel.makeBox(2,3,4);
	boxBytes = kernel.serializeSolids(new Uint32Array([box]));
	boxHash = createHash('sha256').update(boxBytes).digest('hex');
	measurements.brepBoxBytes = boxBytes.length;
	measurements.brepBoxVolume = kernel.volume(box,0.01);
});

describe('global numeric advisory rules, site-admin boundary',()=>{
	it('reads current defaults as signed-in student and rejects teacher/manager edits',async()=>{
		const current=await call(owner,'public.ideacad_advisory_rules()');expect(current.canEdit).toBe(false);expect(current.limits.minHexExtensionIn).toBe(.5);expect(current.limits.maxHexExtensionIn).toBeNull();
		for(const user of [owner,teacher,otherTeacher])expect(await denied(user,'public.ideacad_set_advisory_rules($1::bigint,$2::jsonb)',[current.revision,JSON.stringify(current.limits)])).toContain('site admin');
		await expect(db.asAnon(q=>q('select public.ideacad_advisory_rules()'))).rejects.toThrow('permission denied');
	});
	it('admits one concurrent admin CAS edit and preserves immutable prior revisions',async()=>{
		const admin=await createUser(db,'audit.admin@boscotech.net','Site admin');await db.sql('insert into public.app_admins(email) values($1)',[admin.email]);
		const current=await call(admin,'public.ideacad_advisory_rules()');expect(current.canEdit).toBe(true);
		const one={...current.limits,maxMassG:650},two={...current.limits,maxMassG:700};
		const replies=await Promise.all([one,two].map(limits=>call(admin,'public.ideacad_set_advisory_rules($1::bigint,$2::jsonb)',[current.revision,JSON.stringify(limits)])));
		expect(replies.filter(r=>r.ok)).toHaveLength(1);expect(replies.filter(r=>r.reason==='stale')).toHaveLength(1);
		const latest=await call(admin,'public.ideacad_advisory_rules()');expect(latest.revision).toBe(2);expect(replies.find(r=>r.ok).current.revision).toBe(2);
		const rows=(await db.sql('select revision,limits,changed_by from public.ideacad_rule_revisions order by revision')).rows;expect(rows).toHaveLength(2);expect(rows[0].limits).toEqual(current.limits);expect(rows[1].changed_by).toBe(admin.email);
		await expect(db.asUser(admin.id,q=>q('update public.ideacad_rule_revisions set limits=$1',[JSON.stringify(two)]))).rejects.toThrow('permission denied');
		for(const limits of [{...latest.limits,minMassG:1000,maxMassG:500},{...latest.limits,maxMassG:-1},{...latest.limits,maxMassG:'500'},{...latest.limits,bad:true}])expect(await denied(admin,'public.ideacad_set_advisory_rules($1::bigint,$2::jsonb)',[latest.revision,JSON.stringify(limits)])).toContain('finite');
		await db.sql(rulesSchema);expect((await call(admin,'public.ideacad_advisory_rules()')).revision).toBe(2);
		measurements.advisoryRules={revisions:2,teacherRejected:true,adminCAS:true};
	});
});

afterAll(async () => {
	kernel?.free();

	await db?.stop();
});

describe('standalone, private and immutable artifact persistence', () => {
	it('creates an empty manifest and one origin, without class or add-on',async()=>{
		const d = await create(editor,'Own idea');
		expect(d.document.item_id).toBeNull();
		expect(d.document.model_format).toBe('solid-v1');
		expect(d.concept.features).toEqual({format:'ideacad-solid-v1',kernel:KERNEL,units:'in',title:'Own idea',bodies:[],sketches:[],addons:{ideaBlade:false}});
		expect(d.role).toBe('owner'); expect(d.canWrite).toBe(true);
		expect(await counts(d.document.id)).toEqual({artifacts:0,history:1,revision:1});
	});
	it('allows teacher creation with no student enrollment',async()=>{
		const d = await create(otherTeacher); expect(d.document.student_email).toBe(otherTeacher.email); expect(d.canWrite).toBe(true);
	});
	it('refuses a guessed document, raw rows, history and artifact access from strangers',async()=>{
		const d=await create();
		expect(await denied(stranger,'public.ideacad_open_direct_document($1::uuid)',[d.document.id])).toContain('does not exist');
		expect(await denied(otherTeacher,'public.ideacad_open_direct_document($1::uuid)',[d.document.id])).toContain('does not exist');
		expect(await denied(stranger,'public.ideacad_read_brep_artifacts($1::uuid,$2::text[])',[d.document.id,[boxHash]])).toContain('does not exist');
		expect(await denied(stranger,'public.ideacad_direct_concept_history($1::uuid)',[d.concept.id])).toContain('does not exist');
		const rows=await db.asUser(stranger.id,q=>q('select id from public.ideacad_documents where id=$1',[d.document.id])); expect(rows.rows).toEqual([]);
	});
	it('round-trips actual serialized kernel BREP bytes, then deserializes to volume 24',async()=>{
		const d=await create(), model=withBody(d); const saved=await save(d,model,{artifacts:[blob()]});
		expect(saved.ok).toBe(true); expect(saved.concept.revision).toBe(2);
		const reopened=await open(d.document.id), bytes=Buffer.from(reopened.artifacts[0].data,'base64');
		expect(Buffer.compare(bytes,Buffer.from(boxBytes))).toBe(0);
		const roots=kernel.deserializeSolids(bytes); expect(roots.length).toBe(1); expect(kernel.validateSolid(roots[0])).toBe(0);
		expect(kernel.volume(roots[0],0.01)).toBeCloseTo(24,8);
		expect(reopened.concept.features).toEqual(model);
	});
	it('rejects direct table inserts/updates and anonymous RPC execution',async()=>{
		const d=await create();
		await expect(db.asUser(owner.id,q=>q('insert into public.ideacad_brep_artifacts(document_id,hash,kernel,bytes) values($1,$2,$3,$4)',[d.document.id,boxHash,KERNEL,boxBytes]))).rejects.toThrow('permission denied');
		await expect(db.asAnon(q=>q('select public.ideacad_direct_documents()'))).rejects.toThrow('permission denied');
		const privilege=(await db.sql("select has_function_privilege('anon','public.ideacad_save_direct_document(uuid,integer,uuid,text,jsonb,jsonb,jsonb)','execute') as anon,has_function_privilege('authenticated','public._ideacad_direct_can_write(uuid)','execute') as helper")).rows[0];
		expect(privilege).toEqual({anon:false,helper:false});
	});
	it('reuses one immutable artifact across subsequent saves',async()=>{
		const d=await create(), shaped=await save(d,withBody(d),{artifacts:[blob()]});
		const named={...shaped.concept.features,title:'Renamed'};
		const changed=await save(shaped,named,{artifacts:[blob()]});
		expect(changed.document.title).toBe('Renamed'); expect((await counts(d.document.id)).artifacts).toBe(1);
	});
});

describe('CAS, receipts, rollback and replay',()=>{
	it('admits exactly one of two simultaneous same-base saves',async()=>{
		const d=await create(); const results=await Promise.all([save(d,{...d.concept.features,title:'One'}),save(d,{...d.concept.features,title:'Two'})]);
		expect(results.filter(r=>r.ok)).toHaveLength(1); expect(results.filter(r=>!r.ok&&r.reason==='stale')).toHaveLength(1);
		expect(await counts(d.document.id)).toEqual({artifacts:0,history:2,revision:2});
	});
	it('rejects a revision leap and stores no rejected blob/history',async()=>{
		const d=await create(), result=await save(d,withBody(d),{base:999,artifacts:[blob()]});
		expect(result.ok).toBe(false); expect(result.reason).toBe('stale');
		expect(await counts(d.document.id)).toEqual({artifacts:0,history:1,revision:1});
	});
	it('retries the exact receipt idempotently and rejects reuse for a different edit',async()=>{
		const d=await create(), model=withBody(d), id=randomUUID(), options={id,artifacts:[blob()]};
		const first=await save(d,model,options), before=await counts(d.document.id), second=await save(d,model,options);
		expect(first.duplicate).toBe(false); expect(second.duplicate).toBe(true); expect(second.acceptedRevision).toBe(2);
		expect(await counts(d.document.id)).toEqual(before);
		expect(await denied(owner,saveExpression,saveArgs(d,{...model,title:'Different'},options))).toContain('already used');
	});
	it('returns acceptedRevision separately when another edit follows an uncertain save',async()=>{
		const d=await create(), m={...d.concept.features,title:'One'}, options={id:randomUUID()};
		const first=await save(d,m,options); await save(first,{...first.concept.features,title:'Two'});
		const retry=await save(d,m,options); expect(retry.acceptedRevision).toBe(2); expect(retry.concept.revision).toBe(3); expect(retry.document.title).toBe('Two');
	});
	it('rolls back wrong checksum, missing artifact and cross-document reference',async()=>{
		const d=await create(), m=withBody(d), before=await counts(d.document.id);
		expect(await denied(owner,saveExpression,saveArgs(d,m,{artifacts:[{...blob(),hash:'0'.repeat(64)}]}))).toContain('checksum');
		expect(await denied(owner,saveExpression,saveArgs(d,m))).toContain('missing BREP');
		const other=await create(); await save(other,withBody(other),{artifacts:[blob()]});
		expect(await denied(owner,saveExpression,saveArgs(d,m))).toContain('missing BREP');
		expect(await counts(d.document.id)).toEqual(before);
	});
	it('rolls back an inserted artifact when later action replay does not match',async()=>{
		const d=await create(), m=withBody(d), before=await counts(d.document.id);
		const wrong=[{kind:'set',path:'/title',before:d.concept.features.title,after:'Other'}];
		expect(await denied(owner,saveExpression,saveArgs(d,m,{artifacts:[blob()],actions:wrong}))).toContain('do not produce');
		expect(await counts(d.document.id)).toEqual(before);
	});
	it('rejects fabricated before-values and root replacements',async()=>{
		const d=await create(), m={...d.concept.features,title:'Other'}, before=await counts(d.document.id);
		expect(await denied(owner,saveExpression,saveArgs(d,m,{actions:[{kind:'set',path:'/title',before:'fake',after:'Other'}]}))).toContain('does not match');
		expect(await denied(owner,saveExpression,saveArgs(d,m,{actions:[{kind:'set',path:'',before:d.concept.features,after:m}]}))).toContain('Invalid IdeaCAD action');
		expect(await counts(d.document.id)).toEqual(before);
	});
	it('matches TypeScript pointer replay for insert/remove/move and escaped object keys',async()=>{
		const actions:any[]=[
			{kind:'insert',path:'/bodies/0',before:null,after:{id:'A'}},
			{kind:'insert',path:'/bodies/1',before:null,after:{id:'B'}},
			{kind:'move',path:'/bodies',before:0,after:1},
			{kind:'insert',path:'/meta/a~1b~0c',before:null,after:10},
			{kind:'set',path:'/meta/a~1b~0c',before:10,after:20},
			{kind:'remove',path:'/bodies/0',before:{id:'B'},after:null},
			{kind:'remove',path:'/meta/a~1b~0c',before:20,after:null}
		];
		let current:any={bodies:[],meta:{}};
		for(const action of actions){const actual=(await db.sql('select public._ideacad_direct_apply_action($1::jsonb,$2::jsonb) as result',[JSON.stringify(current),JSON.stringify(action)])).rows[0].result;current=applyAction(current,action);expect(actual).toEqual(current);}
		for(const action of [{kind:'move',path:'/bodies',before:0,after:2},{kind:'insert',path:'/missing/key',after:true},{kind:'set',path:'/meta/a~2b',before:1,after:2},{kind:'set',path:'/bodies/-1/id',before:'A',after:'B'},{kind:'remove',path:'/bodies/00',before:{id:'A'},after:null}])await expect(db.sql('select public._ideacad_direct_apply_action($1::jsonb,$2::jsonb)',[JSON.stringify(current),JSON.stringify(action)])).rejects.toThrow();
	});
	it('refuses unknown kernel, duplicate IDs and invalid body envelopes',async()=>{
		const d=await create(), b=body();
		for(const m of [{...d.concept.features,kernel:'future'},{...d.concept.features,bodies:[b,b]},{...d.concept.features,bodies:[{...b,topologyEpoch:'nope'}]},{...d.concept.features,bodies:[{...b,materialId:3}]}])expect(await denied(owner,saveExpression,saveArgs(d,m))).not.toBe('');
		expect(await counts(d.document.id)).toEqual({artifacts:0,history:1,revision:1});
	});
	it('preserves gesture grouping and attributed history through reload/undo/redo',async()=>{
		const d=await create(), m=withBody(d); m.title='With box'; const op=randomUUID();
		const first=await save(d,m,{id:op,label:'Make box',artifacts:[blob()]});
		const history=await call(owner,'public.ideacad_direct_concept_history($1::uuid)',[d.concept.id]);
		expect(stateAt(history.rows)).toEqual(m); const operation=history.rows.filter((r:any)=>r.operationId===op);
		expect(operation).toHaveLength(2); expect(operation.filter((r:any)=>r.operationStart)).toHaveLength(1); expect(operation[0].operationLabel).toBe('Make box');
		expect(operation.every((r:any)=>r.actor===owner.email)).toBe(true);
		const inverses=operation.toReversed().map((r:any)=>({...invertAction(r),undoesSeq:r.seq}));
		const undone=await save(first,d.concept.features,{label:'Undo make box',actions:inverses}); expect(undone.concept.features).toEqual(d.concept.features);
		const afterUndo=await call(owner,'public.ideacad_direct_concept_history($1::uuid)',[d.concept.id]);
		const undoRows=afterUndo.rows.filter((r:any)=>r.seq>first.lastSeq);
		const redone=await save(undone,m,{label:'Redo make box',actions:undoRows.toReversed().map((r:any)=>({...invertAction(r),undoesSeq:r.seq}))});
		expect(redone.concept.features).toEqual(m); expect((await counts(d.document.id)).artifacts).toBe(1);
	});
	it('can fetch more than one history page without losing grouped operations',async()=>{
		let d=await create(); for(let n=0;n<4;n++)d=await save(d,{...d.concept.features,title:`Page ${n}`});
		const page=await call(owner,'public.ideacad_direct_concept_history($1::uuid,$2,2)',[d.concept.id,1]);
		expect(page.rows.map((r:any)=>r.seq)).toEqual([0,2]); expect(page.newestSeq).toBe(4);
	});
	it('records combined geometry artifact and pointer-history storage growth',async()=>{
		let d=await create(), m=withBody(d);d=await save(d,m,{artifacts:[blob()]});
		for(let n=1;n<=25;n++){
			const solid=kernel.makeBox(2+n/10,3,4), bytes=kernel.serializeSolids(new Uint32Array([solid])), artifact=blob(bytes);
			m=structuredClone(d.concept.features);m.bodies[0].artifact=artifact.hash;m.bodies[0].topologyEpoch=randomUUID();
			d=await save(d,m,{artifacts:[artifact],label:'Resize box'});
		}
		measurements.storageCorpus={operations:26,...(await db.sql(`select
			(select count(*)::int from public.ideacad_brep_artifacts a where document_id=$1) as artifact_count,
			(select sum(octet_length(bytes))::int from public.ideacad_brep_artifacts a where document_id=$1) as artifact_logical_bytes,
			(select sum(pg_column_size(a))::int from public.ideacad_brep_artifacts a where document_id=$1) as artifact_row_bytes,
			(select count(*)::int from public.ideacad_history h where concept_id=$2 and kind<>'origin') as action_count,
			(select sum(pg_column_size(h))::int from public.ideacad_history h where concept_id=$2 and kind<>'origin') as action_row_bytes,
			(select sum(pg_column_size(h))::int from public.ideacad_history h where concept_id=$2 and kind='origin') as origin_row_bytes,
			(select sum(pg_column_size(before_value)+pg_column_size(after_value))::int from public.ideacad_history h where concept_id=$2 and kind<>'origin') as action_value_bytes
		`,[d.document.id,d.concept.id])).rows[0]};
		expect((await counts(d.document.id)).artifacts).toBe(26);
	});
});

describe('named sharing and captured instructor context',()=>{
	it('shares standalone outside enrollment as viewer/editor and revokes edits',async()=>{
		const d=await create();
		await call(owner,'public.ideacad_share_direct_document($1::uuid,$2,$3)',[d.document.id,viewer.email,'viewer']);
		await call(owner,'public.ideacad_share_direct_document($1::uuid,$2,$3)',[d.document.id,editor.email,'editor']);
		expect((await open(d.document.id,viewer)).canWrite).toBe(false);
		expect(await denied(viewer,saveExpression,saveArgs(d,{...d.concept.features,title:'Viewer'}))).toContain('cannot edit');
		const e=await open(d.document.id,editor), saved=await save(e,{...e.concept.features,title:'Collaborated'},{},editor); expect(saved.ok).toBe(true);
		await call(owner,'public.ideacad_unshare_document($1::uuid,$2)',[d.document.id,editor.email]);
		expect(await denied(editor,saveExpression,saveArgs(saved,{...saved.concept.features,title:'After revoke'}))).toContain('cannot edit');
		expect((await call(viewer,'public.ideacad_direct_documents()')).some((r:any)=>r.id===d.document.id)).toBe(true);
	});
	it('lets only owner grant and refuses unknown recipient',async()=>{
		const d=await create();
		await call(owner,'public.ideacad_share_direct_document($1::uuid,$2,$3)',[d.document.id,editor.email,'editor']);
		expect(await denied(editor,'public.ideacad_share_direct_document($1::uuid,$2,$3)',[d.document.id,viewer.email,'viewer'])).toContain('own document');
		expect(await denied(owner,'public.ideacad_share_direct_document($1::uuid,$2,$3)',[d.document.id,'missing@boscotech.net','viewer'])).toContain('signed in');
	});
	it('copies context without replacing geometry and grants only captured-section instructor',async()=>{
		const d=await create(), shaped=await save(d,withBody(d),{artifacts:[blob()]});
		const linked=await call(owner,'public.ideacad_link_direct_document($1::uuid,$2::uuid)',[d.document.id,itemId]);
		expect(linked.concept.features).toEqual(shaped.concept.features); expect(linked.document.assignment_context.config.rules.maxDiameterIn).toBe(5);
		expect(linked.document.assignment_context.sectionIds).toEqual([sectionA]);
		expect((await open(d.document.id,teacher)).canWrite).toBe(true);
		expect(await denied(otherTeacher,'public.ideacad_open_direct_document($1::uuid)',[d.document.id])).toContain('does not exist');
		const teacherOpen=await open(d.document.id,teacher); await save(teacherOpen,{...teacherOpen.concept.features,title:'Instructor edit'},{},teacher);
		await db.sql("update public.ideacad_editors set config = jsonb_set(config,'{rules,maxDiameterIn}','99'::jsonb) where item_id=$1",[itemId]);
		await db.sql("update public.classroom_items set title='Changed template' where id=$1",[itemId]);
		const again=await call(owner,'public.ideacad_link_direct_document($1::uuid,$2::uuid)',[d.document.id,itemId]);
		expect(again.document.assignment_context).toEqual(linked.document.assignment_context);
		await call(teacher,'public.classroom_set_enrollment($1::uuid,$2,$3,false)',[sectionA,owner.email,'Owner']);
		expect((await open(d.document.id,teacher)).canWrite).toBe(true);
		expect((await open(d.document.id)).document.archived_at).toBeNull();
		await call(teacher,'public.classroom_set_enrollment($1::uuid,$2,$3,true)',[sectionA,owner.email,'Owner']);
		measurements.linkedDocumentId=d.document.id;
	});
});

describe('archive and bypass closure',()=>{
	it('archives privately, refuses direct save, restores, and keeps bytes',async()=>{
		const d=await create(), saved=await save(d,withBody(d),{artifacts:[blob()]});
		const before=await counts(d.document.id);
		const archived=await call(owner,'public.ideacad_set_direct_document_archived($1::uuid,true)',[d.document.id]); expect(archived.canWrite).toBe(false);
		expect((await open(d.document.id)).artifacts).toHaveLength(1);
		expect(await denied(owner,saveExpression,saveArgs(saved,{...saved.concept.features,title:'Archived mutation'}))).toContain('cannot edit');
		await call(owner,'public.ideacad_set_direct_document_archived($1::uuid,false)',[d.document.id]);
		expect((await open(d.document.id)).canWrite).toBe(true); expect(await counts(d.document.id)).toEqual(before);
	});
	it('refuses every legacy concept and assembly writer against direct work',async()=>{
		const d=await create(); const partId=(await db.sql('select id from public.ideacad_parts where document_id=$1',[d.document.id])).rows[0].id;
		const attempts:[string,unknown[]][]=[
			['public.ideacad_save_concept($1::uuid,$2::jsonb,999)',[d.concept.id,JSON.stringify({legacyBypass:true})]],
			['public.ideacad_apply_actions($1::uuid,$2::jsonb,$3::jsonb,999)',[d.concept.id,'[]',JSON.stringify({legacyBypass:true})]],
			['public.ideacad_new_concept($1::uuid,$2,$3::jsonb)',[d.document.id,'Bypass','{}']],
			['public.ideacad_update_concept_meta($1::uuid,$2,1)',[d.concept.id,'Bypass']],
			['public.ideacad_set_active($1::uuid,$2::uuid)',[d.document.id,d.concept.id]],
			['public.ideacad_set_prediction($1::uuid,$2::uuid,$3)',[d.document.id,d.concept.id,'Bypass']],
			['public.ideacad_commit_concept($1::uuid)',[d.concept.id]],
			['public.ideacad_delete_concept($1::uuid)',[d.concept.id]],
			['public.ideacad_add_part($1::uuid,$2,$3::jsonb)',[d.document.id,'Bypass','{}']],
			['public.ideacad_update_part_meta($1::uuid,$2,1)',[partId,'Bypass']],
			['public.ideacad_new_part_concept($1::uuid,$2,$3::jsonb)',[partId,'Bypass','{}']],
			['public.ideacad_set_part_active($1::uuid,$2::uuid)',[partId,d.concept.id]],
			['public.ideacad_claim_part($1::uuid)',[partId]],
			['public.ideacad_assign_part($1::uuid,$2)',[partId,editor.email]]
		];
		const before=await counts(d.document.id), results=[];
		for(const [expression,args] of attempts){const response=await denied(owner,expression,args);results.push({expression,response});expect(response,expression).not.toBe('');}
		expect(await counts(d.document.id)).toEqual(before); measurements.legacyBypasses=results;
	});
	it('keeps direct linked work reachable, locks instructor archive, and rejects deletion cascade',async()=>{
		const id=measurements.linkedDocumentId as string;
		expect(await denied(owner,'public.ideacad_set_direct_document_archived($1::uuid,true)',[id])).toContain('does not exist');
		await call(teacher,'public.ideacad_set_direct_document_archived($1::uuid,true)',[id]);
		expect((await open(id,teacher)).canWrite).toBe(false);
		await expect(db.sql('delete from public.classroom_items where id=$1',[itemId])).rejects.toThrow('Archive the work');
		expect((await open(id,teacher)).document.id).toBe(id);
		await call(teacher,'public.ideacad_set_direct_document_archived($1::uuid,false)',[id]);
	});
	it('refuses heartbeat and release even if a legacy hold was seeded on direct work',async()=>{
		const d=await create(), p=(await db.sql('update public.ideacad_parts set held_by=$2,held_at=now(),hold_beat_at=now() where document_id=$1 returning id,hold_revision',[d.document.id,owner.email])).rows[0];
		for(const [expression,args]of [['public.ideacad_beat_part($1::uuid,$2::integer)',[p.id,p.hold_revision]],['public.ideacad_release_part($1::uuid)',[p.id]]] as [string,unknown[]][])expect(await denied(owner,expression,args)).toContain('do not use legacy part holds');
		expect((await db.sql('select held_by,hold_revision from public.ideacad_parts where id=$1',[p.id])).rows[0]).toEqual({held_by:owner.email,hold_revision:p.hold_revision});
	});
	it('keeps class shares viewer-only, checks live enrollment, clears grants on restore',async()=>{
		const id=measurements.linkedDocumentId as string;
		await call(teacher,'public.classroom_set_enrollment($1::uuid,$2,$3,true)',[sectionA,viewer.email,'Viewer']);
		expect(await denied(teacher,'public.ideacad_share_document_with_section($1::uuid,$2::uuid)',[id,sectionA])).toContain('Archive');
		await call(teacher,'public.ideacad_set_document_archived($1::uuid,true)',[id]);
		await call(teacher,'public.ideacad_share_document_with_section($1::uuid,$2::uuid)',[id,sectionA]);
		expect((await open(id,viewer)).role).toBe('viewer');expect((await open(id,viewer)).canWrite).toBe(false);
		await call(teacher,'public.classroom_set_enrollment($1::uuid,$2,$3,false)',[sectionA,viewer.email,'Viewer']);
		expect(await denied(viewer,'public.ideacad_open_direct_document($1::uuid)',[id])).toContain('does not exist');
		await call(teacher,'public.classroom_set_enrollment($1::uuid,$2,$3,true)',[sectionA,viewer.email,'Viewer']);
		await call(teacher,'public.ideacad_set_document_archived($1::uuid,false)',[id]);
		expect(await denied(viewer,'public.ideacad_open_direct_document($1::uuid)',[id])).toContain('does not exist');
		expect((await db.sql('select count(*)::int as n from public.ideacad_section_grants where document_id=$1',[id])).rows[0].n).toBe(0);
	});
	it('blocks live-posting manager shortcuts across legacy reads and archive RPCs',async()=>{
		const id=measurements.linkedDocumentId as string;
		await call(otherTeacher,'public.classroom_set_enrollment($1::uuid,$2,$3,true)',[sectionB,owner.email,'Owner']);
		await db.sql('delete from public.classroom_postings where item_id=$1 and section_id=$2',[itemId,sectionA]);
		try{
			for(const [expression,args]of [['public.ideacad_open_shared_document($1::uuid)',[id]],['public.ideacad_set_document_archived($1::uuid,true)',[id]],['public.ideacad_share_document_with_section($1::uuid,$2::uuid)',[id,sectionB]],['public.ideacad_unshare_document_from_section($1::uuid,$2::uuid)',[id,sectionB]]] as [string,unknown[]][])expect(await denied(otherTeacher,expression,args),expression).toContain('does not exist');
			expect((await call(otherTeacher,'public.ideacad_roster($1::uuid)',[itemId])).every((r:any)=>r.document===null||r.document.id!==id)).toBe(true);
			await call(teacher,'public.ideacad_set_direct_document_archived($1::uuid,true)',[id]);
			expect((await call(otherTeacher,'public.ideacad_archive($1::uuid)',[itemId])).some((r:any)=>r.documentId===id)).toBe(false);
			const oldOpen=await call(teacher,'public.ideacad_open_shared_document($1::uuid)',[id]);expect(oldOpen.config.rules.maxDiameterIn).toBe(5);expect(oldOpen.canWrite).toBe(false);
		}finally{
			await db.sql('insert into public.classroom_postings(item_id,section_id) values($1,$2)',[itemId,sectionA]);
			await call(teacher,'public.ideacad_set_direct_document_archived($1::uuid,false)',[id]);
		}
	});
	it('preserves legacy blade owner save, manager read-only, hold and archive behavior',async()=>{
		const legacyItem=(await call(teacher,"public.classroom_create_item('assignment',$1::uuid[],'Legacy','Build it.',20,null,null,true,'[]'::jsonb,false)",[[sectionA]])).item_id;
		await call(teacher,"public.ideacad_set_editor($1::uuid,'blade',$2::jsonb)",[legacyItem,JSON.stringify({defaultFeatures:{legacy:true},rules:{}})]);
		const d=await call(owner,'public.ideacad_open_document($1::uuid)',[legacyItem]);const concept=d.concepts[0];
		expect(d.document.model_format).toBe('blade-v1');
		await call(owner,'public.ideacad_save_concept($1::uuid,$2::jsonb,2)',[concept.id,JSON.stringify({legacy:'saved'})]);
		expect((await call(teacher,'public.ideacad_open_shared_document($1::uuid)',[d.document.id])).canWrite).toBe(false);
		expect(await denied(teacher,'public.ideacad_save_concept($1::uuid,$2::jsonb,3)',[concept.id,'{}'])).not.toBe('');
		const part=(await db.sql('select id from public.ideacad_parts where document_id=$1',[d.document.id])).rows[0];
		const claim=await call(owner,'public.ideacad_claim_part($1::uuid)',[part.id]);expect(claim.ok).toBe(true);
		expect((await call(owner,'public.ideacad_beat_part($1::uuid,$2::integer)',[part.id,claim.holdRevision])).ok).toBe(true);
		expect((await call(owner,'public.ideacad_release_part($1::uuid)',[part.id])).ok).toBe(true);
		await call(teacher,'public.ideacad_set_document_archived($1::uuid,true)',[d.document.id]);
		expect(await denied(owner,'public.ideacad_save_concept($1::uuid,$2::jsonb,3)',[concept.id,'{}'])).not.toBe('');
		expect((await call(teacher,'public.ideacad_archive($1::uuid)',[legacyItem])).some((r:any)=>r.documentId===d.document.id)).toBe(true);
	});
	it('uses captured manager for realtime, and refuses unshared viewer sends',async()=>{
		const d=await create(); await call(owner,'public.ideacad_share_direct_document($1::uuid,$2,$3)',[d.document.id,viewer.email,'viewer']);
		expect(await call(owner,'public._ideacad_realtime_can_send($1)',[`ideacad-doc:${d.document.id}`])).toBe(true);
		expect(await call(viewer,'public._ideacad_realtime_can_send($1)',[`ideacad-doc:${d.document.id}`])).toBe(false);
		expect(await call(teacher,'public._ideacad_realtime_can_send($1)',[`ideacad-doc:${measurements.linkedDocumentId}`])).toBe(true);
	});
	it('reapplies SQL without changing any direct model, artifact or history',async()=>{
		const before=(await db.sql("select (select count(*) from public.ideacad_brep_artifacts) as artifacts,(select count(*) from public.ideacad_history) as history,(select count(*) from public.ideacad_documents) as documents")).rows[0];
		await db.sql(schema);
		const after=(await db.sql("select (select count(*) from public.ideacad_brep_artifacts) as artifacts,(select count(*) from public.ideacad_history) as history,(select count(*) from public.ideacad_documents) as documents")).rows[0]; expect(after).toEqual(before);
	});
});


describe('unified migration mass provenance and grants',()=>{
	it('preserves measured/slicer mass and permits clearing an unknown mass',async()=>{
		for(const metadata of [{massG:12.5,massSource:'measured'},{massG:14,massSource:'bambu-studio'},{massG:null}]){
			const d=await create(),m=withBody(d);Object.assign(m.bodies[0],metadata);
			const saved=await save(d,m,{artifacts:[blob()]});expect(saved.ok).toBe(true);expect((await open(d.document.id)).concept.features.bodies[0]).toMatchObject(metadata);
		}
	});
	it('refuses negative/non-numeric mass and missing/null/invalid provenance',async()=>{
		for(const metadata of [{massG:-1,massSource:'measured'},{massG:'12.5',massSource:'measured'},{massG:12.5,massSource:'generic-density'},{massG:12.5,massSource:null},{massG:12.5},{massG:12.5,massSource:{kind:'measured'}}]){
			const d=await create(),m=withBody(d);Object.assign(m.bodies[0],metadata);const before=await counts(d.document.id);
			expect(await denied(owner,saveExpression,saveArgs(d,m,{artifacts:[blob()]})),JSON.stringify(metadata)).not.toBe('');
			expect(await counts(d.document.id)).toEqual(before);
		}
	});
	it('denies anon on every function defined or replaced by unified 0216',async()=>{
		const names=[...new Set([...schema.matchAll(/create or replace function public\.([a-z_]+)\s*\(/g)].map(m=>m[1]))];
		const rows=(await db.sql('select p.proname,p.oid::regprocedure::text as signature,has_function_privilege(\'anon\',p.oid,\'execute\') as anon,has_function_privilege(\'authenticated\',p.oid,\'execute\') as authenticated,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=\'public\' and p.proname=any($1::text[]) order by p.proname',[names])).rows;
		expect(rows.length).toBe(names.length);expect(rows.filter(r=>r.anon)).toEqual([]);expect(rows.every(r=>r.prosecdef&&r.proconfig?.includes('search_path=""'))).toBe(true);
		measurements.unifiedFunctionGrants=rows;
	});
});

describe('actual direct transport with real SQL receipts and authorizations',()=>{
	it('retries a partially acknowledged two-operation batch without duplicate revisions',async()=>{
		let lost=false,count=0;const tx=createSolidTransports(clientFor(owner,(name,_args,result)=>{if(name==='ideacad_save_direct_document'&&!result.duplicate&&++count===2&&!lost){lost=true;throw Error('Lost response after committed second operation');}})).transport;
		const d=await tx.create('Transport retry'),input=titleInput(d,'One','Two');
		await expect(tx.save(input)).rejects.toThrow('Lost response');
		const result=await tx.save(input);expect(result.revision).toBe(3);expect((await tx.open(d.id)).snapshot.manifest.title).toBe('Two');expect(await counts(d.id)).toEqual({artifacts:0,history:3,revision:3});
	});
	it('saves a queued gesture and its grouped undo, then reopens with durable redo',async()=>{
		const tx=createSolidTransports(clientFor(owner)).transport,d=await tx.create('Queued undo'),input=titleInput(d,'Changed');
		const a=input.actions[0],patches=diffTrees(a.before,a.after),inverse=patches.toReversed().map((r,i)=>({...invertAction(r),undoesSeq:patches.length-i}));
		input.actions.push({id:randomUUID(),label:'Undo rename',before:a.after,after:a.before,createdAt:new Date().toISOString(),changes:inverse});input.snapshot.manifest=a.before;
		expect((await tx.save(input)).revision).toBe(3);const reopened=await tx.open(d.id);expect(reopened.snapshot.manifest).toEqual(d.snapshot.manifest);
		const groups=await import('../../src/lib/ideacad/solid/history');expect(groups.foldGroups(groups.groupHistory(reopened.history!)).redoTarget?.depth).toBe(1);
	});
	it('routes named-share removal to the authorized revoke RPC',async()=>{
		const tx=createSolidTransports(clientFor(owner)),d=await tx.transport.create('Share revoke');await tx.share(d.id,viewer.email,'viewer');expect((await open(d.id,viewer)).role).toBe('viewer');await tx.share(d.id,viewer.email,'none');expect(await denied(viewer,'public.ideacad_open_direct_document($1::uuid)',[d.id])).toContain('does not exist');
	});
	it('keeps a conflict visible when an uncertain accepted operation has a newer remote edit',async()=>{
		let lost=false;const tx=createSolidTransports(clientFor(owner,(name,_args,result)=>{if(name==='ideacad_save_direct_document'&&!result.duplicate&&!lost){lost=true;throw Error('Lost response after accepted operation');}})).transport;
		const d=await tx.create('Concurrent'),input=titleInput(d,'Owner edit');await expect(tx.save(input)).rejects.toThrow('Lost response');
		await call(owner,'public.ideacad_share_direct_document($1::uuid,$2,$3)',[d.id,editor.email,'editor']);const other=createSolidTransports(clientFor(editor)).transport,otherOpen=await other.open(d.id);await other.save(titleInput(otherOpen,'Remote edit'));
		await expect(tx.save(input)).rejects.toThrow('changed in another');await expect(tx.save(input)).rejects.toThrow('changed in another');
		expect((await other.open(d.id)).snapshot.manifest.title).toBe('Remote edit');expect(await counts(d.id)).toEqual({artifacts:0,history:3,revision:3});
	});
});

describe('assignment visibility when linking a new direct document',()=>{
	async function hiddenAssignment(scheduled:boolean){
		const id=(await call(teacher,"public.classroom_create_item('assignment',$1::uuid[],'Hidden assessment','Hidden.',20,null,null,true,'[]'::jsonb,false)",[[sectionA]])).item_id;
		await call(teacher,"public.ideacad_set_editor($1::uuid,'blade',$2::jsonb)",[id,JSON.stringify({defaultFeatures:{secret:'unreleased'},rules:{maxMassG:111}})]);
		if(scheduled)await db.sql("update public.classroom_items set published=true,publish_at=now()+interval '1 day' where id=$1",[id]);
		else await db.sql('update public.classroom_items set published=false where id=$1',[id]);
		return id;
	}
	it('denies enrollment-only links to unpublished and future-scheduled assignments',async()=>{
		for(const scheduled of [false,true]){
			const id=await hiddenAssignment(scheduled),d=await create();
			expect(await call(owner,'public.classroom_can_read_item($1::uuid)',[id])).toBe(false);
			expect((await db.asUser(owner.id,q=>q('select id from public.classroom_items where id=$1',[id]))).rows).toEqual([]);
			expect(await denied(owner,'public.ideacad_link_direct_document($1::uuid,$2::uuid)',[d.document.id,id]),scheduled?'future schedule':'unpublished').not.toBe('');
			expect((await open(d.document.id)).document.item_id).toBeNull();
		}
	});
	it('allows an authorized section manager to link their own draft assignment',async()=>{
		const id=await hiddenAssignment(false),d=await create(teacher);const linked=await call(teacher,'public.ideacad_link_direct_document($1::uuid,$2::uuid)',[d.document.id,id]);expect(linked.document.item_id).toBe(id);expect(linked.document.assignment_context.config.defaultFeatures.secret).toBe('unreleased');
	});
});

describe('external sketch validation at the persistence boundary',()=>{
	const sketch=()=>({id:'profile',name:'Profile',plane:{origin:[0,0,0],u:[1,0,0],v:[0,1,0],normal:[0,0,1]},profile:{type:'circle',center:[0,0,0],radius:1}});
	it('rejects malformed and duplicate sketches atomically, including body/sketch ID collisions',async()=>{
		const d=await create(),before=await counts(d.document.id),base=d.concept.features;
		const bad=[{}, {...sketch(),profile:{type:'circle',center:[0,null,0],radius:1}}, {...sketch(),profile:{type:'circle',center:[0,0,0],radius:-1}}, {...sketch(),plane:{...sketch().plane,normal:[0,0,2]}}, {...sketch(),profile:{type:'circle',center:[0,0,1],radius:1}}, {...sketch(),profile:{type:'wire',segments:[{type:'line',start:[0,0,0],end:[1,0,0]},{type:'line',start:[1,0,0],end:[2,0,0]}]}}];
		for(const invalid of [...bad.map(s=>({...base,sketches:[s]})),{...base,sketches:[sketch(),sketch()]}]){
			expect(await denied(owner,saveExpression,saveArgs(d,invalid))).not.toBe('');expect(await counts(d.document.id)).toEqual(before);
		}
		const collision=withBody(d);collision.sketches=[{...sketch(),id:collision.bodies[0].id}];expect(await denied(owner,saveExpression,saveArgs(d,collision,{artifacts:[blob()]}))).toContain('unique');expect(await counts(d.document.id)).toEqual(before);
	});
	it('saves and reopens an arc with a circular hole using the same model validator',async()=>{
		const d=await create(),s={...sketch(),profile:{type:'wire',segments:[{type:'arc',start:[2,0,0],end:[-2,0,0],center:[0,0,0]},{type:'line',start:[-2,0,0],end:[2,0,0]}]},holes:[{type:'circle',center:[0,1,0],radius:.2}]},model={...d.concept.features,sketches:[s]};
		await save(d,model);expect((await open(d.document.id)).concept.features).toEqual(model);expect((await counts(d.document.id)).revision).toBe(2);
	});
});
