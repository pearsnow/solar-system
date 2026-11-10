"""Integrity checks on the v2 catalogues. Prints a report; exits non-zero on hard failures."""
import json
import math
import os

D = r"D:\solar-system-v2\src\data\catalog"
GM = {  # km^3/s^2
    "earth": 398600.4418, "mars": 42828.37, "jupiter": 126686534.0,
    "saturn": 37931207.0, "uranus": 5793951.0, "neptune": 6835099.0,
    "pluto": 869.6,
}
R_PARENT = {
    "earth": 6371.0, "mars": 3389.5, "jupiter": 69911.0, "saturn": 58232.0,
    "uranus": 25362.0, "neptune": 24622.0, "pluto": 1188.3,
}

moons = json.load(open(os.path.join(D, "moons.json"), encoding="utf-8"))
ast = json.load(open(os.path.join(D, "asteroids.json"), encoding="utf-8"))
comets = json.load(open(os.path.join(D, "comets.json"), encoding="utf-8"))

print("=== moons: implied parent mass from a and P (Kepler III) ===")
worst = []
for parent, gm in GM.items():
    rows = [m for m in moons if m["parent"] == parent]
    if not rows:
        continue
    errs = []
    for m in rows:
        if not m["periodDays"] or m["aKm"] <= 0:
            continue
        n = 2 * math.pi / (m["periodDays"] * 86400.0)   # rad/s
        mu = n * n * (m["aKm"] ** 3)
        errs.append(abs(mu / gm - 1))
    errs.sort()
    med = errs[len(errs) // 2]
    print(f"  {parent:8s} n={len(rows):3d}  median |dM/M|={med:6.1%}  p90={errs[int(len(errs)*0.9)]:6.1%}  max={errs[-1]:6.1%}")

print("\n=== moons: orbit vs parent radius ===")
for parent, rp in R_PARENT.items():
    rows = [m for m in moons if m["parent"] == parent]
    if not rows:
        continue
    ratios = [m["aKm"] / rp for m in rows]
    print(f"  {parent:8s} a/Rp  min={min(ratios):8.2f}  max={max(ratios):9.1f}   "
          f"radius min={min(m['radiusKm'] for m in rows):7.2f} km  "
          f"estimated={sum(1 for m in rows if m['estimated'])}")

print("\n=== moons: eccentricity / inclination ranges ===")
print(f"  e   max={max(m['e'] for m in moons):.3f}  "
      f"i   max={max(m['i'] for m in moons):.1f} deg  "
      f"retrograde(i>90)={sum(1 for m in moons if m['i'] > 90)}")

print("\n=== asteroids ===")
c = ast["columns"]
print(f"  count={ast['count']} epoch={ast['epoch']}")
for key in ("a", "e", "i", "d"):
    vals = c[key]
    print(f"  {key:2s} min={min(vals):9.3f} max={max(vals):9.3f} mean={sum(vals)/len(vals):8.3f}")
inside = sum(1 for v in c["a"] if 2.06 <= v <= 3.32)
print(f"  inside 2.06-3.32 AU: {inside} ({inside/ast['count']:.0%})")
# Kirkwood gaps: histogram of semi-major axis should dip at 2.5, 2.82, 2.95, 3.27
bins = [0.0] * 12
for v in c["a"]:
    k = int((v - 2.0) / 0.15)
    if 0 <= k < 12:
        bins[k] += 1
print("  a-histogram 2.0-3.8 (0.15 AU bins):")
print("   " + " ".join(f"{2.0+i*0.15:.2f}:{n}" for i, n in enumerate(bins)))

print("\n=== comets ===")
print(f"  count={len(comets)}  hyperbolic={sum(1 for x in comets if x['hyperbolic'])}")
bad = [x for x in comets if not (x["q"] > 0) or not (0 < x["i"] <= 180) or not (1500000 < x["tp"] < 3000000)]
print(f"  out-of-range records: {len(bad)}")
for x in comets[:5]:
    print(f"    {x['name']:34s} q={x['q']:7.3f} e={x['e']:.5f} i={x['i']:6.2f} tp={x['tp']:.1f}")
