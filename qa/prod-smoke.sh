#!/usr/bin/env bash
# Production smoke (free): guest workspace → tour steps (DB + R2 writes) → files served → paid action gated.
set -euo pipefail
BASE="${1:-https://canopy-fashion-studio.vercel.app}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
loc=$(curl -s -c "$JAR" -o /dev/null -w "%{redirect_url}" "$BASE/api/guest")
pid=$(echo "$loc" | grep -oE 'prj_[a-z0-9]+')
echo "guest project: ${pid:-NONE}"
start=$(curl -s -b "$JAR" -H "content-type: application/json" -d '{"step":"start"}' "$BASE/api/projects/$pid/tour")
url=$(echo "$start" | grep -oE '"url":"[^"]+' | head -1 | cut -d'"' -f4)
echo "tour start: $(echo "$start" | grep -o '"status":"succeeded"' | wc -l | tr -d ' ') runs succeeded"
echo "file: $(curl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}B' "$BASE$url")"
render=$(curl -s -b "$JAR" -H "content-type: application/json" -d '{"step":"render"}' "$BASE/api/projects/$pid/tour")
echo "tour render: $(echo "$render" | grep -o '"status":"succeeded"' | wc -l | tr -d ' ') runs succeeded"
gate=$(curl -s -b "$JAR" -H "content-type: application/json" -d '{"tool":"garment-recolor","inputs":{}}' "$BASE/api/projects/$pid/runs")
echo "paid run as guest: $gate"
xo=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H "origin: https://evil.example" -H "content-type: application/json" -d '{"step":"start"}' "$BASE/api/projects/$pid/tour")
echo "cross-origin POST: $xo"
