import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const spike=resolve(root,'tools/ideacad-kernel-spike');
const mounts={ '/remus/':resolve(root,'src/lib/ideacad/kernel/vendor/remus'), '/artifacts/':resolve(root,'static/ideacad/kernels'), '/kernel/':resolve(process.env.IDEACAD_OCCT_DIST??resolve(root,'.output/ideacad-kernel/node_modules/occt-wasm/dist')), '/three/':resolve(root,'node_modules/three/build'), '/fonts/':resolve(root,'node_modules/@fontsource'), '/':spike };
const server=createServer((req,res)=>{
	try {
		const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
		let file;
		if(pathname.startsWith('/fonts/')) {
			const name=pathname.slice(7),family=name.startsWith('rajdhani')?'rajdhani':'share-tech-mono';
			file=resolve(mounts['/fonts/'],family,'files',name);
			if(!file.startsWith(mounts['/fonts/']+sep)) throw Error('path');
		} else {
			const prefix=Object.keys(mounts).find(p=>pathname.startsWith(p));
			file=resolve(mounts[prefix],pathname.slice(prefix.length)||'index.html');
			if(!file.startsWith(mounts[prefix]+sep)) throw Error('path');
		}
		if(!existsSync(file)) {res.writeHead(404);return res.end();}
		const type=file.endsWith('.wasm')?'application/wasm':file.endsWith('.html')?'text/html':file.endsWith('.woff2')?'font/woff2':'text/javascript';
		res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(readFileSync(file));
	} catch {res.writeHead(400);res.end();}
});
server.listen(4178,'127.0.0.1',()=>process.stdout.write('IdeaCAD kernel spike: http://127.0.0.1:4178\n'));
