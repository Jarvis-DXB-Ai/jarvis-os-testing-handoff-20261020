import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function localTestConfig() {
  assert.match(readFileSync(root + 'supabase/config.toml', 'utf8'), /project_id = "jarvis-home-test"/);
  const keys = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { cwd: root, stdio: ['ignore','pipe','pipe'] }));
  assert.equal(keys.API_URL, 'http://127.0.0.1:55421');
  const db = new URL(keys.DB_URL);
  assert.equal(db.hostname, '127.0.0.1'); assert.equal(db.port, '55422');
  for (const name of ['supabase_db_jarvis-home-test', 'supabase_kong_jarvis-home-test']) {
    const container = JSON.parse(execFileSync('docker', ['inspect', name]))[0];
    for (const bindings of Object.values(container.HostConfig.PortBindings)) {
      assert.ok(bindings.every(binding => binding.HostIp === '127.0.0.1'), 'Test services must bind only to loopback');
    }
  }
  return keys;
}

export function localAppEnvironment(keys) {
  const files = readdirSync(root).filter(name => /^\.env(?:\.|$)/.test(name) && name !== '.env.example');
  assert.equal(files.length, 0, 'Remove ambient env files from this test worktree before launching');
  const env = Object.fromEntries(['PATH','HOME','TMPDIR','LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  return { ...env, NEXT_PUBLIC_SUPABASE_URL: keys.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: keys.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: keys.SERVICE_ROLE_KEY, NEXT_TELEMETRY_DISABLED: '1', JARVIS_ISOLATED_TEST: '1',
    AI_CONTENT_STUDIO_MODE: 'dry_run', SOCIAL_INDIVIDUAL_PRODUCTION_MODE: 'dry_run', SOCIAL_PUBLISHING_MODE: 'dry_run' };
}
