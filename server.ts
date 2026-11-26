import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import type { ConsultaAdminRecord, ExchangeOption, SiteSettings } from './src/types.ts';

interface StoredLogo {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  base64: string;
  revision: number;
}

type StoredConsulta = ConsultaAdminRecord;

interface PortalDataPayload {
  settings: Omit<SiteSettings, 'brandLogoUrl' | 'passcodeManagedByEnv'>;
  logo: StoredLogo | null;
  consultas: StoredConsulta[];
  adminPasscodeHash?: string;
}

interface LocalStoreEnvelope {
  revision: number;
  data: PortalDataPayload;
}

class RevisionConflictError extends Error {
  constructor(message = 'Os dados foram atualizados por outra operação simultânea. Tente novamente.') {
    super(message);
    this.name = 'RevisionConflictError';
  }
}

class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigError';
  }
}

class StorageBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageBackendError';
  }
}

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');
const DEV_FALLBACK_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

// Initial scrypt hash used strictly in local development when ADMIN_PASSCODE is not configured
const INITIAL_LOCAL_ADMIN_HASH =
  '87e92f2d559cdd2391a399986e34f778:65713ac0b6e9fbbf9cbde0fa08719ba48a21fe86cc0c06300bf9eabbbad8485ff8f798f0aa69ba366693465211a6144f2ba4cbf131181fde6734e00ef5208e10';

const DEFAULT_EXCHANGE_OPTIONS: ExchangeOption[] = [
  {
    id: 'credito-fatura',
    title: 'Crédito em Fatura ou Desconto',
    description: 'Simulação de abatimento direto em compras participantes',
    rateLabel: '1.000 pts = R$ 50,00',
  },
  {
    id: 'vale-compras',
    title: 'Vale-Compras Digital',
    description: 'Simulação de voucher para lojas e parceiros credenciados',
    rateLabel: '1.000 pts = R$ 45,00',
  },
  {
    id: 'cashback-conta',
    title: 'Transferência para Conta',
    description: 'Simulação de conversão em saldo demonstrativo',
    rateLabel: '1.000 pts = R$ 40,00',
  },
];

const DEFAULT_CORE_SETTINGS: Omit<SiteSettings, 'brandLogoUrl' | 'passcodeManagedByEnv'> = {
  brandName: 'Portal de Pontos',
  heroTitle: 'Vamos verificar se você tem pontos disponíveis',
  heroSubtitle:
    'Explore a consulta demonstrativa com perfil fictício gerado automaticamente e simule a troca dos pontos por benefícios.',
  formHeading: 'Vamos trocar eles em pontos',
  pointsLabel: 'pontos ilustrativos',
  minPointsPreview: 1250,
  maxPointsPreview: 4850,
  exchangeOptions: DEFAULT_EXCHANGE_OPTIONS,
};

const FICTITIOUS_PROFILES = [
  'Ana Beatriz · Perfil Fictício',
  'Carlos Eduardo · Perfil Fictício',
  'Fernanda Costa · Perfil Fictício',
  'Rafael Mendes · Perfil Fictício',
  'Juliana Rocha · Perfil Fictício',
  'Marcos Vinícius · Perfil Fictício',
  'Patrícia Lima · Perfil Fictício',
  'Lucas Almeida · Perfil Fictício',
];

function getSupabaseConfig(): {
  enabled: boolean;
  restEndpoint: string;
  secretKey: string;
} {
  const urlRaw = process.env.SUPABASE_URL?.trim() || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() || '';

  if (!urlRaw && !secretKey) {
    return { enabled: false, restEndpoint: '', secretKey: '' };
  }

  if (!urlRaw || !secretKey) {
    throw new StorageConfigError(
      'Configuração do Supabase incompleta: defina SUPABASE_URL e SUPABASE_SECRET_KEY em Settings > Secrets.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(urlRaw);
  } catch {
    throw new StorageConfigError('SUPABASE_URL inválida. Verifique a URL configurada em Settings > Secrets.');
  }

  if (parsed.protocol !== 'https:') {
    throw new StorageConfigError('SUPABASE_URL deve utilizar o protocolo HTTPS.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '169.254.169.254' ||
    isPrivateIp(host)
  ) {
    throw new StorageConfigError('SUPABASE_URL aponta para um endereço de rede inválido.');
  }

  const baseOrigin = parsed.origin.replace(/\/+$/, '');
  return {
    enabled: true,
    restEndpoint: `${baseOrigin}/rest/v1/portal_store`,
    secretKey,
  };
}

function isPrivateIp(host: string): boolean {
  if (net.isIPv4(host)) {
    const parts = host.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 127) return true;
  }
  if (net.isIPv6(host)) {
    const lower = host.toLowerCase();
    if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
      return true;
    }
  }
  return false;
}

function isSupabaseModeActive(): boolean {
  const urlRaw = process.env.SUPABASE_URL?.trim() || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() || '';
  return Boolean(urlRaw || secretKey);
}

function getAdminAuthConfig(): {
  ready: boolean;
  error?: string;
  sessionSecret: string;
  envPasscode: string;
} {
  const supabaseActive = isSupabaseModeActive();
  const envPasscode = process.env.ADMIN_PASSCODE?.trim() || '';
  const envSessionSecret = process.env.SESSION_SECRET?.trim() || '';

  if (supabaseActive) {
    if (!envPasscode || !envSessionSecret) {
      return {
        ready: false,
        error:
          'Autenticação administrativa indisponível em modo Supabase: defina ADMIN_PASSCODE e SESSION_SECRET em Settings > Secrets.',
        sessionSecret: '',
        envPasscode: '',
      };
    }
    return {
      ready: true,
      sessionSecret: envSessionSecret,
      envPasscode,
    };
  }

  return {
    ready: true,
    sessionSecret: envSessionSecret || DEV_FALLBACK_SESSION_SECRET,
    envPasscode,
  };
}

function sanitizeConsultas(rawConsultas: unknown): StoredConsulta[] {
  if (!Array.isArray(rawConsultas)) return [];
  const clean: StoredConsulta[] = [];
  for (const item of rawConsultas) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    // Never read or migrate legacy CPF/PII entries
    if ('cpfDigits' in record || 'cpfFormatted' in record || 'cpf' in record) {
      continue;
    }
    if (
      typeof record.id !== 'string' ||
      typeof record.protocol !== 'string' ||
      typeof record.profileLabel !== 'string' ||
      typeof record.referenceCode !== 'string' ||
      typeof record.pointsAvailable !== 'number' ||
      (record.status !== 'consultado' && record.status !== 'troca_solicitada') ||
      typeof record.createdAt !== 'string'
    ) {
      continue;
    }
    clean.push({
      id: record.id,
      protocol: record.protocol,
      profileLabel: record.profileLabel,
      referenceCode: record.referenceCode,
      pointsAvailable: record.pointsAvailable,
      status: record.status,
      selectedOptionId: typeof record.selectedOptionId === 'string' ? record.selectedOptionId : null,
      selectedOptionTitle: typeof record.selectedOptionTitle === 'string' ? record.selectedOptionTitle : null,
      createdAt: record.createdAt,
      exchangedAt: typeof record.exchangedAt === 'string' ? record.exchangedAt : null,
    });
  }
  return clean.slice(0, 250);
}

function sanitizeLogo(rawLogo: unknown): StoredLogo | null {
  if (!rawLogo || typeof rawLogo !== 'object') return null;
  const logo = rawLogo as Record<string, unknown>;
  if (
    (logo.mime === 'image/png' || logo.mime === 'image/jpeg' || logo.mime === 'image/webp') &&
    typeof logo.base64 === 'string' &&
    logo.base64.length > 0 &&
    typeof logo.revision === 'number'
  ) {
    return {
      mime: logo.mime,
      base64: logo.base64,
      revision: logo.revision,
    };
  }
  return null;
}

function normalizePortalData(raw: unknown, includeLocalHash: boolean): PortalDataPayload {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawSettings =
    obj.settings && typeof obj.settings === 'object'
      ? (obj.settings as Record<string, unknown>)
      : {};

  const exchangeOptions =
    Array.isArray(rawSettings.exchangeOptions) && rawSettings.exchangeOptions.length > 0
      ? (rawSettings.exchangeOptions as ExchangeOption[])
      : DEFAULT_EXCHANGE_OPTIONS;

  const minPts =
    typeof rawSettings.minPointsPreview === 'number' && Number.isFinite(rawSettings.minPointsPreview)
      ? Math.max(100, Math.min(1000000, Math.round(rawSettings.minPointsPreview)))
      : DEFAULT_CORE_SETTINGS.minPointsPreview;

  const maxPts =
    typeof rawSettings.maxPointsPreview === 'number' && Number.isFinite(rawSettings.maxPointsPreview)
      ? Math.max(minPts, Math.min(1000000, Math.round(rawSettings.maxPointsPreview)))
      : Math.max(minPts, DEFAULT_CORE_SETTINGS.maxPointsPreview);

  const normalized: PortalDataPayload = {
    settings: {
      brandName:
        typeof rawSettings.brandName === 'string' && rawSettings.brandName.trim().length >= 2
          ? rawSettings.brandName.trim().slice(0, 60)
          : DEFAULT_CORE_SETTINGS.brandName,
      heroTitle:
        typeof rawSettings.heroTitle === 'string' && rawSettings.heroTitle.trim().length >= 4
          ? rawSettings.heroTitle.trim().slice(0, 120)
          : DEFAULT_CORE_SETTINGS.heroTitle,
      heroSubtitle:
        typeof rawSettings.heroSubtitle === 'string' && rawSettings.heroSubtitle.trim().length >= 4
          ? rawSettings.heroSubtitle.trim().slice(0, 260)
          : DEFAULT_CORE_SETTINGS.heroSubtitle,
      formHeading:
        typeof rawSettings.formHeading === 'string' && rawSettings.formHeading.trim().length >= 4
          ? rawSettings.formHeading.trim().slice(0, 100)
          : DEFAULT_CORE_SETTINGS.formHeading,
      pointsLabel:
        typeof rawSettings.pointsLabel === 'string' && rawSettings.pointsLabel.trim().length >= 2
          ? rawSettings.pointsLabel.trim().slice(0, 40)
          : DEFAULT_CORE_SETTINGS.pointsLabel,
      minPointsPreview: minPts,
      maxPointsPreview: maxPts,
      exchangeOptions,
    },
    logo: sanitizeLogo(obj.logo),
    consultas: sanitizeConsultas(obj.consultas),
  };

  if (includeLocalHash) {
    normalized.adminPasscodeHash =
      typeof obj.adminPasscodeHash === 'string' && obj.adminPasscodeHash.includes(':')
        ? obj.adminPasscodeHash
        : INITIAL_LOCAL_ADMIN_HASH;
  }

  return normalized;
}

function ensureLocalDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readLocalEnvelope(): LocalStoreEnvelope {
  ensureLocalDir();
  if (!fs.existsSync(STORE_PATH)) {
    const initial: LocalStoreEnvelope = {
      revision: 1,
      data: normalizePortalData({}, true),
    };
    writeLocalEnvelope(initial);
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
    // Upgrade legacy local structure safely without migrating any CPF/PII entries
    const cleanEnvelope: LocalStoreEnvelope = {
      revision: 1,
      data: normalizePortalData(parsed, true),
    };
    writeLocalEnvelope(cleanEnvelope);
    return cleanEnvelope;
  } catch {
    const fallback: LocalStoreEnvelope = {
      revision: 1,
      data: normalizePortalData({}, true),
    };
    writeLocalEnvelope(fallback);
    return fallback;
  }
}

function writeLocalEnvelope(envelope: LocalStoreEnvelope): void {
  ensureLocalDir();
  const tmpPath = `${STORE_PATH}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(envelope, null, 2), 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

function buildSupabaseHeaders(secretKey: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: secretKey,
    ...extra,
  };
  // Legacy service_role keys are JWTs (3 dot-separated segments); modern sb_secret_ keys must not be sent as Bearer JWTs
  if (secretKey.split('.').length === 3) {
    headers.Authorization = `Bearer ${secretKey}`;
  }
  return headers;
}

async function extractSafeSupabaseError(response: globalThis.Response): Promise<string> {
  try {
    const raw = await response.text();
    const parsed = JSON.parse(raw) as { message?: unknown; code?: unknown; hint?: unknown };
    const msg = typeof parsed.message === 'string' ? parsed.message : '';
    const code = typeof parsed.code === 'string' ? parsed.code : '';
    const details = [code, msg].filter(Boolean).join(': ');
    return details ? ` (${details})` : '';
  } catch {
    return '';
  }
}

async function readPortalState(): Promise<{ revision: number; data: PortalDataPayload }> {
  const sb = getSupabaseConfig();
  if (!sb.enabled) {
    return readLocalEnvelope();
  }

  let response: globalThis.Response;
  try {
    response = await fetch(`${sb.restEndpoint}?id=eq.1&select=id,revision,data`, {
      method: 'GET',
      headers: buildSupabaseHeaders(sb.secretKey, {
        Accept: 'application/json',
      }),
    });
  } catch {
    throw new StorageBackendError('Não foi possível conectar ao serviço Supabase configurado.');
  }

  if (!response.ok) {
    const detail = await extractSafeSupabaseError(response);
    throw new StorageBackendError(
      `Falha ao consultar armazenamento Supabase (HTTP ${response.status})${detail}.`,
    );
  }

  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new StorageBackendError('Resposta inválida recebida do Supabase.');
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new StorageBackendError(
      'Linha id=1 não encontrada na tabela public.portal_store do Supabase.',
    );
  }

  const row = rows[0] as { id?: unknown; revision?: unknown; data?: unknown };
  const revision = Number(row.revision);
  if (!Number.isFinite(revision)) {
    throw new StorageBackendError('Campo revision inválido no registro id=1 do Supabase.');
  }

  return {
    revision,
    data: normalizePortalData(row.data, false),
  };
}

async function mutatePortalState<T>(
  mutator: (data: PortalDataPayload) => { nextData: PortalDataPayload; result: T },
): Promise<{ revision: number; data: PortalDataPayload; result: T }> {
  const sb = getSupabaseConfig();
  const current = await readPortalState();
  const { nextData, result } = mutator(structuredClone(current.data));

  if (!sb.enabled) {
    const latestOnDisk = readLocalEnvelope();
    if (latestOnDisk.revision !== current.revision) {
      throw new RevisionConflictError();
    }
    const nextRevision = current.revision + 1;
    writeLocalEnvelope({ revision: nextRevision, data: nextData });
    return { revision: nextRevision, data: nextData, result };
  }

  // Strip local-only hash before writing to Supabase
  const { adminPasscodeHash: _unusedHash, ...supabaseData } = nextData;

  let response: globalThis.Response;
  try {
    response = await fetch(
      `${sb.restEndpoint}?id=eq.1&revision=eq.${encodeURIComponent(String(current.revision))}`,
      {
        method: 'PATCH',
        headers: buildSupabaseHeaders(sb.secretKey, {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        }),
        body: JSON.stringify({
          revision: current.revision + 1,
          data: supabaseData,
        }),
      },
    );
  } catch {
    throw new StorageBackendError('Erro de rede ao salvar dados no Supabase.');
  }

  if (!response.ok) {
    const detail = await extractSafeSupabaseError(response);
    throw new StorageBackendError(
      `Falha ao persistir dados no Supabase (HTTP ${response.status})${detail}.`,
    );
  }

  let updatedRows: unknown;
  try {
    updatedRows = await response.json();
  } catch {
    throw new StorageBackendError('Resposta inválida ao confirmar atualização no Supabase.');
  }

  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    throw new RevisionConflictError();
  }

  const updated = updatedRows[0] as { revision?: unknown };
  const nextRevision = Number(updated.revision ?? current.revision + 1);
  return { revision: nextRevision, data: nextData, result };
}

function toPublicSettings(data: PortalDataPayload): SiteSettings {
  return {
    ...data.settings,
    brandLogoUrl: data.logo ? `/api/logo?v=${data.logo.revision}` : null,
    passcodeManagedByEnv: isSupabaseModeActive() || Boolean(process.env.ADMIN_PASSCODE?.trim()),
  };
}

function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasscode(candidate: string, data: PortalDataPayload, envPasscode: string): boolean {
  if (envPasscode && envPasscode.length > 0) {
    const a = crypto.createHash('sha256').update(candidate).digest();
    const b = crypto.createHash('sha256').update(envPasscode).digest();
    return crypto.timingSafeEqual(a, b);
  }

  if (isSupabaseModeActive()) {
    return false;
  }

  const stored = data.adminPasscodeHash || INITIAL_LOCAL_ADMIN_HASH;
  const [salt, storedHex] = stored.split(':');
  if (!salt || !storedHex) return false;
  const derived = crypto.scryptSync(candidate, salt, 64);
  const storedBuf = Buffer.from(storedHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function signToken(payload: Record<string, unknown>, ttlSeconds: number, secret: string): string {
  const fullPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string, secret: string): Record<string, unknown> | null {
  if (!secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as Record<string, unknown>;
    if (typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authCfg = getAdminAuthConfig();
  if (!authCfg.ready) {
    res.status(503).json({ error: authCfg.error });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Autenticação necessária.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyToken(token, authCfg.sessionSecret);
  if (!payload || payload.role !== 'admin') {
    res.status(401).json({ error: 'Sessão expirada ou inválida. Entre novamente.' });
    return;
  }
  next();
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || record.resetAt < now) {
    loginAttempts.set(ip, { count: 0, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  return record.count < 15;
}

function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || record.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    record.count += 1;
  }
}

function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

function generateIllustrativePoints(minPts: number, maxPts: number): number {
  const min = Math.max(100, Math.min(minPts, maxPts));
  const max = Math.max(min, maxPts);
  const raw = min === max ? min : crypto.randomInt(min, max + 1);
  return Math.round(raw / 10) * 10;
}

function detectImageType(buffer: Buffer): { ext: 'png' | 'jpg' | 'webp'; mime: 'image/png' | 'image/jpeg' | 'image/webp' } | null {
  if (buffer.length < 12) return null;
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

function hasDisallowedPersonalPayload(body: unknown): boolean {
  if (body === undefined || body === null) return false;
  if (typeof body !== 'object' || Array.isArray(body)) return true;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return false;
  return true;
}

function sendErrorResponse(res: Response, err: unknown): void {
  if (err instanceof RevisionConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof StorageConfigError) {
    res.status(503).json({ error: err.message });
    return;
  }
  if (err instanceof StorageBackendError) {
    res.status(502).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2.5mb' }));

  // Initialize local store only when Supabase is not configured
  if (!isSupabaseModeActive()) {
    readLocalEnvelope();
  }

  // Public settings
  app.get('/api/settings', async (_req, res) => {
    try {
      const { data } = await readPortalState();
      res.json(toPublicSettings(data));
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Serve persisted logo safely from store
  app.get('/api/logo', async (_req, res) => {
    try {
      const { data } = await readPortalState();
      if (!data.logo) {
        res.status(404).json({ error: 'Logo não configurada.' });
        return;
      }
      const buffer = Buffer.from(data.logo.base64, 'base64');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', data.logo.mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Public illustrative points consultation (rejects any personal data, generates server-side fictitious profile)
  app.post('/api/consultas', async (req, res) => {
    if (hasDisallowedPersonalPayload(req.body)) {
      res.status(400).json({
        error:
          'Dados pessoais como nome, CPF, e-mail ou telefone não são aceitos nesta consulta. O perfil ilustrativo é gerado automaticamente no servidor.',
      });
      return;
    }

    try {
      const id = crypto.randomUUID();
      const protocol = `IL-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
      const profileLabel = FICTITIOUS_PROFILES[crypto.randomInt(0, FICTITIOUS_PROFILES.length)];
      const referenceCode = `SIM-${crypto.randomInt(100000, 999999)}`;
      const createdAt = new Date().toISOString();

      const { result: created } = await mutatePortalState((data) => {
        const pointsAvailable = generateIllustrativePoints(
          data.settings.minPointsPreview,
          data.settings.maxPointsPreview,
        );

        const record: StoredConsulta = {
          id,
          protocol,
          profileLabel,
          referenceCode,
          pointsAvailable,
          status: 'consultado',
          selectedOptionId: null,
          selectedOptionTitle: null,
          createdAt,
          exchangedAt: null,
        };

        const nextConsultas = [record, ...data.consultas].slice(0, 250);
        return {
          nextData: { ...data, consultas: nextConsultas },
          result: record,
        };
      });

      const claimSecret = process.env.SESSION_SECRET?.trim() || DEV_FALLBACK_SESSION_SECRET;
      const claimToken = signToken({ role: 'claim', consultaId: created.id }, 3600, claimSecret);

      res.status(201).json({
        id: created.id,
        protocol: created.protocol,
        profileLabel: created.profileLabel,
        referenceCode: created.referenceCode,
        pointsAvailable: created.pointsAvailable,
        status: created.status,
        selectedOptionTitle: created.selectedOptionTitle,
        createdAt: created.createdAt,
        exchangedAt: created.exchangedAt,
        claimToken,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Confirm simulated exchange for a generated consultation
  app.patch('/api/consultas/:id/trocar', async (req, res) => {
    const { id } = req.params;
    const body = req.body as { optionId?: unknown; claimToken?: unknown };
    if (typeof body.claimToken !== 'string' || typeof body.optionId !== 'string') {
      res.status(400).json({ error: 'Dados da solicitação incompletos.' });
      return;
    }

    const claimSecret = process.env.SESSION_SECRET?.trim() || DEV_FALLBACK_SESSION_SECRET;
    const tokenData = verifyToken(body.claimToken, claimSecret);
    if (!tokenData || tokenData.role !== 'claim' || tokenData.consultaId !== id) {
      res.status(403).json({ error: 'Sessão da consulta inválida ou expirada. Gere uma nova consulta.' });
      return;
    }

    try {
      const outcome = await mutatePortalState<{
        errorStatus?: number;
        errorMessage?: string;
        record?: StoredConsulta;
      }>((data) => {
        const option = data.settings.exchangeOptions.find((opt) => opt.id === body.optionId);
        if (!option) {
          return {
            nextData: data,
            result: { errorStatus: 400, errorMessage: 'Opção de troca inválida.' },
          };
        }

        const idx = data.consultas.findIndex((c) => c.id === id);
        if (idx === -1) {
          return {
            nextData: data,
            result: { errorStatus: 404, errorMessage: 'Consulta não encontrada.' },
          };
        }

        const updatedRecord: StoredConsulta = {
          ...data.consultas[idx],
          status: 'troca_solicitada',
          selectedOptionId: option.id,
          selectedOptionTitle: option.title,
          exchangedAt: new Date().toISOString(),
        };

        const nextConsultas = [...data.consultas];
        nextConsultas[idx] = updatedRecord;

        return {
          nextData: { ...data, consultas: nextConsultas },
          result: { record: updatedRecord },
        };
      });

      if (outcome.result.errorStatus) {
        res.status(outcome.result.errorStatus).json({ error: outcome.result.errorMessage });
        return;
      }

      const updated = outcome.result.record!;
      res.json({
        id: updated.id,
        protocol: updated.protocol,
        profileLabel: updated.profileLabel,
        referenceCode: updated.referenceCode,
        pointsAvailable: updated.pointsAvailable,
        status: updated.status,
        selectedOptionTitle: updated.selectedOptionTitle,
        createdAt: updated.createdAt,
        exchangedAt: updated.exchangedAt,
        claimToken: body.claimToken,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin login
  app.post('/api/admin/login', async (req, res) => {
    const authCfg = getAdminAuthConfig();
    if (!authCfg.ready) {
      res.status(503).json({ error: authCfg.error });
      return;
    }

    const ip = req.ip || 'unknown';
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Muitas tentativas incorretas. Aguarde alguns minutos.' });
      return;
    }

    const body = req.body as { passcode?: unknown };
    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
    if (!passcode) {
      res.status(400).json({ error: 'Informe a senha de acesso.' });
      return;
    }

    try {
      const { data } = await readPortalState();
      if (!verifyPasscode(passcode, data, authCfg.envPasscode)) {
        recordFailedLogin(ip);
        res.status(401).json({ error: 'Senha incorreta. Tente novamente.' });
        return;
      }

      clearLoginAttempts(ip);
      const token = signToken({ role: 'admin' }, 60 * 60 * 8, authCfg.sessionSecret);
      res.json({ token, expiresInSeconds: 60 * 60 * 8 });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin session check
  app.get('/api/admin/verify', requireAdminAuth, (_req, res) => {
    res.json({ authenticated: true });
  });

  // Admin update branding & form settings
  app.put('/api/admin/settings', requireAdminAuth, async (req, res) => {
    const body = req.body as Partial<SiteSettings>;
    if (typeof body.brandName === 'string' && body.brandName.trim().length < 2) {
      res.status(400).json({ error: 'O nome personalizado deve ter pelo menos 2 caracteres.' });
      return;
    }

    try {
      const { data } = await mutatePortalState((current) => {
        const brandName =
          typeof body.brandName === 'string'
            ? body.brandName.trim().slice(0, 60)
            : current.settings.brandName;

        const heroTitle =
          typeof body.heroTitle === 'string' && body.heroTitle.trim().length >= 4
            ? body.heroTitle.trim().slice(0, 120)
            : current.settings.heroTitle;

        const heroSubtitle =
          typeof body.heroSubtitle === 'string' && body.heroSubtitle.trim().length >= 4
            ? body.heroSubtitle.trim().slice(0, 260)
            : current.settings.heroSubtitle;

        const formHeading =
          typeof body.formHeading === 'string' && body.formHeading.trim().length >= 4
            ? body.formHeading.trim().slice(0, 100)
            : current.settings.formHeading;

        const pointsLabel =
          typeof body.pointsLabel === 'string' && body.pointsLabel.trim().length >= 2
            ? body.pointsLabel.trim().slice(0, 40)
            : current.settings.pointsLabel;

        let minPointsPreview = current.settings.minPointsPreview;
        let maxPointsPreview = current.settings.maxPointsPreview;
        if (typeof body.minPointsPreview === 'number' && Number.isFinite(body.minPointsPreview)) {
          minPointsPreview = Math.max(100, Math.min(1000000, Math.round(body.minPointsPreview)));
        }
        if (typeof body.maxPointsPreview === 'number' && Number.isFinite(body.maxPointsPreview)) {
          maxPointsPreview = Math.max(minPointsPreview, Math.min(1000000, Math.round(body.maxPointsPreview)));
        }

        const nextData: PortalDataPayload = {
          ...current,
          settings: {
            ...current.settings,
            brandName,
            heroTitle,
            heroSubtitle,
            formHeading,
            pointsLabel,
            minPointsPreview,
            maxPointsPreview,
          },
        };
        return { nextData, result: null };
      });

      res.json(toPublicSettings(data));
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin upload custom logo (stored inside portal_store.data with magic-byte verification)
  app.post('/api/admin/logo', requireAdminAuth, async (req, res) => {
    const body = req.body as { dataUrl?: unknown };
    if (typeof body.dataUrl !== 'string') {
      res.status(400).json({ error: 'Envie uma imagem válida.' });
      return;
    }

    const match = body.dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({ error: 'Formato não suportado. Use PNG, JPG ou WEBP.' });
      return;
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > 1.5 * 1024 * 1024) {
      res.status(400).json({ error: 'A imagem deve ter no máximo 1,5 MB.' });
      return;
    }

    const detected = detectImageType(buffer);
    if (!detected) {
      res.status(400).json({ error: 'Arquivo de imagem inválido ou corrompido.' });
      return;
    }

    try {
      const nextLogo: StoredLogo = {
        mime: detected.mime,
        base64: buffer.toString('base64'),
        revision: Date.now(),
      };

      const { data } = await mutatePortalState((current) => ({
        nextData: { ...current, logo: nextLogo },
        result: null,
      }));

      const publicSettings = toPublicSettings(data);
      res.json({ brandLogoUrl: publicSettings.brandLogoUrl, settings: publicSettings });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin remove custom logo
  app.delete('/api/admin/logo', requireAdminAuth, async (_req, res) => {
    try {
      const { data } = await mutatePortalState((current) => ({
        nextData: { ...current, logo: null },
        result: null,
      }));
      const publicSettings = toPublicSettings(data);
      res.json({ brandLogoUrl: null, settings: publicSettings });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin change passcode (local dev only when ADMIN_PASSCODE env is not set)
  app.put('/api/admin/passcode', requireAdminAuth, async (req, res) => {
    if (isSupabaseModeActive() || process.env.ADMIN_PASSCODE?.trim()) {
      res.status(400).json({
        error: 'A senha é gerenciada pela variável de ambiente ADMIN_PASSCODE em Settings > Secrets.',
      });
      return;
    }

    const body = req.body as { currentPasscode?: unknown; newPasscode?: unknown };
    const currentPasscode = typeof body.currentPasscode === 'string' ? body.currentPasscode.trim() : '';
    const newPasscode = typeof body.newPasscode === 'string' ? body.newPasscode.trim() : '';

    if (newPasscode.length < 4 || newPasscode.length > 64) {
      res.status(400).json({ error: 'A nova senha deve ter entre 4 e 64 caracteres.' });
      return;
    }

    try {
      const outcome = await mutatePortalState<{ ok: boolean }>((current) => {
        if (!verifyPasscode(currentPasscode, current, '')) {
          return { nextData: current, result: { ok: false } };
        }
        return {
          nextData: { ...current, adminPasscodeHash: hashPasscode(newPasscode) },
          result: { ok: true },
        };
      });

      if (!outcome.result.ok) {
        res.status(400).json({ error: 'Senha atual incorreta.' });
        return;
      }

      res.json({ updated: true });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin list consultations
  app.get('/api/admin/consultas', requireAdminAuth, async (_req, res) => {
    try {
      const { data } = await readPortalState();
      res.json({ consultas: data.consultas });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin delete consultation
  app.delete('/api/admin/consultas/:id', requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const outcome = await mutatePortalState<{ deleted: boolean }>((current) => {
        const nextList = current.consultas.filter((c) => c.id !== id);
        if (nextList.length === current.consultas.length) {
          return { nextData: current, result: { deleted: false } };
        }
        return {
          nextData: { ...current, consultas: nextList },
          result: { deleted: true },
        };
      });

      if (!outcome.result.deleted) {
        res.status(404).json({ error: 'Registro não encontrado.' });
        return;
      }

      res.json({ deleted: true });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // JSON 404 for unmatched /api/* routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
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
