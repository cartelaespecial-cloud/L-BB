import EventEmitter from 'node:events';
import { httpServerHandler } from 'cloudflare:node';
import { env as workerEnv } from 'cloudflare:workers';
import type { Express, NextFunction, Request, Response } from 'express';
import applicationProto from 'express/lib/application';
import requestProto from 'express/lib/request';
import responseProto from 'express/lib/response';
import { createPortalApp, type RuntimeEnv } from './src/server/createPortalApp.ts';

function applyOwnDescriptors(target: object, source: object): void {
  for (const name of Object.getOwnPropertyNames(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, name);
    if (descriptor) {
      Object.defineProperty(target, name, descriptor);
    }
  }
}

// Create Express app instance directly without loading express/lib/express.js -> body-parser -> iconv-lite
function createWorkerExpressApp(): Express {
  const app = ((req: Request, res: Response, next: NextFunction) => {
    (app as unknown as { handle: (r: Request, s: Response, n: NextFunction) => void }).handle(req, res, next);
  }) as unknown as Express & { init: () => void };

  applyOwnDescriptors(app, EventEmitter.prototype);
  applyOwnDescriptors(app, applicationProto);

  app.request = Object.create(requestProto, {
    app: { configurable: true, enumerable: true, writable: true, value: app },
  }) as Express['request'];

  app.response = Object.create(responseProto, {
    app: { configurable: true, enumerable: true, writable: true, value: app },
  }) as Express['response'];

  app.init();
  return app;
}

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
    DATA_ENCRYPTION_KEY: pick('DATA_ENCRYPTION_KEY'),
  };
}

const app = createPortalApp({
  app: createWorkerExpressApp(),
  runtime: 'cloudflare-worker',
  getEnv: readWorkerRuntimeEnv,
});

app.listen(3000);

export default httpServerHandler({ port: 3000 });
