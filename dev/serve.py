#!/usr/bin/env python3
"""Serves the project folder with Cache-Control: no-store. Open http://127.0.0.1:8765/preview to see the real
interface (renderer/index.html) with the fake backend of dev/mock-api.js, in a normal browser (layout only)."""
import http.server, sys, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()
    def do_GET(self):
        if self.path.split("?")[0] == "/preview":
            html = open(os.path.join(ROOT, "renderer", "index.html"), encoding="utf-8").read()
            html = html.replace('href="style.css"', 'href="/renderer/style.css"').replace('src="logo.svg"', 'src="/renderer/logo.svg"')
            html = html.replace('<script src="i18n.js">', '<script src="/dev/mock-api.js"></script><script src="/renderer/i18n.js">').replace('<script src="app.js">', '<script src="/renderer/app.js">')
            data = html.encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
        else:
            super().do_GET()
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
