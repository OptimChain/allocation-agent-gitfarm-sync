#!/bin/bash
# Fetch all jobs from discovered ATS platforms using curl
# Output: scripts/all-discovered-jobs.json

OUTDIR="/home/user/allocation-agent-gitfarm-sync/scripts/jobs-data"
mkdir -p "$OUTDIR"

echo "=== Fetching Greenhouse jobs ==="
for slug in anthropic snorkelai fireworksai lovable abakaai; do
  echo "  Fetching GH: $slug"
  curl -s "https://boards-api.greenhouse.io/v1/boards/${slug}/jobs" > "$OUTDIR/gh_${slug}.json" 2>/dev/null
done

echo "=== Fetching Lever jobs ==="
for slug in regalvoice finch; do
  echo "  Fetching Lever: $slug"
  curl -s "https://api.lever.co/v0/postings/${slug}" > "$OUTDIR/lever_${slug}.json" 2>/dev/null
done

echo "=== Fetching Ashby jobs ==="
for slug in openai harvey crusoe commure suno polymarket hockeystack airops ambiencehealthcare laurel numeral salient omnea northwoodspace arcade superpower deeptune nevis offdeal greenboard brettonai; do
  echo "  Fetching Ashby: $slug"
  curl -s "https://api.ashbyhq.com/posting-api/job-board/${slug}" > "$OUTDIR/ashby_${slug}.json" 2>/dev/null
done

echo "=== All fetched ==="
echo "Files saved to $OUTDIR"
ls -la "$OUTDIR"
