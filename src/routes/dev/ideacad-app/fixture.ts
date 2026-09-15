/** Local browser verification against the ephemeral PostgreSQL fixture only. */
export function fixtureClient(endpoint:string,token:string,actor:string){
	const url=new URL(endpoint);
	if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('A loopback test database is required.');
	const post=async(path:string,input:Record<string,unknown>={})=>{
		const response=await fetch(`${url.origin}${path}`,{method:'POST',headers:{'content-type':'application/json','x-ideacad-fixture':token},body:JSON.stringify({...input,actor})});
		const value=await response.json();if(!response.ok)throw Error(value.error??'Local fixture request failed');return value;
	};
	return {snapshot:()=>post('/snapshot'),supabase:{
		rpc:(name:string,args?:Record<string,unknown>)=>post('/rpc',{name,args}),
		from:(table:string)=>({select:(select:string)=>{
			const steps:Array<{method:string;args:unknown[]}>=[];
			const query:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown,reject:(v:unknown)=>unknown)=>post('/select',{table,select,steps}).then(resolve,reject)};
			for(const method of ['eq','in','is','order','limit','maybeSingle','single'])query[method]=(...args:unknown[])=>{steps.push({method,args});return query;};
			return query;
		}})
	}};
}
