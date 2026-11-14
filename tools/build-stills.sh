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
pair "$(fr drydock2-hero 76)" act-1
pair "$(fr frostworks2-hero2 18)" act-2
pair "$(fr frostworks2-chase-b 88)" act-3
pair "$(fr gulch2-hero 50)" act-4
pair "$(fr foundry2-orbit 25)" act-5
for m in wrenfield foundry frostworks drydock gulch; do pair "$(fr ${m}2-crane 15)" map-$m; done
webp "$(fr gulch2-chase-a 34)" $O/hero.webp 1920 80
webp "$(fr wrenfield2-hero2 50)" $O/trailer-poster.webp 1920 80
webp "$(fr drydock2-hud 55)" $O/step-arena.webp 960 80
webp "$(fr drydock2-hud 13)" $O/clip-1.webp 1280 76
webp "$(fr drydock2-slow 0)" $O/clip-2.webp 1280 76
webp "$(fr wrenfield2-crane 10)" $O/clip-3.webp 1280 76
webp "$F/garage-assemble/0250.jpg" $O/assemble.webp 1280 78
# link preview 1200x630 and apple touch icon
ffmpeg -loglevel error -y -i "$(fr drydock2-hero 76)" -vf "scale=1200:-2:flags=lanczos,crop=1200:630,$GR" -q:v 3 $O/og.jpg
ffmpeg -loglevel error -y -i "$(fr frostworks2-hero2 18)" -vf "crop=1080:1080:480:0,scale=180:180:flags=lanczos" $O/apple-touch-icon.png
du -ch $O/*.webp $O/og.jpg | tail -1

# scroll-scrubbed assembly: garage-assemble frames 24..309 (frame → shell → head → arms → gadgets), every 3rd
mkdir -p $O/scrub; n=0
for i in $(seq 24 3 309); do
  ffmpeg -loglevel error -y -i $(printf "$F/garage-assemble/%04d.jpg" $i) -vf "scale=960:540:flags=lanczos,$GR" -f image2pipe -vcodec png - | cwebp -quiet -q 68 -m 6 -o $(printf "$O/scrub/%03d.webp" $n) -- -; n=$((n+1))
done
# drag-to-spin sprites: 24 angles per featured build (node tools/capture-garage.mjs --only=spin)
mkdir -p $O/spin
for id in small medium huge twins; do
  ffmpeg -y -loglevel error -framerate 1 -i capture/spin/$id/%04d.jpg -vf "crop=1120:1400:200:0,scale=480:600:flags=lanczos,$GR,tile=24x1" -frames:v 1 -f image2pipe -vcodec png - | cwebp -quiet -q 72 -m 6 -o $O/spin/$id.webp -- -
done
# featured build cards: the 3/4 view from the garage (node tools/capture-garage.mjs --only=featured)
for id in small medium huge twins; do
  ffmpeg -loglevel error -y -i capture/featured/$id-b.jpg -vf "crop=1120:1400:200:0,scale=640:800:flags=lanczos,$GR" -f image2pipe -vcodec png - | cwebp -quiet -q 82 -m 6 -o $O/feat-$id.webp -- -
done
