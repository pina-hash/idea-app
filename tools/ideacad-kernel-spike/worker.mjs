const modulePromise = import(new URL(self.location.href).searchParams.get('kernel') === 'remus' ? './remus.mjs' : './kernel.mjs');
let spike;
self.onmessage = async ({data}) => {
	const {id,method,value}=data;
	try {
		if (!spike) spike=await (await modulePromise).KernelSpike.init();
		const result=spike[method](value);
		self.postMessage({id,result});
	} catch (error) { self.postMessage({id,error:error instanceof Error?error.message:String(error)}); }
};
