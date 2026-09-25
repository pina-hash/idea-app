import type { SupabaseClient,RealtimeChannel } from '@supabase/supabase-js';
/** Broadcast frames are hints, never writes: nothing here can change a row, and every mutation goes through the 0201/0205 RPCs. Channels are PRIVATE as of 0211 -- realtime.messages RLS decides who may send and who may receive, so a frame can no longer be forged by an anon-key holder. The two filters below are kept anyway and are not redundant: the policy makes forgery impossible, `frameAllowed` and the 15 s reread keep the picture correct when the channel is fine and the data is stale. A REFUSED SUBSCRIPTION IS A SUPPORTED STATE -- it degrades to no live preview, never to a broken editor, a blocked save or a retry loop. */
export const IDEACAD_HEARTBEAT_MS=10_000, IDEACAD_ROSTER_POLL_MS=15_000, IDEACAD_FRAME_HZ=4, IDEACAD_FAST_FRAME_HZ=10;
export interface IdeacadPing{documentId:string;conceptId:string;revision:number} export interface IdeacadFrame extends IdeacadPing{features:unknown}
export function ideacadLiveChannelName(id:string){return`ideacad-live:${id}`} export function ideacadDocumentChannelName(id:string){return`ideacad-doc:${id}`}
export function frameAllowed(frame:IdeacadFrame,roster:Set<string>,lastRevision:number){return roster.has(frame.documentId)&&frame.revision>=lastRevision}
export function rosterIsLive(lastPing:number|undefined,now=Date.now()){return lastPing!==undefined&&now-lastPing<=20_000}
/** `refused` is terminal and is the whole degradation contract: the database declined this topic, so the channel is torn down, never reopened, and every send against it becomes a no-op. */
export type IdeacadLiveStatus='connecting'|'live'|'refused'
/** A Realtime subscribe status is terminal-refused when the join did not succeed. Authorization failure arrives as CHANNEL_ERROR; a join that never answered arrives as TIMED_OUT, and retrying either is the loop this exists to prevent. CLOSED is an ordinary teardown and is not a refusal. */
export function ideacadStatusFromSubscribe(status:string):IdeacadLiveStatus|null{return status==='SUBSCRIBED'?'live':status==='CHANNEL_ERROR'||status==='TIMED_OUT'?'refused':null}
export interface IdeacadLive{sendPing(itemId:string,p:IdeacadPing):void;subscribePings(itemId:string,fn:(p:IdeacadPing)=>void):()=>void;sendFrame(frame:IdeacadFrame):void;subscribeFrames(documentId:string,fn:(f:IdeacadFrame)=>void):()=>void;
	/** The topic's current state, or undefined if it was never opened. A caller reads this to decide whether to say live preview is unavailable.
	 *  OPTIONAL, and that is this codebase's own idiom rather than a concession: an omitted transport removes the control it drives, so an implementation that cannot report a status simply does not and every reader degrades to "cannot tell". Two in-tree stubs (tests/ideacad-store.test.ts, tests/db/ideacad-history-store.test.ts) implement this interface for other subsystems and neither has a channel to report on. */
	statusOf?(channelName:string):IdeacadLiveStatus|undefined;
	/** Every status transition, so a surface can degrade the moment a join is refused rather than on a timer. Returns its own unsubscribe. Optional for the same reason as statusOf. */
	onStatus?(fn:(channelName:string,status:IdeacadLiveStatus)=>void):()=>void;
	/** A DIRECT (solid-v1) document's save hint on its own `ideacad-doc:<id>` topic, event `ping` (feedback R34). It carries the two ids and the revision the sender's save reached, and NOTHING ELSE: the implementation projects exactly those three fields, so a caller cannot put a model on the wire by accident. A receiver treats it only as a reason to read the database sooner (`solid/live-sync.ts`). 0216 widened `_ideacad_realtime_can_send` to solid-v1 writers and receiving is `_ideacad_can_read_document`, so no policy changed. OPTIONAL for the same reason as statusOf: the in-tree stubs for other subsystems have no document to ping. */
	sendDocumentPing?(p:IdeacadPing):void;
	/** Subscribe to `sendDocumentPing` for one document. Returns its own unsubscribe, which stops delivery to this callback. */
	subscribeDocumentPings?(documentId:string,fn:(p:IdeacadPing)=>void):()=>void;
	destroy():void}
const pingOnly=(p:IdeacadPing):IdeacadPing=>({documentId:p.documentId,conceptId:p.conceptId,revision:p.revision});
export function createMemoryIdeacadLive():IdeacadLive{const pings=new Map<string,Set<(p:IdeacadPing)=>void>>(),frames=new Map<string,Set<(p:IdeacadFrame)=>void>>(),docPings=new Map<string,Set<(p:IdeacadPing)=>void>>(),status=new Map<string,IdeacadLiveStatus>(),watchers=new Set<(n:string,s:IdeacadLiveStatus)=>void>();const mark=(n:string,s:IdeacadLiveStatus)=>{status.set(n,s);for(const w of watchers)w(n,s)};return{sendPing:(id,p)=>{if(status.get(ideacadLiveChannelName(id))==='refused')return;pings.get(id)?.forEach(f=>f(p))},subscribePings(id,f){const s=pings.get(id)??new Set();s.add(f);pings.set(id,s);mark(ideacadLiveChannelName(id),'live');return()=>s.delete(f)},sendFrame:p=>{if(status.get(ideacadDocumentChannelName(p.documentId))==='refused')return;frames.get(p.documentId)?.forEach(f=>f(p))},subscribeFrames(id,f){const s=frames.get(id)??new Set();s.add(f);frames.set(id,s);mark(ideacadDocumentChannelName(id),'live');return()=>s.delete(f)},statusOf:n=>status.get(n),onStatus(f){watchers.add(f);return()=>watchers.delete(f)},
	/* A refused document topic stays refused here, as it does on the real client: subscribing again neither marks it live nor delivers to it. */
	sendDocumentPing:p=>{if(status.get(ideacadDocumentChannelName(p.documentId))==='refused')return;const payload=pingOnly(p);docPings.get(p.documentId)?.forEach(f=>f(payload))},subscribeDocumentPings(id,f){const n=ideacadDocumentChannelName(id);if(status.get(n)==='refused')return()=>{};const s=docPings.get(id)??new Set();s.add(f);docPings.set(id,s);mark(n,'live');return()=>{s.delete(f)}},
	/** Test seam: drive a topic into the refused state the policy produces, so the degraded path is exercisable without a database. */
	refuse(channelName:string){mark(channelName,'refused')},destroy(){pings.clear();frames.clear();docPings.clear();status.clear();watchers.clear()}}as IdeacadLive&{refuse(channelName:string):void}}
export function createIdeacadLive(supabase:SupabaseClient):IdeacadLive{
	const channels=new Map<string,RealtimeChannel>(),status=new Map<string,IdeacadLiveStatus>(),watchers=new Set<(n:string,s:IdeacadLiveStatus)=>void>();
	const mark=(name:string,s:IdeacadLiveStatus)=>{if(status.get(name)===s)return;status.set(name,s);for(const w of watchers)w(name,s)};
	/** Returns null once a topic has been refused, so every caller above is a no-op rather than a reconnect. Tearing the channel out of the client is what stops supabase-js's own rejoin timer from retrying a decision the database already made. */
	const channel=(name:string)=>{
		if(status.get(name)==='refused')return null;
		let c=channels.get(name);
		if(!c){
			// private: true is what makes Realtime consult the 0211 policies at all. Without it the topic is public and the policies are never read.
			c=supabase.channel(name,{config:{private:true,broadcast:{self:false,ack:false}}});
			channels.set(name,c);mark(name,'connecting');
			c.subscribe((s)=>{const next=ideacadStatusFromSubscribe(String(s));if(!next)return;if(next==='refused'){channels.delete(name);void supabase.removeChannel(c as RealtimeChannel)}mark(name,next)});
		}
		return c;
	};
	return{
		sendPing:(id,p)=>{void channel(ideacadLiveChannelName(id))?.send({type:'broadcast',event:'ping',payload:p})},
		subscribePings(id,fn){channel(ideacadLiveChannelName(id))?.on('broadcast',{event:'ping'},({payload})=>fn(payload as IdeacadPing));return()=>{}},
		sendFrame(p){void channel(ideacadDocumentChannelName(p.documentId))?.send({type:'broadcast',event:'frame',payload:p})},
		subscribeFrames(id,fn){channel(ideacadDocumentChannelName(id))?.on('broadcast',{event:'frame'},({payload})=>fn(payload as IdeacadFrame));return()=>{}},
		sendDocumentPing(p){void channel(ideacadDocumentChannelName(p.documentId))?.send({type:'broadcast',event:'ping',payload:pingOnly(p)})},
		/* Realtime has no public way to remove one binding, so the unsubscribe closes a gate in front of the callback instead; `destroy` removes the channel itself. */
		subscribeDocumentPings(id,fn){let on=true;channel(ideacadDocumentChannelName(id))?.on('broadcast',{event:'ping'},({payload})=>{if(on)fn(payload as IdeacadPing)});return()=>{on=false}},
		statusOf:n=>status.get(n),
		onStatus(fn){watchers.add(fn);return()=>watchers.delete(fn)},
		destroy(){for(const c of channels.values())void supabase.removeChannel(c);channels.clear();status.clear();watchers.clear()}
	};
}
export function createFrameCoalescer(send:(f:IdeacadFrame)=>void,hz=IDEACAD_FRAME_HZ){let pending:IdeacadFrame|null=null,timer:ReturnType<typeof setInterval>|null=null;return{queue(f:IdeacadFrame){pending=f;if(!timer)timer=setInterval(()=>{if(pending){send(pending);pending=null}},1000/hz)},flush(){if(pending){send(pending);pending=null}},stop(){if(timer)clearInterval(timer);timer=null}}}
