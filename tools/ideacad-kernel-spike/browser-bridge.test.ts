/** Development verification only. A loopback HTTP bridge into an isolated, real PostgreSQL fixture.
 * The browser uses the real IdeaCadApp, transports, loader and migrated SQL.
 * Only the HTTP/Auth boundary is replaced by fixed local fixture identities.
 */
import {afterAll,beforeAll,expect,it} from 'vitest';
import {createServer,type Server} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {startTestDb,createUser,type TestDb,type SeededUser} from '../../tests/db/harness';
import {createPostgrestShim,loadForeignKeys} from '../../tests/db/postgrest-shim';
import {load as chooserLoad} from '../../src/routes/ideacad/+page.server';

const OUT=resolve('.output/ideacad-browser');mkdirSync(OUT,{recursive:true});
const kernel='remus-f7907f5-2.130.20';
const token=randomBytes(24).toString('hex');
let db:TestDb,server:Server,port=0,finish:()=>void;
const finished=new Promise<void>(resolve=>finish=resolve);
const actors:Record<string,SeededUser>={};
const clients:Record<string,ReturnType<typeof createPostgrestShim>>={};
let itemId='',sectionId='';
let calls:Array<{actor:string;method:string;name?:string;error?:unknown}>=[];
const jsonbKeys=new Set(['p_actions','p_model','p_artifacts','p_limits','p_config','p_features']);

function clientFor(actor:string){
  const base=clients[actor];if(!base)throw Error('Unknown local fixture identity.');
  return {...base,rpc:(name:string,args?:Record<string,unknown>)=>base.rpc(name,
    Object.fromEntries(Object.entries(args??{}).map(([key,value])=>[key,jsonbKeys.has(key)?JSON.stringify(value):value])))};
}
async function rpc(actor:string,name:string,args?:Record<string,unknown>){
  const result=await clientFor(actor).rpc(name,args);
  calls.push({actor,method:'rpc',name,error:result.error});
  return result;
}
async function must(actor:string,name:string,args?:Record<string,unknown>){
  const result=await rpc(actor,name,args);if(result.error)throw Error(result.error.message);return result.data as any;
}
async function snapshot(actor:string){
  const user=actors[actor];if(!user)throw Error('Unknown local fixture identity.');
  const loaded=await chooserLoad({locals:{supabase:clientFor(actor),claims:{sub:user.id,email:user.email,role:'authenticated'}},parent:async()=>({userProfile:{preferences:{}}})} as any);
  return {...loaded,fixture:{actor,email:user.email,itemId,sectionId,identities:Object.entries(actors).map(([actor,user])=>({actor,...user}))}};
}
async function evidence(){
  return {port,database:db.databaseName,calls,
    documents:(await db.sql('select id,model_format,title,item_id,student_email,archived_at from public.ideacad_documents order by created_at')).rows,
    concepts:(await db.sql('select id,document_id,revision,features from public.ideacad_concepts order by created_at')).rows,
    history:(await db.sql('select concept_id,seq,kind,path,operation_id,operation_start,result_revision,undoes_seq from public.ideacad_history order by concept_id,seq')).rows,
    artifacts:(await db.sql('select document_id,hash,octet_length(bytes) as bytes from public.ideacad_brep_artifacts order by document_id,hash')).rows,
    rules:(await db.sql('select revision,limits,changed_by from public.ideacad_rule_revisions order by revision')).rows};
}

beforeAll(async()=>{
  const migrations=readdirSync(resolve('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  db=await startTestDb(['../../tests/db/full-chain-fixture-completion.sql',...migrations]);
  for(const [actor,email] of Object.entries({owner:'bridge.owner@boscotech.net',editor:'bridge.editor@boscotech.net',viewer:'bridge.viewer@boscotech.net',teacher:'bridge.teacher@boscotech.edu',stranger:'bridge.stranger@boscotech.net',admin:'bridge.admin@boscotech.net'})){
    actors[actor]=await createUser(db,email,`Bridge ${actor}`);
  }
  await db.sql('insert into public.app_admins(email) values($1)',[actors.admin.email]);
  const fks=await loadForeignKeys(db);
  for(const [actor,user]of Object.entries(actors))clients[actor]=createPostgrestShim(db,fks,user.id);
  const course=await must('teacher','classroom_upsert_course',{p_code:'CADBRIDGE',p_title:'Local IdeaCAD browser verification'});
  const section=await must('teacher','classroom_upsert_section',{p_course_id:course.course_id,p_label:'Bridge class',p_block:null,p_teacher_email:actors.teacher.email});sectionId=section.section_id;
  for(const actor of ['owner','editor','viewer'])await must('teacher','classroom_set_enrollment',{p_section_id:sectionId,p_student_email:actors[actor].email,p_display_name:`Bridge ${actor}`,p_active:true});
  // Named arguments above and below deliberately exercise the real PostgREST shape.
  const item=await db.asUser(actors.teacher.id,q=>q("select public.classroom_create_item('assignment',$1::uuid[],'Direct model assignment','Build any solid.',20,null,null,true,'[]'::jsonb,false) as result",[[sectionId]]));
  itemId=item.rows[0].result.item_id;
  await must('teacher','ideacad_set_editor',{p_item_id:itemId,p_editor:'blade',p_config:{defaultFeatures:{},rules:{maxDiameterIn:5}}});
  await must('owner','ideacad_create_direct_document',{p_title:'Owner private seed',p_kernel:kernel});
  await must('editor','ideacad_create_direct_document',{p_title:'Editor private seed',p_kernel:kernel});
  expect((await snapshot('owner')).directDocuments).toHaveLength(1);
  expect((await snapshot('stranger')).directDocuments).toHaveLength(0);
  expect((await snapshot('owner')).sources).toHaveLength(1);
  expect((await must('admin','ideacad_advisory_rules')).canEdit).toBe(true);
  expect((await must('teacher','ideacad_advisory_rules')).canEdit).toBe(false);
},180000);

afterAll(async()=>{
  if(db)writeFileSync(`${OUT}/browser-bridge-evidence.json`,JSON.stringify(await evidence(),null,2));
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  await db?.stop();
});

it('serves the real loader and database until the browser sends finish',async()=>{
  server=createServer(async(req,res)=>{
    const origin=req.headers.origin??'';
    if(origin&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)){res.writeHead(403);res.end();return;}
    res.setHeader('Access-Control-Allow-Origin',origin||'http://127.0.0.1');
    res.setHeader('Access-Control-Allow-Headers','content-type,x-ideacad-fixture');
    res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
    res.setHeader('Cache-Control','no-store');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if(req.method!=='POST'||req.headers['x-ideacad-fixture']!==token){res.writeHead(403);res.end();return;}
    try{
      const chunks:Buffer[]=[];let length=0;
      for await(const chunk of req){length+=chunk.length;if(length>30_000_000)throw Error('Fixture request too large');chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
      const actor=input.actor??'owner';if(!actors[actor])throw Error('Unknown local fixture identity.');
      let data:unknown;
      if(req.url==='/snapshot')data=await snapshot(actor);
      else if(req.url==='/rpc'){
        if(!/^ideacad_[a-z0-9_]+$/.test(input.name))throw Error('Only IdeaCAD public RPCs are exposed by this fixture.');
        data=await rpc(actor,input.name,input.args);
      }else if(req.url==='/select'){
        if(!['classroom_postings','profiles'].includes(input.table))throw Error('Unmodelled fixture select.');
        let query:any=clientFor(actor).from(input.table).select(input.select);
        for(const step of input.steps??[]){if(!['eq','in','is','order','limit','maybeSingle','single'].includes(step.method))throw Error('Unmodelled fixture query step.');query=query[step.method](...step.args);}
        data=await query;calls.push({actor,method:'select',name:input.table,error:(data as any).error});
      }else if(req.url==='/evidence')data=await evidence();
      else if(req.url==='/finish'){data={ok:true};finish();}
      else throw Error('Unknown fixture endpoint.');
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
    }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error instanceof Error?error.message:String(error)}));}
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
  const address=server.address();if(!address||typeof address==='string')throw Error('Missing bridge port');port=address.port;
  const info={endpoint:`http://127.0.0.1:${port}`,token,actors,itemId,sectionId};
  writeFileSync(`${OUT}/browser-bridge-info.json`,JSON.stringify(info,null,2));
  console.log(`LOCAL IDEACAD BRIDGE READY http://127.0.0.1:${port}; fixture connection details in ${OUT}/browser-bridge-info.json`);
  await finished;
},1800000);
