#!/usr/bin/env python3
"""Rank trailer windows: for every action shot, find explosion blooms (capture/flashes.json, from
tools/flashes.py) and score the frames around each one for
  - z-fighting: pixels that keep toggling across 8 frames (tools/zflicker.py, persistent),
  - a blocked camera: frames whose centre is nearly flat (the camera sits inside a robot or wall).
Prints the best clean blooms per shot. Usage: tools/pick.py [--span 112] [shots...]"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zflicker import load, persistent, FR

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
span = int(args[args.index('--span') + 1]) if '--span' in args else 112
shots = [a for a in args if not a.startswith('--') and not a.isdigit()]
fl = json.load(open(os.path.join(SITE, 'capture', 'flashes.json')))
shots = shots or [s for s in fl if not any(k in s for k in ('crane', 'dive', 'orbit'))]

def flat(path):
    a = np.asarray(Image.open(path).convert('L').resize((160, 90)), dtype=np.float32)[20:70, 30:130]
    return float(a.std())

for s in sorted(shots):
    files = sorted(f for f in os.listdir(os.path.join(FR, s)) if f.endswith('.jpg'))
    n = len(files); b = fl[s]['bright']
    jumps = sorted(((b[i] - b[i - 1], i) for i in range(1, n)), reverse=True)
    picked = []
    for j, i in jumps:
        if j < 0.02: break
        if all(abs(i - p) > 40 for _, p in picked): picked.append((j, i))
        if len(picked) >= 4: break
    out = []
    for j, i in picked:
        a, e = max(0, i - 8), min(n - 1, i - 8 + span)
        z = 0
        for k in range(a, max(a + 1, e - 8), 8):
            z = max(z, persistent([load(os.path.join(FR, s, files[k + m])) for m in range(8)]).mean() * 100)
        blocked = sum(flat(os.path.join(FR, s, files[k])) < 14 for k in range(a, e, 6)) / max(1, len(range(a, e, 6)))
        ok = z < 0.12 and blocked < 0.15
        out.append(f"{'OK ' if ok else '-- '}bloom {i:3d} ({j:.2f}) win {a}-{e} flicker {z:.2f} blocked {blocked:.0%}")
    print(s, n); [print('   ', o) for o in out]
