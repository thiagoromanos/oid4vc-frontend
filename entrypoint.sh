#!/bin/sh
set -e

TUNNEL_ENDPOINT=${TUNNEL_ENDPOINT:-}
WAIT_INTERVAL=${WAIT_INTERVAL:-3}
WAIT_ATTEMPTS=${WAIT_ATTEMPTS:-10}
TUNNEL_NAME=${TUNNEL_NAME:-authserver}

# If AUTH_SERVER_PUBLIC_URL is already set (e.g. via docker-compose env), skip ngrok discovery.
if [ -n "$AUTH_SERVER_PUBLIC_URL" ]; then
  echo "AUTH_SERVER_PUBLIC_URL already set: $AUTH_SERVER_PUBLIC_URL"

# If a TUNNEL_ENDPOINT is configured, wait for the ngrok tunnel and derive the URL from it.
elif [ -n "$TUNNEL_ENDPOINT" ]; then
  echo "Waiting for ngrok tunnel '${TUNNEL_NAME}' at ${TUNNEL_ENDPOINT} ..."

  # Liveness check — retry until the named tunnel is available.
  CURRENT_ATTEMPT=0
  while true; do
    CURRENT_ATTEMPT=$((CURRENT_ATTEMPT + 1))
    if curl -sf "${TUNNEL_ENDPOINT}/api/tunnels" \
        | jq -e --arg n "$TUNNEL_NAME" '.tunnels[] | select(.name == $n and .public_url != null)' \
        > /dev/null 2>&1; then
      echo "Tunnel '${TUNNEL_NAME}' is ready."
      break
    fi
    if [ "$CURRENT_ATTEMPT" -ge "$WAIT_ATTEMPTS" ]; then
      echo "ERROR: Tunnel '${TUNNEL_NAME}' not available after ${WAIT_ATTEMPTS} attempts. Aborting." >&2
      exit 1
    fi
    echo "Attempt ${CURRENT_ATTEMPT}/${WAIT_ATTEMPTS}: tunnel not ready, retrying in ${WAIT_INTERVAL}s ..." >&2
    sleep "$WAIT_INTERVAL"
  done

  # Extract the public URL for the named tunnel.
  AUTH_SERVER_PUBLIC_URL=$(curl -sf "${TUNNEL_ENDPOINT}/api/tunnels" \
    | jq -r --arg n "$TUNNEL_NAME" '.tunnels[] | select(.name == $n) | .public_url')
  export AUTH_SERVER_PUBLIC_URL
  echo "AUTH_SERVER_PUBLIC_URL: $AUTH_SERVER_PUBLIC_URL"

else
  echo "No TUNNEL_ENDPOINT set and AUTH_SERVER_PUBLIC_URL is unset — skipping ngrok discovery."
fi

exec "$@"
