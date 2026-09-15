import * as THREE from 'three';
const canvas=document.querySelector('canvas'),stage=document.querySelector('#stage');
const status=document.querySelector('#status'),volume=document.querySelector('#volume'),selectionText=document.querySelector('#selection');
const readout=document.querySelector('#readout'),field=document.querySelector('#value'),errorText=document.querySelector('#error');
const variant=new URL(location.href).searchParams.get('kernel')??'remus';
const worker=new Worker(`./worker.mjs?kernel=${variant}`,{type:'module'}),pending=new Map();
let sequence=0;
const request=(method,value)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,method,value});});
worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);};
worker.onerror=e=>{errorText.textContent=e.message;for(const p of pending.values())p.reject(Error(e.message));pending.clear();};
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#15191d');
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,3,-3,.001,10000);
camera.up.set(0,0,1);camera.position.set(8,-9,7);let target=new THREE.Vector3(2,1.5,.5);camera.lookAt(target);
scene.add(new THREE.HemisphereLight('#d9e8f2','#657279',2.2));
for(const [pos,intensity] of [[[5,-4,8],3], [[-4,-2,3],1.4], [[2,6,5],2.5]]) {const light=new THREE.DirectionalLight('#e4edf2',intensity);light.position.set(...pos);scene.add(light);}
const solids=new THREE.Group();scene.add(solids);const ray=new THREE.Raycaster();
const triad=new THREE.AxesHelper(.65);scene.add(triad);
let meshes=[],data,selected=null,drag=null,middle=null,queued=null,working=false,raf=0,firstPaint=null;
const frameCosts=[],intervals=[],operations=[];
let lastFrame=null;
function draw(){raf=0;const t=performance.now();renderer.render(scene,camera);frameCosts.push(performance.now()-t);if(firstPaint===null)firstPaint=performance.now();}
function invalidate(){if(!raf)raf=requestAnimationFrame(draw);}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);const halfY=3;camera.left=-halfY*w/h;camera.right=halfY*w/h;camera.top=halfY;camera.bottom=-halfY;camera.updateProjectionMatrix();invalidate();}
new ResizeObserver(resize).observe(stage);
function geometry(m){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.positions,3));g.setAttribute('normal',new THREE.BufferAttribute(m.normals,3));g.setIndex(new THREE.BufferAttribute(m.indices,1));return g;}
function display(result){
	data=result;
	for(const child of [...solids.children]) {solids.remove(child);child.geometry.dispose();child.material.dispose();}
	meshes=result.faces.map(f=>{
		const mesh=new THREE.Mesh(geometry(f),new THREE.MeshStandardMaterial({color:f.id===selected?'#72b592':'#91a2ad',metalness:.42,roughness:.38,side:THREE.DoubleSide}));mesh.userData=f;solids.add(mesh);return mesh;
	});
	const whole=geometry(result.mesh),edges=new THREE.EdgesGeometry(whole,25);whole.dispose();
	solids.add(new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:'#35434c'})));
	volume.textContent=`${result.volume.toFixed(4)} in³ · ${result.solids} solid`;
	status.textContent=`${variant.toUpperCase()} · ${result.mesh.triangleCount} triangles`;
	selectionText.textContent=selected??'';invalidate();
}
function point(e){const r=canvas.getBoundingClientRect();return new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);}
function hit(e){ray.setFromCamera(point(e),camera);return ray.intersectObjects(meshes,false)[0]??null;}
function onPlane(e,through=target){ray.setFromCamera(point(e),camera);return ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),through),new THREE.Vector3());}
function pick(id){selected=id;for(const m of meshes)m.material.color.set(m.userData.id===id?'#72b592':'#91a2ad');selectionText.textContent=id??'';invalidate();}
function fit(){const box=new THREE.Box3().setFromObject(solids),size=box.getSize(new THREE.Vector3());const next=box.getCenter(new THREE.Vector3());camera.position.add(next.clone().sub(target));target=next;camera.zoom=Math.min((camera.right-camera.left)/Math.max(size.x,size.y),(camera.top-camera.bottom)/Math.max(size.z,size.y))*.72;camera.updateProjectionMatrix();invalidate();}
async function reset(){errorText.textContent='';pick(null);display(await request('reset'));fit();}
async function pump(){
	if(working)return;working=true;
	try {while(queued!==null){const distance=queued;queued=null;const result=await request('push',distance);operations.push(result.operationMs);display(result);}}
	catch(e){errorText.textContent=e.message;queued=null;}
	finally{working=false;}
}
function setDistance(value){queued=value;readout.textContent=`${value.toFixed(3)} in`;pump();}
canvas.addEventListener('pointerdown',async e=>{
	canvas.focus();errorText.textContent='';
	if(e.button===1){e.preventDefault();if(e.ctrlKey&&e.altKey)return;const h=hit(e);middle={x:e.clientX,y:e.clientY,pivot:h?.point.clone()??onPlane(e),mode:e.ctrlKey?'pan':e.shiftKey?'zoom':e.altKey?'unbound':'orbit',source:h?'surface':'view-plane'};canvas.setPointerCapture(e.pointerId);return;}
	if(e.button!==0)return;const h=hit(e);if(!h){pick(null);return;}pick(h.object.userData.id);
	if(h.object.userData.kind!=='plane'){errorText.textContent='Planar-face spike';return;}
	drag={x:e.clientX,y:e.clientY,start:h.point.clone(),distance:0,ready:false};canvas.setPointerCapture(e.pointerId);
	try{const d=await request('begin',selected);if(drag){drag.ready=true;drag.normal=new THREE.Vector3(d.normal.x,d.normal.y,d.normal.z);}}
	catch(err){errorText.textContent=err.message;drag=null;}
});
canvas.addEventListener('pointermove',e=>{
	if(middle){e.preventDefault();const dx=e.clientX-middle.x,dy=e.clientY-middle.y;middle.x=e.clientX;middle.y=e.clientY;
		const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
		if(middle.mode==='orbit'){
			const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-dx/stage.clientWidth*Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(right,-dy/stage.clientWidth*Math.PI));
			camera.position.sub(middle.pivot).applyQuaternion(q).add(middle.pivot);camera.quaternion.premultiply(q);target.sub(middle.pivot).applyQuaternion(q).add(middle.pivot);
		}else if(middle.mode==='pan'){
			const d=right.multiplyScalar(-dx*(camera.right-camera.left)/stage.clientWidth/camera.zoom).add(up.multiplyScalar(dy*(camera.top-camera.bottom)/stage.clientHeight/camera.zoom));camera.position.add(d);target.add(d);
		}else if(middle.mode==='zoom')camera.zoom*=Math.exp(-dy/200);
		camera.updateProjectionMatrix();camera.updateMatrixWorld();invalidate();return;
	}
	if(drag?.ready){
		const a=drag.start.clone().project(camera),b=drag.start.clone().add(drag.normal).project(camera);
		const vx=(b.x-a.x)*stage.clientWidth/2,vy=-(b.y-a.y)*stage.clientHeight/2,length=vx*vx+vy*vy;
		drag.distance=length>4?((e.clientX-drag.x)*vx+(e.clientY-drag.y)*vy)/length:-(e.clientY-drag.y)*(camera.top-camera.bottom)/stage.clientHeight/camera.zoom;
		readout.style.display='block';readout.style.left=`${e.offsetX+16}px`;readout.style.top=`${e.offsetY+16}px`;setDistance(drag.distance);
		const t=performance.now();if(lastFrame)intervals.push(t-lastFrame);lastFrame=t;
	}
});
canvas.addEventListener('pointerup',e=>{middle=null;if(drag){if(drag.ready)setDistance(drag.distance);drag=null;}readout.style.display='none';if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
canvas.addEventListener('pointercancel',()=>{middle=null;drag=null;readout.style.display='none';});
canvas.addEventListener('wheel',e=>{e.preventDefault();const before=onPlane(e);camera.zoom*=Math.exp(-e.deltaY*.001);camera.updateProjectionMatrix();const after=onPlane(e);if(before&&after){const delta=before.sub(after);camera.position.add(delta);target.add(delta);}camera.updateMatrixWorld();invalidate();},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
canvas.addEventListener('keydown',e=>{if((/^[0-9.-]$/.test(e.key))&&selected){e.preventDefault();field.value=e.key;field.style.display='block';field.style.left='24px';field.style.top='24px';field.focus();}});
field.addEventListener('keydown',async e=>{if(e.key==='Enter'){const n=Number(field.value);if(Number.isFinite(n)){await request('begin',selected);setDistance(n);field.style.display='none';canvas.focus();}}else if(e.key==='Escape'){field.style.display='none';canvas.focus();}});
document.querySelector('#reset').addEventListener('click',reset);document.querySelector('#fit').addEventListener('click',fit);
// Dev-only measurement interface. It reads the real scene and worker results.
window.spike={
	get ready(){return !!data;}, get idle(){return !working&&queued===null;}, get report(){return {variant,coldMs:data?.coldMs,booleanMs:data?.booleanMs,firstPaint,frameCosts,intervals,operations,volume:data?.volume,valid:data?.valid,solids:data?.solids,selectionSurvived:data?.selectionSurvived,selected,renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER)};},
	facePoint(){const f=data.faces.find(f=>f.kind==='plane'&&f.normal.z>.99),r=canvas.getBoundingClientRect();const p=new THREE.Vector3(.75,.75,f.center.z).project(camera);return {x:r.left+(p.x+1)/2*r.width,y:r.top+(1-p.y)/2*r.height,id:f.id};},
	async checkDistance(distance){const f=data.faces.find(f=>f.kind==='plane'&&f.normal.z>.99);pick(f.id);await request('begin',f.id);const result=await request('push',distance);display(result);return result;},
	async brep(){return request('serialize');},
	async reset(){await reset();},
	painted(){draw();const gl=renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);let n=0;for(let i=0;i<p.length;i+=4)if(Math.abs(p[i]-p[0])+Math.abs(p[i+1]-p[1])+Math.abs(p[i+2]-p[2])>40)n++;return {fraction:n/(p.length/4),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};}
};
reset().catch(e=>errorText.textContent=e.message);
