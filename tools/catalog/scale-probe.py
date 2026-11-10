"""Numeric probe for the proposed v2 scale law.

Answers three questions before any code is written:
  1. does every moon stay clear of its parent's surface and of the next planet?
  2. how big is the whole scene (camera far plane)?
  3. what does the new radius curve do to relative planet sizes?
"""
import json
import math

AU = 60.0
R_REF = 1.3
R_EXP = 0.35
KNEE = 2.4
FALLOFF = 0.42
MOON_FLOOR = 0.02

AU_ELEMENTS = {
    "mercury": 0.387, "venus": 0.723, "earth": 1.0, "mars": 1.524,
    "jupiter": 5.203, "saturn": 9.537, "uranus": 19.19, "neptune": 30.07,
    "pluto": 39.48,
}
R_KM = {
    "mercury": 2439.7, "venus": 6051.8, "earth": 6371.0, "mars": 3389.5,
    "jupiter": 69911.0, "saturn": 58232.0, "uranus": 25362.0, "neptune": 24622.0,
    "pluto": 1188.3,
}
SUN_KM = 696340.0
RING_OUTER = {"saturn": 2.42, "uranus": 2.0}


def radius(km):
    return R_REF * (km / 6371.0) ** R_EXP


def moon_orbit(parent_vis, a_km, parent_km):
    x = a_km / parent_km
    f = x if x <= KNEE else KNEE * (x / KNEE) ** FALLOFF
    return parent_vis * f


def moon_radius(parent_vis, r_km, parent_km):
    return max(MOON_FLOOR, parent_vis * (max(r_km, 0.1) / parent_km) ** 0.5)


print("=== scene distances (AU=60) ===")
prev = 0.0
for name, au in AU_ELEMENTS.items():
    d = au * AU
    print(f"  {name:8s} {au:6.3f} AU -> {d:8.1f} units   gap from previous {d-prev:8.1f}")
    prev = d
print(f"  sun radius {radius(SUN_KM):.2f} units; Mercury at {AU_ELEMENTS['mercury']*AU:.1f} "
      f"= {AU_ELEMENTS['mercury']*AU/radius(SUN_KM):.1f} sun radii")

print("\n=== planet visual radii (old 0.4 vs new 0.35) ===")
for name, km in R_KM.items():
    old = 1.3 * (km / 6371.0) ** 0.4
    print(f"  {name:8s} new={radius(km):6.2f}  old={old:6.2f}")

moons = json.load(open(r"D:\solar-system-v2\src\data\catalog\moons.json", encoding="utf-8"))
print("\n=== moon geometry check ===")
order = list(AU_ELEMENTS)
problems = []
for parent in R_KM:
    rows = [m for m in moons if m["parent"] == parent]
    if not rows:
        continue
    pv = radius(R_KM[parent])
    idx = order.index(parent)
    neighbour = order[idx + 1] if idx + 1 < len(order) else None
    sep = (AU_ELEMENTS[neighbour] - AU_ELEMENTS[parent]) * AU if neighbour else 400.0
    far = max(moon_orbit(pv, m["aKm"], R_KM[parent]) for m in rows)
    near = min(moon_orbit(pv, m["aKm"], R_KM[parent]) for m in rows)
    ring = RING_OUTER.get(parent)
    print(f"  {parent:8s} Rp={pv:5.2f}  moon orbit {near:6.2f}..{far:6.2f}  "
          f"half gap to next {sep/2:7.1f}  ring outer {ring or '-':>5}")
    if far > sep * 0.6:
        problems.append(f"{parent}: moon system {far:.1f} vs half-gap {sep/2:.1f}")
    if ring and near < pv * ring * 1.02:
        problems.append(f"{parent}: innermost moon {near:.2f} inside ring {pv*ring:.2f}")

print("\n  worst offenders:")
for m in sorted(moons, key=lambda x: -moon_orbit(radius(R_KM[x["parent"]]), x["aKm"], R_KM[x["parent"]]))[:6]:
    print(f"    {m['parent']:8s} {m['name']:14s} a/Rp={m['aKm']/R_KM[m['parent']]:8.1f} -> "
          f"{moon_orbit(radius(R_KM[m['parent']]), m['aKm'], R_KM[m['parent']]):6.1f} units")

print("\n  size check (moon radius vs its own orbit radius):")
bad = [(m["parent"], m["name"]) for m in moons
       if moon_radius(radius(R_KM[m["parent"]]), m["radiusKm"], R_KM[m["parent"]])
       > 0.5 * moon_orbit(radius(R_KM[m["parent"]]), m["aKm"], R_KM[m["parent"]])]
print("   oversized:", bad or "none")
print("   smallest rendered moon radius:",
      min(moon_radius(radius(R_KM[m['parent']]), m['radiusKm'], R_KM[m['parent']]) for m in moons))

print("\n=== comet aphelion reach ===")
comets = json.load(open(r"D:\solar-system-v2\src\data\catalog\comets.json", encoding="utf-8"))
for c in comets[:6]:
    if c["a"]:
        q = c["q"]
        ap = 2 * c["a"] - q
        print(f"  {c['name'][:34]:34s} q={q:7.3f} a={c['a']:9.1f} aphelion={ap:9.1f} AU "
              f"-> {ap*AU:10.0f} units")
print("\nproblems:", problems or "none")
