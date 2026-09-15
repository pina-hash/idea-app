import type { Sketch, SketchPlane, Vec3 } from './types';
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const scale = (a: Vec3, n: number): Vec3 => [a[0]*n,a[1]*n,a[2]*n];
export const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit = (a: Vec3): Vec3 => { const n=Math.hypot(...a); if(n<1e-12)throw Error('Choose a direction.'); return scale(a,1/n); };
export const vector = (value: ArrayLike<number>): Vec3 => [value[0],value[1],value[2]];
export const PLANES: Record<string, SketchPlane> = {
	XY:{origin:[0,0,0],u:[1,0,0],v:[0,1,0],normal:[0,0,1]},
	XZ:{origin:[0,0,0],u:[1,0,0],v:[0,0,1],normal:[0,-1,0]},
	YZ:{origin:[0,0,0],u:[0,1,0],v:[0,0,1],normal:[1,0,0]}
};
export function planeFor(origin: Vec3, normal: Vec3): SketchPlane {
	const n=unit(normal),u=unit(cross(Math.abs(n[2])<.9?[0,0,1]:[0,1,0],n));
	return {origin,u,v:cross(n,u),normal:n};
}
export const planePoint = (p: SketchPlane, x: number, y: number) => add(p.origin,add(scale(p.u,x),scale(p.v,y)));
export function orientedPolygon(points: Vec3[], normal: Vec3, hole=false): Vec3[] {
	let area: Vec3=[0,0,0];for(let i=0;i<points.length;i++)area=add(area,cross(points[i],points[(i+1)%points.length]));
	return dot(area,normal)*(hole?-1:1)<0?[...points].reverse():points;
}
export function sketchPolyline(sketch: Sketch, count=96): Vec3[] {
	const profile=sketch.profile;
	if(profile.type==='polygon')return [...profile.points,profile.points[0]];
	if(profile.type==='circle')return Array.from({length:count+1},(_,i)=>add(profile.center,add(scale(sketch.plane.u,profile.radius*Math.cos(i/count*Math.PI*2)),scale(sketch.plane.v,profile.radius*Math.sin(i/count*Math.PI*2)))));
	return profile.segments.flatMap(segment=>{
		if(segment.type==='line')return [segment.start,segment.end];
		const start=sub(segment.start,segment.center),end=sub(segment.end,segment.center),r=Math.hypot(...start),u=unit(start),v=cross(sketch.plane.normal,u);
		let angle=Math.atan2(dot(end,v),dot(end,u));if(angle<=0)angle+=Math.PI*2;
		return Array.from({length:33},(_,i)=>add(segment.center,add(scale(u,r*Math.cos(angle*i/32)),scale(v,r*Math.sin(angle*i/32)))));
	});
}
