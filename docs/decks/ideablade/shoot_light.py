import http.server, threading, functools
from playwright.sync_api import sync_playwright
D='/home/claude/b5/deck'
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8769),functools.partial(http.server.SimpleHTTPRequestHandler,directory=D))
http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1920,'height':1080})
    pg.goto('http://127.0.0.1:8769/slides_light.html'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(500)
    pg.locator('#tpl').screenshot(path=D+'/tpl_light.png')
    b.close()
srv.shutdown()
