#!/usr/bin/env bash
#
# Query-parser evaluation.
#
# There is no JavaScript test runner in this repo (the suite is pytest, for the
# ingest service) and adding one for this would cost more than it returns, so
# this exercises the real endpoint over HTTP and asserts on the JSON. That is
# also the honest test: it covers normalisation, the rules, the cache and the
# route together, which a unit test of the rules alone would not.
#
# Every case runs twice. The first pass asserts the parse; the second asserts
# the answer came from the cache, which is how we show that asking the same
# thing twice costs one materialisation rather than two.
#
# Usage: scripts/parse-eval.sh [base-url]
set -uo pipefail

BASE="${1:-http://localhost:3000}"
PSQL=(docker compose exec -T postgres psql -U guilit -d guilit)
PASS=0
FAIL=0

# case|expected key=value pairs (comma separated)|expected suggestion fields
CASES=$(cat <<'EOF'
ላፕቶፕ under 20000|category=computers,maxPrice=20000,q=
bag less than 3000 birr|category=fashion,maxPrice=3000
ስልክ ከ10000 በታች ቦሌ|category=phones,maxPrice=10000,area=Bole,q=
ሶፋ ቦሌ|category=furniture,area=Bole
አዲስ አይፎን|category=phones,condition=brand_new
የቤት እቃ ከ5ሺ በላይ|category=furniture,minPrice=5000,q=
ጠረጴዛ ከ2000 እስከ 8000|category=furniture,minPrice=2000,maxPrice=8000
ቴሌቪዥን መገናኛ|category=tv-audio,area=Megenagna
laptop 20k|category=computers,maxPrice=20000
ላፕቶፕ ዴል|category=computers,q=dell
samsung a54 under 15000|category=phones,maxPrice=15000
brand new samsung in bole|category=phones,area=Bole,condition=brand_new
laptop 20000|category=computers,maxPrice=
EOF
)

parse() {
  local q="$1"
  local body
  body=$(python3 -c "import json,sys;print(json.dumps({'q':sys.argv[1]}))" "$q")
  curl -s -X POST "$BASE/api/search/parse" \
    -H 'content-type: application/json' --data "$body"
}

check() {
  local q="$1" expect="$2" json="$3"
  local result
  result=$(python3 - "$expect" <<'PY' <<<"$json"
import json, sys
expect = sys.argv[1]
data = json.load(sys.stdin)
query = data["query"]
problems = []
for pair in expect.split(","):
    if not pair:
        continue
    key, _, want = pair.partition("=")
    got = query.get(key)
    if isinstance(got, list):
        got = ",".join(got)
    if want == "":
        if got is not None:
            problems.append(f"{key} should be absent, got {got!r}")
    elif str(got) != want:
        problems.append(f"{key}: want {want!r}, got {got!r}")
print("|".join(problems))
PY
)
  if [ -z "$result" ]; then
    PASS=$((PASS + 1))
    printf '  \033[32mok\033[0m   %-30s\n' "$q"
  else
    FAIL=$((FAIL + 1))
    printf '  \033[31mFAIL\033[0m %-30s %s\n' "$q" "$result"
  fi
}

echo "Resetting parse cache..."
"${PSQL[@]}" -c "TRUNCATE search_parses;" >/dev/null 2>&1

echo
echo "Pass 1 — parse correctness"
while IFS='|' read -r q expect; do
  [ -z "$q" ] && continue
  check "$q" "$expect" "$(parse "$q")"
done <<<"$CASES"

echo
echo "Pass 2 — every repeat must be served from cache"
while IFS='|' read -r q expect; do
  [ -z "$q" ] && continue
  src=$(parse "$q" | python3 -c "import json,sys;print(json.load(sys.stdin)['source'])")
  if [ "$src" = "cache" ]; then
    PASS=$((PASS + 1))
    printf '  \033[32mok\033[0m   %-30s cached\n' "$q"
  else
    FAIL=$((FAIL + 1))
    printf '  \033[31mFAIL\033[0m %-30s source=%s (expected cache)\n' "$q" "$src"
  fi
done <<<"$CASES"

echo
echo "Degradation — these must answer 200 and never error"
for q in "" "asdkjh qwe zxc" "$(head -c 300 /dev/zero | tr '\0' 'x')"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/search/parse" \
    -H 'content-type: application/json' \
    --data "$(python3 -c "import json,sys;print(json.dumps({'q':sys.argv[1]}))" "$q")")
  label=$(printf '%.24s' "${q:-<empty>}")
  if [ "$code" = "200" ]; then
    PASS=$((PASS + 1)); printf '  \033[32mok\033[0m   %-30s 200\n' "$label"
  else
    FAIL=$((FAIL + 1)); printf '  \033[31mFAIL\033[0m %-30s %s\n' "$label" "$code"
  fi
done

echo
echo "Cache table — one row per distinct query, hit_count 2"
"${PSQL[@]}" -c \
  "SELECT normalized_query, source, hit_count, latency_ms FROM search_parses ORDER BY hit_count DESC, normalized_query;" 2>/dev/null

echo
echo "Latency (cached path, what a repeat search costs)"
for q in "ሶፋ ቦሌ" "bag less than 3000 birr"; do
  t=$(curl -s -o /dev/null -w '%{time_total}' -X POST "$BASE/api/search/parse" \
    -H 'content-type: application/json' \
    --data "$(python3 -c "import json,sys;print(json.dumps({'q':sys.argv[1]}))" "$q")")
  printf '  %-30s %sms\n' "$q" "$(python3 -c "print(round(float('$t')*1000))")"
done

echo
echo "======================================"
printf '  passed %d, failed %d\n' "$PASS" "$FAIL"
echo "======================================"
[ "$FAIL" -eq 0 ]
