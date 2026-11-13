# Z-fight score per viewpoint: share of pixels that change by >40 between the 1 cm-nudged pair,
# after removing isolated edge pixels (a 3x3 neighbourhood must also have changed). Writes
# highlighted overlays to capture/zf-hl/.
import sys, glob, os
import numpy as np
from PIL import Image
os.makedirs('capture/zf-hl', exist_ok=True)
for d in sys.argv[1:]:
    print('==', d)
    for a in sorted(glob.glob(f'{d}/*-a.png')):
        A = np.asarray(Image.open(a).convert('RGB')).astype(int)
        B = np.asarray(Image.open(a[:-6] + '-b.png').convert('RGB')).astype(int)
        m = (np.abs(A - B).max(axis=2) > 40)
        n = sum(np.roll(np.roll(m, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        core = m & (n >= 6)
        pct = core.mean() * 100
        name = os.path.basename(a)[:-6]
        print(f'  {name:22s} {pct:.3f}%')
        hl = A.copy(); hl[core] = [255, 0, 255]
        Image.fromarray(hl.astype('uint8')).save(f'capture/zf-hl/{os.path.basename(d)}-{name}.jpg', quality=80)
