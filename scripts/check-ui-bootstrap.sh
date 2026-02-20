#!/usr/bin/env bash
set -euo pipefail

run_smoke_check() {
  local target="$1"
  echo "Running UI bootstrap smoke check against ${target}"
  QA_TARGET_URL="$target" npx playwright test wonderland-qa.spec.js --grep "AIPU UI bootstrap smoke check" --workers=1
}

if [[ $# -gt 1 ]]; then
  echo "Usage: ./scripts/check-ui-bootstrap.sh [staged|deployed|both|http://host:port]" >&2
  exit 1
fi

MODE="${1:-single}"
STAGED_URL="${QA_TARGET_URL:-${QA_STAGED_URL:-http://127.0.0.1:4173}}"
DEPLOYED_URL="${QA_DEPLOYED_URL:-https://osangen.github.io/ai-power-users-codex53-demo}"

if [[ "$MODE" == "single" ]]; then
  if [[ -z "$STAGED_URL" ]]; then
    echo "Usage: QA_TARGET_URL=<http://host:port> ./scripts/check-ui-bootstrap.sh" >&2
    exit 1
  fi
  run_smoke_check "$STAGED_URL"
elif [[ "$MODE" == "staged" ]]; then
  run_smoke_check "$STAGED_URL"
elif [[ "$MODE" == "deployed" ]]; then
  run_smoke_check "$DEPLOYED_URL"
elif [[ "$MODE" == "both" ]]; then
  run_smoke_check "$STAGED_URL"
  run_smoke_check "$DEPLOYED_URL"
elif [[ "$MODE" == http* ]]; then
  run_smoke_check "$MODE"
else
  echo "Usage: ./scripts/check-ui-bootstrap.sh [staged|deployed|both|http://host:port]" >&2
  exit 1
fi
