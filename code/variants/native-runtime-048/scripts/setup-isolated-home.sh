#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 -c 'from pathlib import Path; assert "project_id = \"jarvis-home-test\"" in Path("supabase/config.toml").read_text()'
if ! docker network inspect jarvis-home-test-loopback >/dev/null 2>&1; then
  docker network create --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 jarvis-home-test-loopback >/dev/null
fi
# The log contains disposable local credentials; keep it outside the repo.
setup_log=$(mktemp /tmp/jarvis-home-test-start.XXXXXX)
if ! supabase start --network-id jarvis-home-test-loopback --exclude realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor >"$setup_log" 2>&1; then
  echo "Local Supabase could not start. Inspect $setup_log locally."
  exit 1
fi
# CLI 2.98.2 explicitly binds ports to all interfaces despite the network option.
python3 scripts/bind-isolated-home-loopback.py
node --input-type=module -e 'import {localTestConfig} from "./scripts/isolated-home-config.mjs"; localTestConfig(); console.log("Local database verified at 127.0.0.1:55421");'
