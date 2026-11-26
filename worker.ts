import { httpServerHandler } from 'cloudflare:node';
import { env as workerEnv } from 'cloudflare:workers';
import { createPortalApp, type RuntimeEnv } from './src/server/createPortalApp.ts';

function readWorkerRuntimeEnv(): RuntimeEnv {
  const bindings = workerEnv as unknown as Record<string, unknown> | undefined;
  const pick = (key: string): string | undefined => {
    const fromBinding = bindings?.[key];
    if (typeof fromBinding === 'string' && fromBinding.trim().length > 0) {
      return fromBinding.trim();
    }
    const fromProcess = typeof process !== 'undefined' ? process.env?.[key] : undefined;
    if (typeof fromProcess === 'string' && fromProcess.trim().length > 0) {
      return fromProcess.trim();
    }
    return undefined;
  };

  return {
    SUPABASE_URL: pick('SUPABASE_URL'),
    SUPABASE_SECRET_KEY: pick('SUPABASE_SECRET_KEY'),
    ADMIN_PASSCODE: pick('ADMIN_PASSCODE'),
    SESSION_SECRET: pick('SESSION_SECRET'),
  };
}

const app = createPortalApp({
  runtime: 'cloudflare-worker',
  getEnv: readWorkerRuntimeEnv,
});

app.listen(3000);

export default httpServerHandler({ port: 3000 });
