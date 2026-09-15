/** Reusable CUA replay helpers distilled from the executed browser verification.
 * Call from cua_repl with its real tab/viewport handles; this does not launch an
 * alternate browser or invoke the application's debug mutation hooks.
 * Preconditions: scratch browser-bridge is running; a dev-gated fixture page is open.
 * This module was recorded after the interactive pass, not rerun as one monolithic test.
 */
const exact=(name)=>({name,exact:true});
const button=(tab,name)=>tab.playwright.getByRole('button',exact(name));
const escape=(value)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export async function nativeInput(tab,label,value){
  await tab.playwright.getByLabel(label,{exact:true}).click();
  await tab.pressKey('ctrl+a');await tab.typeText(value);await tab.pressKey('Tab');
}
export async function readyModel(tab){
  await tab.playwright.getByRole('region',exact('IdeaCAD modeler')).waitFor({state:'visible',timeoutMs:15000});
  await tab.playwright.getByText('Loading geometry…',{exact:true}).waitFor({state:'hidden',timeoutMs:20000});
}
export async function drawBox(tab,viewport,{title,width,height,from,to,depth}){
  await viewport.set({width,height});
  await tab.playwright.getByRole('button',{name:/^\+ New document/i}).click();await readyModel(tab);
  await button(tab,'Top view').click();await button(tab,'Rectangle').click();
  await tab.drag(from,to);await tab.pressKey('1');
  await tab.playwright.getByLabel('Exact value',{exact:true}).fill(String(depth));
  await button(tab,'Use exact value').click();await button(tab,'Isometric view').click();
  await tab.getAXState();await nativeInput(tab,'Document name',title);await button(tab,'Documents').click();
  await tab.playwright.getByRole('button',{name:new RegExp('^'+escape(title)+' 1 body(?: |$)')}).waitFor({state:'visible',timeoutMs:15000});
}
export async function reopen(tab,title,bodies=1){
  await tab.reload();
  const name=new RegExp('^'+escape(title)+' '+bodies+' bod'+(bodies===1?'y':'ies')+'(?: |$)');
  const row=tab.playwright.getByRole('button',{name});await row.waitFor({state:'visible',timeoutMs:15000});await row.click();await readyModel(tab);
}
export async function durableUndoRedo(tab,title){
  // The preceding drawBox sequence created sketch, extrusion, rename in that order.
  await reopen(tab,title);await button(tab,'Undo').click();await tab.getAXState();
  await button(tab,'Undo').click();await tab.getAXState();await button(tab,'Documents').click();
  await reopen(tab,'Untitled document',0);await button(tab,'Redo').click();await tab.getAXState();
  await button(tab,'Redo').click();await tab.getAXState();await button(tab,'Documents').click();
}
export async function share(tab,title,email,role){
  await button(tab,'Manage '+title).click();
  await tab.playwright.getByRole('textbox',exact('Share with')).fill(email);
  await tab.playwright.getByLabel('Shared permission',{exact:true}).selectOption(role);
  await button(tab,'Update sharing').click();await tab.getAXState();
}
export async function archive(tab,title,on){
  await button(tab,'Manage '+title).click();await button(tab,on?'Archive':'Restore').click();
  await button(tab,on?'Confirm archive':'Confirm restore').click();await tab.getAXState();
}
export async function actor(tab,baseUrl,name){
  const url=new URL(baseUrl);url.searchParams.set('actor',name);await tab.goto(url.href);
  await tab.playwright.getByRole('button',{name:/^\+ New document/i}).waitFor({state:'visible',timeoutMs:15000});
}
