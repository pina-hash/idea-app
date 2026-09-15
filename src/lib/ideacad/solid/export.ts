import { zip } from '../export/three-mf';
import { sketchPolyline, dot, sub } from './math';
import type { ModelProjection, Sketch,ProfileCurve } from './types';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const mm=25.4;
/** Export topology is indexed and shared; rendering normals never alter it. */
export function solidThreeMf(model:ModelProjection,title:string):Uint8Array {
	if(!model.bodies.length)throw Error('Create a solid before exporting.');
	const objects=model.bodies.map((body,i)=>{
		const mesh=body.mesh,vertices:string[]=[],triangles:string[]=[];
		for(let p=0;p<mesh.positions.length;p+=3)vertices.push(`<vertex x="${mesh.positions[p]*mm}" y="${mesh.positions[p+1]*mm}" z="${mesh.positions[p+2]*mm}"/>`);
		for(let p=0;p<mesh.indices.length;p+=3)triangles.push(`<triangle v1="${mesh.indices[p]}" v2="${mesh.indices[p+1]}" v3="${mesh.indices[p+2]}"/>`);
		return `<object id="${i+1}" type="model" name="${escape(body.name)}"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object>`;
	});
	const xml=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${escape(title)}</metadata><resources>${objects.join('')}</resources><build>${model.bodies.map((_,i)=>`<item objectid="${i+1}"/>`).join('')}</build></model>`;
	return zip([
		{name:'[Content_Types].xml',bytes:new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')},
		{name:'_rels/.rels',bytes:new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')},
		{name:'3D/3dmodel.model',bytes:new TextEncoder().encode(xml)}
	]);
}
export function solidStl(model:ModelProjection):Uint8Array {
	const count=model.bodies.reduce((n,b)=>n+b.mesh.indices.length/3,0);if(!count)throw Error('Create a solid before exporting.');
	const buffer=new ArrayBuffer(84+count*50),view=new DataView(buffer);view.setUint32(80,count,true);let at=84;
	for(const body of model.bodies){const m=body.mesh;for(let i=0;i<m.indices.length;i+=3){const p=[0,1,2].map(j=>[0,1,2].map(d=>m.positions[m.indices[i+j]*3+d]*mm));const a=p[1].map((v,d)=>v-p[0][d]),b=p[2].map((v,d)=>v-p[0][d]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);for(const value of [...n.map(v=>v/length),...p.flat()]){view.setFloat32(at,value,true);at+=4;}at+=2;}}
	return new Uint8Array(buffer);
}
export function profileDxf(curves:ProfileCurve[]):string{
	const lines=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];
	for(const curve of curves){
		lines.push('0',curve.type.toUpperCase(),'100','AcDbEntity','8','0','100',curve.type==='line'?'AcDbLine':'AcDbCircle');
		if(curve.type==='line')lines.push('10',String(curve.start[0]*mm),'20',String(curve.start[1]*mm),'30','0','11',String(curve.end[0]*mm),'21',String(curve.end[1]*mm),'31','0');
		else{lines.push('10',String(curve.center[0]*mm),'20',String(curve.center[1]*mm),'30','0','40',String(curve.radius*mm));if(curve.type==='arc')lines.push('100','AcDbArc','50',String(curve.startAngle),'51',String(curve.endAngle));}
	}
	lines.push('0','ENDSEC','0','EOF');return lines.join('\n');
}
export function sketchDxf(sketch:Sketch):string {
	const curves:ProfileCurve[]=[],local=(p:[number,number,number]):[number,number]=>{const d=sub(p,sketch.plane.origin);return[dot(d,sketch.plane.u),dot(d,sketch.plane.v)];};
	for(const profile of [sketch.profile,...sketch.holes??[]]){
		if(profile.type==='circle')curves.push({type:'circle',center:local(profile.center),radius:profile.radius});
		else if(profile.type==='polygon')profile.points.forEach((p,i)=>curves.push({type:'line',start:local(p),end:local(profile.points[(i+1)%profile.points.length])}));
		else for(const segment of profile.segments){if(segment.type==='line')curves.push({type:'line',start:local(segment.start),end:local(segment.end)});else{const center=local(segment.center),start=local(segment.start),end=local(segment.end),angle=(p:[number,number])=>(Math.atan2(p[1]-center[1],p[0]-center[0])*180/Math.PI+360)%360;curves.push({type:'arc',center,radius:Math.hypot(start[0]-center[0],start[1]-center[1]),startAngle:angle(start),endAngle:angle(end)});}}
	}
	return profileDxf(curves);
}
export function download(data:Uint8Array|string,name:string,type:string){const blob=new Blob([typeof data==='string'?data:data as Uint8Array<ArrayBuffer>],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
