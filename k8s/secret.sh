#!/usr/bin/env bash
#
# Create or update the `app-secrets` Secret in the `opspulse` namespace from api/.env.
#
# Idempotent: `create --dry-run=client -o yaml | kubectl apply -f -` renders the
# Secret locally and lets `apply` decide create-vs-update, so re-running this after
# rotating a key updates in place instead of failing with AlreadyExists.
#
# This script NEVER prints a secret value. Do not run it under `bash -x`.
#
# Usage:   ./secret.sh                    # reads ../api/.env
#          ENV_FILE=/path/to/.env ./secret.sh
#
set -euo pipefail
set +x                      # belt and braces: never trace-log the values below

NS="opspulse"
SECRET="app-secrets"
KEYS=(MONGODB_URI GROQ_API_KEY GROQ_MODEL JWT_SECRET)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../api/.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2
  echo "       Copy api/.env.example to api/.env and fill it in." >&2
  exit 1
fi

# Print the value of key $1 from $ENV_FILE on stdout. First match wins.
# Tolerates `export K=v`, surrounding quotes, and CRLF line endings.
read_env() {
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1=(.*)$/\2/p" "$ENV_FILE" \
    | head -n 1 \
    | sed -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

ARGS=()
MISSING=()
for key in "${KEYS[@]}"; do
  value="$(read_env "$key")"
  if [ -z "$value" ]; then
    MISSING+=("$key")            # key NAME only -- never the value
    continue
  fi
  ARGS+=(--from-literal="$key=$value")
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ERROR: missing or empty in $ENV_FILE: ${MISSING[*]}" >&2
  exit 1
fi

# The namespace must exist before the Secret can land in it.
kubectl get namespace "$NS" >/dev/null 2>&1 \
  || kubectl apply -f "$SCRIPT_DIR/00-namespace.yaml"

kubectl -n "$NS" create secret generic "$SECRET" \
  "${ARGS[@]}" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

# Confirm by KEY NAME only. `get secret -o yaml` would dump base64 values --
# base64 is encoding, not encryption, so that output is as good as plaintext.
echo
echo "Keys now in $NS/$SECRET:"
kubectl -n "$NS" get secret "$SECRET" \
  -o go-template='{{range $k, $v := .data}}  - {{$k}}{{"\n"}}{{end}}'
echo "Key count: $(kubectl -n "$NS" get secret "$SECRET" -o go-template='{{len .data}}')"
