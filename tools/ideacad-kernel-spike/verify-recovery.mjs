import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const info=JSON.parse(readFileSync('.output/ideacad-browser/browser-bridge-info.json','utf8'));
const directory='.output/ideacad-browser/recovery';mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const pages=await Promise.all([browser.newPage(),browser.newPage()]);
const errors=[];for(const page of pages)page.on('pageerror',e=>errors.push(e.message));
const url=`http://127.0.0.1:5173/dev/ideacad-app?${new URLSearchParams({endpoint:info.endpoint,token:info.token,actor:'owner'})}`;
const rename=async(page,title)=>{const input=page.getByRole('textbox',{name:'Document name'});await input.click();await input.press('ControlOrMeta+A');await input.pressSequentially(title);await input.press('Tab');await page.waitForFunction(title=>window.ideaCadSolid.snapshot.manifest.title===title&&!window.ideaCadSolid.busy,title);};
try{
	for(const page of pages){await page.goto(url);await page.getByRole('button',{name:'Owner private seed 0 bodies',exact:true}).click();await page.waitForFunction(()=>window.ideaCadSolid&&!window.ideaCadSolid.busy);}
	await rename(pages[0],'Current saved model');await pages[0].getByRole('button',{name:'Documents',exact:true}).click();
	await rename(pages[1],'Unsaved conflicting model');await pages[1].getByRole('button',{name:'Documents',exact:true}).click();
	const recovery=pages[1].getByRole('complementary',{name:'Save recovery'});await recovery.waitFor();
	const measurements=[];
	for(const width of [1280,375]){
		await pages[1].setViewportSize({width,height:812});await pages[1].screenshot({path:`${directory}/${width}.png`});
		const m=await pages[1].evaluate(()=>{const header=document.querySelector('.solid-workspace>header'),save=document.querySelector('.document-save'),panel=document.querySelector('.recovery');return{width:innerWidth,header:header.getBoundingClientRect().toJSON(),headerHeight:header.clientHeight,headerScrollHeight:header.scrollHeight,save:save.getBoundingClientRect().toJSON(),panel:panel.getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth-innerWidth};});
		assert(m.headerScrollHeight<=m.headerHeight+2);assert(m.save.x>=0&&m.save.right<=width);assert(m.panel.x>=0&&m.panel.right<=width);assert.equal(m.overflow,0);measurements.push(m);
	}
	await recovery.getByRole('button',{name:'Reopen saved model',exact:true}).click();await recovery.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await pages[1].getByRole('textbox',{name:'Document name'}).inputValue(),'Unsaved conflicting model');
	await recovery.getByRole('button',{name:'Reopen saved model',exact:true}).click();await recovery.getByRole('button',{name:'Discard and reopen',exact:true}).click();await recovery.waitFor({state:'hidden'});assert.equal(await pages[1].getByRole('textbox',{name:'Document name'}).inputValue(),'Current saved model');
	await pages[1].getByRole('button',{name:'Undo',exact:true}).click();await pages[1].waitForFunction(()=>window.ideaCadSolid.snapshot.manifest.title==='Owner private seed'&&!window.ideaCadSolid.busy);await pages[1].getByRole('button',{name:'Documents',exact:true}).click();
	assert.deepEqual(errors,[]);writeFileSync(`${directory}/report.json`,JSON.stringify({measurements,errors,recovery:true},null,2));console.log('Recovery, undo and responsive header checks passed.');
}finally{
	await browser.close();await fetch(`${info.endpoint}/finish`,{method:'POST',headers:{'content-type':'application/json','x-ideacad-fixture':info.token},body:JSON.stringify({actor:'owner'})});
}
