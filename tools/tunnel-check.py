"""Load the public tunnel URL and report transfer stats plus rendered state.

Production build only: one bundle, so request count and bytes are meaningful.
"""

import sys
import time

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
OUT = sys.argv[2] if len(sys.argv) > 2 else None

errors = []
requests = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True, args=["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"]
    )
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))

    def on_response(response):
        try:
            requests.append((response.url, response.status))
        except Exception:
            pass

    page.on("response", on_response)

    started = time.time()
    page.goto(URL, wait_until="load", timeout=120000)
    load_done = time.time()

    # The loader element is removed 700 ms after the first frame is ready.
    page.wait_for_function(
        "() => !document.getElementById('loader')", timeout=180000
    )
    ready = time.time()

    state = page.evaluate(
        """() => ({
            quality: document.getElementById('quality')?.textContent ?? '',
            clock: document.getElementById('clock')?.textContent ?? '',
            chips: document.querySelectorAll('.chip').length,
            canvas: (() => { const c = document.getElementById('scene'); return [c.width, c.height]; })(),
        })"""
    )

    if OUT:
        page.screenshot(path=OUT)

    browser.close()

assets = [r for r in requests if "/assets/" in r[0] or r[0].endswith(".jpg")]
print(f"html load      : {load_done - started:.2f}s")
print(f"fully ready    : {ready - started:.2f}s")
print(f"requests       : {len(requests)}  (assets+textures: {len(assets)})")
print(f"non-200        : {[r for r in requests if r[1] >= 400] or 'none'}")
print(f"quality        : {state['quality']}")
print(f"clock          : {state['clock']}")
print(f"chips          : {state['chips']}")
print(f"canvas         : {state['canvas']}")
print(f"page errors    : {errors or 'none'}")
