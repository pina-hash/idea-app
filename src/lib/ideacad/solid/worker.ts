import { SolidEngine } from './engine';
import type { ModelSnapshot, SolidCommand } from './types';
let engine: SolidEngine;
let chain=Promise.resolve();
self.onmessage=({data})=>{
	chain=chain.then(async()=>{
		try{
			engine??=await SolidEngine.create(data.wasmUrl);
			let result;
			switch(data.method){
				case 'load': result=await engine.load(data.value as ModelSnapshot);break;
				case 'apply': result=await engine.apply(data.value as SolidCommand);break;
				case 'update': result=await engine.update(data.value as SolidCommand);break;
				case 'begin': result=await engine.begin();break;
				case 'commit': result=await engine.commit();break;
				case 'cancel': result=await engine.cancel();break;
				case 'undo': result=await engine.undo();break;
				case 'redo': result=await engine.redo();break;
				case 'snapshot': result=await engine.snapshot();break;
				case 'project': result=engine.project();break;
				case 'profile': result=engine.planarProfile(data.value);break;
				default: throw Error('Unknown geometry operation.');
			}
			self.postMessage({id:data.id,result});
		}catch(error){self.postMessage({id:data.id,error:error instanceof Error?error.message:String(error)});}
	});
};
