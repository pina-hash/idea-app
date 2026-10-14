import http.server, threading, functools
from playwright.sync_api import sync_playwright
import os; D=os.path.dirname(os.path.abspath(__file__))
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8767),functools.partial(http.server.SimpleHTTPRequestHandler,directory=D))
http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1400,'height':1400}); errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:8767/hero.html'); pg.wait_for_function('window.ready===true',timeout=60000)
    pg.evaluate("draw(0.4)"); pg.wait_for_timeout(300)
    pg.locator('#c').screenshot(path=D+'/hero.png', omit_background=True)
    print(errs[:5]); b.close()
srv.shutdown()
