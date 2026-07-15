#!/usr/bin/env bash
# Kept from the AI-Spec-Driven-Development-Flow kit (setup guide §1).
# Scaffolds a new spec folder under specs/ with the standard file set.
#
# Usage: scripts/new-feature.sh 0002-ai-concierge
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <NNNN-product-slug>" >&2
  exit 1
fi

SLUG="$1"
DIR="specs/${SLUG}"

if [ -d "$DIR" ]; then
  echo "Error: $DIR already exists" >&2
  exit 1
fi

mkdir -p "$DIR"
for f in product-brief.md prd.md design-system.md plan.md team.md tasks.md verification.md; do
  touch "$DIR/$f"
done

cat > "$DIR/team.md" <<'EOF'
- Mayor: PM, reviews all /verify verdicts, owns client decisions
- coding agent: implements tasks.md, full file+shell access
- test-security agent: writes tests only, runs the Section-6 checklist
EOF

echo "Scaffolded $DIR. Paste the matching Notion PRD into prd.md and product-brief.md, then run /plan."
