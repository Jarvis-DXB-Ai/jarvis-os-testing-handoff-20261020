// The Mac pilot is an explicit production mode, separate from test/provider flags.
export function privateMacPilotEnabled(env = process.env, platform = process.platform) {
  if (platform !== 'darwin' || env.NODE_ENV !== 'production'
    || env.JARVIS_PRIVATE_MAC_PILOT !== '1' || env.JARVIS_ISOLATED_TEST === '1'
    || env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:55421'
    || env.JARVIS_PRIVATE_ORIGIN_AUTH !== 'cloudflare_access'
    || !env.JARVIS_ACCESS_AUDIENCE || !env.JARVIS_OWNER_EMAILS
    || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.JARVIS_ACCESS_TEAM_DOMAIN ?? '')) return false;
  try {
    const url = new URL(env.JARVIS_RUNTIME_WORKER_ORIGIN);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.pathname === '/' && !url.search && !url.hash
      && /^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname);
  } catch { return false; }
}

export function localOfficeEnabled(env = process.env, platform = process.platform) {
  return (env.NODE_ENV === 'development' && env.JARVIS_ISOLATED_TEST === '1')
    || privateMacPilotEnabled(env, platform);
}

export function officeLocalOrigin(env = process.env) {
  const value=env.JARVIS_OFFICE_LOCAL_URL ?? 'http://127.0.0.1:3101';
  if(!['http://127.0.0.1:3101','http://127.0.0.1:3103'].includes(value))throw new Error('Office coordinator must use its registered loopback runtime.');
  return value;
}

export function coordinatorWorkerEnvironment(env = process.env, platform = process.platform) {
  return {...Object.fromEntries(['HOME','PATH','TMPDIR','LANG','USER','LOGNAME','SHELL'].filter(k=>env[k]).map(k=>[k,env[k]])),JARVIS_OFFICE_LOCAL_URL:privateMacPilotEnabled(env,platform)?'http://127.0.0.1:3103':'http://127.0.0.1:3101'};
}
