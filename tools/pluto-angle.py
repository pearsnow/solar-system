"""Where is the camera looking on Pluto's surface, in the shader's own frame?

The heart is centred at longitude 200°, latitude 12.5° in `planet.js`. This prints
the sub-camera point so we know whether the heart is facing us or is on the far side.
"""

import sys

from playwright.sync_api import sync_playwright

JS = """
() => {
  const s = window.__solar;
  const entry = s.focusables.find((f) => f.id === 'pluto');
  const globe = entry.planet.globe;
  const cam = s.root.parent ? null : null;
  // Camera is not stored on the system; take it from the renderer's last frame.
  const camera = window.__camera;
  const p = new THREE.Vector3();
  globe.getWorldPosition(p);
  const local = camera.position.clone().sub(p);
  globe.worldToLocal(local);
  local.normalize();
  const lon = Math.atan2(local.z, local.x) * 180 / Math.PI;
  const lat = Math.asin(local.y) * 180 / Math.PI;
  return { lon, lat, rotationY: globe.rotation.y };
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True, args=["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"]
    )
    page = browser.new_page(viewport={"width": 1200, "height": 800})
    page.goto(
        "http://localhost:5174/?q=2k&look=pluto", wait_until="load", timeout=120000
    )
    page.wait_for_function(
        "() => !document.getElementById('loader')", timeout=180000
    )
    page.wait_for_timeout(4000)
    print(page.evaluate(JS))
    browser.close()
