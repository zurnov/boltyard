#!/bin/bash
# Robot roster images (front 3/4 and back) from the game's gallery renders → assets/img/bot-*.webp
set -e
SH=/Users/dimitur/dev/boltyard-site/capture/robots
OUT=$(cd "$(dirname "$0")/.." && pwd)/assets/img
mk() { # slug src-front src-back
  for pair in "$1:$2" "$1-alt:$3"; do
    name=${pair%%:*}; src=${pair#*:}
    ffmpeg -loglevel error -y -i "$src" -vf "crop=820:820:90:40,scale=640:640:flags=lanczos" -f image2pipe -vcodec png - | cwebp -quiet -q 82 -m 6 -o "$OUT/bot-$name.webp" -- -
  done
}
mk old-stomper $SH/robot3-three.png $SH/robot3-back.png
mk tankard $SH/robot4-three.png $SH/robot4-back.png
mk skitter $SH/robot2-three.png $SH/robot2-back.png
mk steamhammer $SH/pack1/robot8-three.png $SH/pack1/robot8-back.png
mk patch $SH/robot0-three.png $SH/robot0-back.png
mk rally-rex $SH/robot1-three.png $SH/robot1-back.png
mk ferryman $SH/pack1/robot9-three.png $SH/pack1/robot9-back.png
mk heron $SH/robot7-three.png $SH/robot7-back.png
# garage steps
G=/Users/dimitur/dev/guns-and-robots-rebith/shots/garage
ffmpeg -loglevel error -y -i $G/rich-store-1080.png -vf "scale=960:-1:flags=lanczos" -f image2pipe -vcodec png - | cwebp -quiet -q 80 -o "$OUT/step-store.webp" -- -
ffmpeg -loglevel error -y -i $G/rich-build-octo-1080.png -vf "scale=960:-1:flags=lanczos" -f image2pipe -vcodec png - | cwebp -quiet -q 80 -o "$OUT/step-build.webp" -- -
ls -la "$OUT" | head -30
