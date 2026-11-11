#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

encode_case() {
  local name="$1" width="$2" height="$3" out_width="$4" out_height="$5" with_audio="$6"
  local input="$tmp_dir/source-$name.mp4"
  local output="$tmp_dir/compatible-$name.mp4"
  echo "Testing $name ($width x $height; audio=$with_audio)"

  if [[ "$with_audio" == "yes" ]]; then
    ffmpeg -hide_banner -loglevel error -f lavfi -i "testsrc2=size=${width}x${height}:rate=30" \
      -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 1.5 \
      -c:v libx264 -pix_fmt yuv420p -c:a aac -y "$input"
  else
    ffmpeg -hide_banner -loglevel error -f lavfi -i "testsrc2=size=${width}x${height}:rate=30" \
      -t 1.5 -c:v libx264 -pix_fmt yuv420p -an -y "$input"
  fi

  ffmpeg -hide_banner -loglevel error -y -i "$input" -map 0:v:0 -map '0:a:0?' -sn -dn \
    -vf "scale=${out_width}:${out_height}:flags=lanczos,fps=30" -fps_mode cfr \
    -c:v libx264 -profile:v baseline -level:v 3.1 -pix_fmt yuv420p -preset veryfast \
    -crf 23 -maxrate 2M -bufsize 4M -g 60 -keyint_min 60 -sc_threshold 0 \
    -x264-params "cabac=0:bframes=0:ref=1:weightp=0" \
    -c:a aac -profile:a aac_low -b:a 128k -ac 2 -ar 48000 \
    -movflags +faststart -f mp4 "$output"

  local info
  info="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,level,pix_fmt,width,height,avg_frame_rate -of default=noprint_wrappers=1 "$output")"
  grep -q '^codec_name=h264$' <<<"$info"
  grep -Eiq '^profile=.*baseline' <<<"$info"
  grep -q '^level=31$' <<<"$info"
  grep -q '^pix_fmt=yuv420p$' <<<"$info"
  grep -q '^avg_frame_rate=30/1$' <<<"$info"

  local dims actual_w actual_h
  dims="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$output")"
  actual_w="${dims%x*}"
  actual_h="${dims#*x}"
  if (( actual_w * actual_h > 921600 || actual_w > 1280 || actual_h > 1280 )); then
    echo "Output dimensions exceed Level 3.1 frame-size budget: $dims" >&2
    exit 1
  fi

  local audio
  audio="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,profile,sample_rate,channels -of default=noprint_wrappers=1 "$output" || true)"
  if [[ "$with_audio" == "yes" ]]; then
    grep -q '^codec_name=aac$' <<<"$audio"
    grep -q '^profile=LC$' <<<"$audio"
    grep -q '^sample_rate=48000$' <<<"$audio"
    grep -q '^channels=2$' <<<"$audio"
  else
    [[ -z "$audio" ]]
  fi
  echo "$info"
}

encode_case portrait 1080 1920 720 1280 yes
encode_case landscape 1920 1080 1280 720 yes
encode_case square 1080 1080 960 960 yes
encode_case low-resolution 320 240 320 240 yes
encode_case no-audio 1280 720 1280 720 no
echo "All FFmpeg compatibility profile tests passed."
