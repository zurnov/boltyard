#!/usr/bin/env python3
"""Cut the captured frame sequences into the site's videos.

tools/edit.json holds the edit: for each output, a list of segments
  {"shot": "<frames dir>", "in": 0.2, "out": 0.8}      (fractions of the shot)
  {"card": "<name>", "seconds": 2.5}                   (capture/cards/<name>.png)
Outputs land in assets/video/<name>.mp4 (H.264, faststart, no audio).
Usage: tools/encode.py [output names...]
"""
import json, subprocess, sys, os, shutil, tempfile

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(SITE, 'capture', 'frames')
CARDS = os.path.join(SITE, 'capture', 'cards')
OUT = os.path.join(SITE, 'assets', 'video')
GRADE = 'eq=contrast=1.05:saturation=1.10:gamma=0.98,vignette=angle=PI/6'

def shot_meta(name):
    files = sorted(f for f in os.listdir(os.path.join(FR, name)) if f.endswith('.jpg'))
    return len(files)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(' '.join(cmd)); print(r.stderr[-2000:]); sys.exit(1)

def build(name, spec, tmp):
    w, h, fps = spec.get('w', 1920), spec.get('h', 1080), spec.get('fps', 30)
    crf = spec.get('crf', 22)
    parts = []
    for i, seg in enumerate(spec['segments']):
        p = os.path.join(tmp, f'{name}-{i:02d}.mp4')
        vf = (seg['pre'] + ',' if seg.get('pre') else '') + f'scale={w}:{h}:flags=lanczos,fps={fps}'
        if not seg.get('raw'):
            vf += ',' + GRADE
        if 'card' in seg:
            src = os.path.join(CARDS, seg['card'] + '.png')
            sec = seg.get('seconds', 2.5)
            fade = f",fade=t=in:st=0:d=0.35,fade=t=out:st={sec - 0.4}:d=0.4"
            run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-t', str(sec), '-i', src,
                 '-vf', f'scale={w}:{h}:flags=lanczos,fps={fps}{fade},format=yuv420p', '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', p])
        else:
            n = shot_meta(seg['shot'])
            src_fps = seg.get('src_fps', 60)
            a, b = int(n * seg.get('in', 0)), int(n * seg.get('out', 1))
            speed = seg.get('speed', 1)
            pts = f',setpts=PTS/{speed}' if speed != 1 else ''
            fades = ''
            dur = (b - a) / src_fps / speed
            if seg.get('fadein'): fades += f",fade=t=in:st=0:d={seg['fadein']}"
            if seg.get('fadeout'): fades += f",fade=t=out:st={dur - seg['fadeout']}:d={seg['fadeout']}"
            run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(src_fps), '-start_number', str(a),
                 '-i', os.path.join(FR, seg['shot'], '%04d.jpg'), '-frames:v', str(max(1, round(dur * fps))),
                 '-vf', f'{pts.lstrip(",") + "," if pts else ""}{vf}{fades},format=yuv420p', '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', p])
        d = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip()
        if os.environ.get('VERBOSE'): print(f'  {i:02d} {seg.get("shot", seg.get("card"))}: {float(d):.2f}s')
        parts.append(p)
    lst = os.path.join(tmp, f'{name}.txt')
    with open(lst, 'w') as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, name + '.mp4')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
         '-c:v', 'libx264', '-crf', str(crf), '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
         '-movflags', '+faststart', '-an', dst])
    size = os.path.getsize(dst) / 1e6
    dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], capture_output=True, text=True).stdout.strip()
    print(f'{name}.mp4  {float(dur):.1f}s  {size:.1f} MB')

edit = json.load(open(os.path.join(SITE, 'tools', 'edit.json')))
want = sys.argv[1:] or list(edit)
tmp = tempfile.mkdtemp()
try:
    for n in want:
        build(n, edit[n], tmp)
finally:
    shutil.rmtree(tmp)
