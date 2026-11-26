import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  createPortalApp,
  normalizePortalData,
  RevisionConflictError,
  type LocalStoreAdapter,
  type LocalStoreEnvelope,
  type PortalDataPayload,
} from './src/server/createPortalApp.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');

function createLocalStoreAdapter(): LocalStoreAdapter {
  const ensureDir = () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  };

  const writeAtomic = (envelope: LocalStoreEnvelope) => {
    ensureDir();
    const tmpPath = `${STORE_PATH}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(envelope, null, 2), 'utf-8');
    fs.renameSync(tmpPath, STORE_PATH);
  };

  const read = (): LocalStoreEnvelope => {
    ensureDir();
    if (!fs.existsSync(STORE_PATH)) {
      const initial: LocalStoreEnvelope = {
        revision: 1,
        data: normalizePortalData({}, true),
      };
      writeAtomic(initial);
      return initial;
    }

    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<LocalStoreEnvelope & PortalDataPayload>;
      if (typeof parsed.revision === 'number' && parsed.data && typeof parsed.data === 'object') {
        return {
          revision: parsed.revision,
          data: normalizePortalData(parsed.data, true),
        };
      }
      const cleanEnvelope: LocalStoreEnvelope = {
        revision: 1,
        data: normalizePortalData(parsed, true),
      };
      writeAtomic(cleanEnvelope);
      return cleanEnvelope;
    } catch {
      const fallback: LocalStoreEnvelope = {
        revision: 1,
        data: normalizePortalData({}, true),
      };
      writeAtomic(fallback);
      return fallback;
    }
  };

  const write = (expectedRevision: number, nextData: PortalDataPayload): number => {
    const latest = read();
    if (latest.revision !== expectedRevision) {
      throw new RevisionConflictError();
    }
    const nextRevision = expectedRevision + 1;
    writeAtomic({ revision: nextRevision, data: nextData });
    return nextRevision;
  };

  return { read, write };
}

async function startServer(): Promise<void> {
  const app = createPortalApp({
    app: express(),
    runtime: 'node',
    getEnv: () => process.env,
    jsonParser: express.json({ limit: '4mb' }),
    localStore: createLocalStoreAdapter(),
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
