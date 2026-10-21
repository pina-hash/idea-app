import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { foundryCoverCsp } from '$lib/foundry/html-cover';
import type { RequestHandler } from './$types';

/**
 * A SAMPLE HTML COVER for the harness, served with the REAL cover policy
 * (`foundryCoverCsp`), standing in for `/c/<app id>`, which reads the database.
 * Animated, and it follows the pointer: the two things an HTML cover is for.
 */
const SAMPLE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:radial-gradient(circle at 30% 20%,#1c1f1d,#0c0e0d);overflow:hidden;font-family:system-ui,sans-serif}
canvas{display:block;width:100%;height:100%}
h1{position:absolute;left:8%;bottom:10%;margin:0;color:#ece8e0;font:700 9vw/1 system-ui;letter-spacing:.04em;text-shadow:0 2px 12px rgba(0,0,0,.6)}
</style></head><body><canvas id="c"></canvas><h1>BLADE RUN</h1><script>
const c=document.getElementById('c'),x=c.getContext('2d');let w,h,mx=.5,my=.5,t=0;
function size(){w=c.width=innerWidth*devicePixelRatio;h=c.height=innerHeight*devicePixelRatio}size();addEventListener('resize',size);
addEventListener('pointermove',e=>{mx=e.clientX/innerWidth;my=e.clientY/innerHeight});
function f(){t+=.016;x.clearRect(0,0,w,h);for(let i=0;i<14;i++){const a=t*.6+i*.45,r=(.18+.05*Math.sin(t+i))*Math.min(w,h);
x.beginPath();x.arc(w*mx+Math.cos(a)*r,h*my+Math.sin(a)*r,(3+i*.6)*devicePixelRatio,0,7);x.fillStyle=i%4?'rgba(234,230,216,.55)':'rgba(120,184,112,.95)';x.fill()}
requestAnimationFrame(f)}f();
</script></body></html>`;

export const GET: RequestHandler = () => {
	if (!dev) error(404, 'Not found');
	return new Response(SAMPLE, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'content-security-policy': foundryCoverCsp('', ''),
			'x-content-type-options': 'nosniff',
			'cache-control': 'no-store'
		}
	});
};
