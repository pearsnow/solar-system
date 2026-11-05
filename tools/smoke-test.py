#!/usr/bin/env python
"""Headless smoke test: open the app, collect console output, take a screenshot.

Requires Playwright (D:\\AgentVenv has it). Chromium in headless mode cannot get
a WebGPU adapter on this machine, so this always exercises the WebGL2 fallback —
use it to catch shader and JS errors, not to judge WebGPU performance.

    python tools/smoke-test.py "/?q=4k&look=jupiter&dist=6" shot.png 20000
"""

import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "/?q=2k"
SHOT = sys.argv[2] if len(sys.argv) > 2 else "smoke.png"
WAIT = int(sys.argv[3]) if len(sys.argv) > 3 else 15000
BASE = "http://localhost:5173"

logs, errors = [], []

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
    )
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

    target = URL if URL.startswith("http") else BASE + URL
    page.goto(target, wait_until="load", timeout=60000)
    page.wait_for_timeout(WAIT)

    state = page.evaluate(
        """() => {
            const c = document.getElementById('scene');
            const l = document.getElementById('loader');
            return {
                canvas: c ? [c.width, c.height] : null,
                loaderGone: !l || l.classList.contains('done'),
                loaderText: l ? (l.innerText || '') : '',
                quality: (document.getElementById('quality') || {}).textContent || '',
                clock: (document.getElementById('clock') || {}).textContent || '',
            };
        }"""
    )

    page.screenshot(path=SHOT)
    browser.close()

print("== STATE ==")
for k, v in state.items():
    print(f"  {k}: {v}")
print("== CONSOLE (last 12) ==")
for line in logs[-12:]:
    print("  " + line)
print("== PAGE ERRORS ==")
print("  none" if not errors else "\n".join("  " + e for e in errors))
