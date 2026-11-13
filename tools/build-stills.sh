#!/bin/bash
# Stills from captured frames → assets/img (WebP full + -sm, posters, og.jpg)
set -e
cd "$(dirname "$0")/.."
F=capture/frames; O=assets/img
fr() { n=$(ls $F/$1 | wc -l | tr -d ' '); printf "%s/%s/%04d.jpg" $F $1 $(( n * $2 / 100 )); }
GR="eq=contrast=1.05:saturation=1.10:gamma=0.98"
webp() { # src out width quality
  ffmpeg -loglevel error -y -i "$1" -vf "scale=$3:-2:flags=lanczos,$GR" -f image2pipe -vcodec png - | cwebp -quiet -q $4 -m 6 -o "$2" -- -; }
pair() { webp "$1" $O/$2.webp 1920 82; webp "$1" $O/$2-sm.webp 1280 78; }
pair "$(fr wrenfield2-chase-b 70)" act-1
pair "$(fr wrenfield2-hero2 22)" act-2
pair "$(fr frostworks2-chase-b 82)" act-3
pair "$(fr foundry2-hero 22)" act-4
pair "$(fr gulch2-hero2 10)" act-5
for m in wrenfield foundry frostworks drydock gulch; do pair "$(fr ${m}2-crane 15)" map-$m; done
webp "$(fr wrenfield2-chase-b 10)" $O/hero.webp 1920 80
webp "$(fr wrenfield2-chase-b 94)" $O/trailer-poster.webp 1920 80
webp "$(fr frostworks2-hud 92)" $O/step-arena.webp 960 80
webp "$(fr wrenfield2-hud 34)" $O/clip-1.webp 1280 76
webp "$(fr frostworks2-slow 0)" $O/clip-2.webp 1280 76
webp "$(fr wrenfield2-crane 5)" $O/clip-3.webp 1280 76
webp "$F/garage-assemble/0250.jpg" $O/assemble.webp 1280 78
# link preview 1200x630 and apple touch icon
ffmpeg -loglevel error -y -i "$(fr wrenfield2-chase-b 70)" -vf "scale=1200:-2:flags=lanczos,crop=1200:630,$GR" -q:v 3 $O/og.jpg
ffmpeg -loglevel error -y -i "$(fr wrenfield2-hero2 22)" -vf "crop=1080:1080:420:0,scale=180:180:flags=lanczos" $O/apple-touch-icon.png
du -ch $O/*.webp $O/og.jpg | tail -1
