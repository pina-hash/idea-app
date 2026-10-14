import http.server, threading, functools
from playwright.sync_api import sync_playwright
import os; D=os.path.dirname(os.path.abspath(__file__))
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8768),functools.partial(http.server.SimpleHTTPRequestHandler,directory=D))
http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1920,'height':1080}); errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('requestfailed',lambda r: errs.append('fail '+r.url))
    pg.goto('http://127.0.0.1:8768/slides.html'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(500)
    print('fonts', pg.evaluate("[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+f.weight)"))
    for sid in ['title','tpl']: pg.locator('#'+sid).screenshot(path=f'{D}/{sid}.png')
    pg.locator('#tag').screenshot(path=f'{D}/tag.png', omit_background=True)
    print(errs[:5]); b.close()
srv.shutdown()
