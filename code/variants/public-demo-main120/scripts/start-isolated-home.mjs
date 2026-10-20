import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { localTestConfig, localAppEnvironment, root } from './isolated-home-config.mjs';

const config = localTestConfig();
const env = localAppEnvironment(config);
execFileSync('docker', ['exec','-i','supabase_db_jarvis-home-test','psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'], {
  input: readFileSync(root + 'scripts/isolated-home-seed.sql'), stdio: ['pipe','ignore','pipe'],
});
console.log('Isolated Home: http://127.0.0.1:3101 — synthetic local database only');
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3101'], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => app.kill(signal));
app.on('exit', code => process.exit(code ?? 1));
