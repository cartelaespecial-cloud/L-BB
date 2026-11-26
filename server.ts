import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import type { ConsultaAdminRecord, ExchangeOption, SiteSettings } from './src/types.ts';
import { formatCpf, isValidCpf, isValidFullName, maskCpf, stripNonDigits } from './src/utils/cpf.ts';

interface StoredConsulta extends ConsultaAdminRecord {
  cpfDigits: string;
}

interface StoreData {
  adminPasscodeHash: string;
  settings: SiteSettings;
  consultas: StoredConsulta[];
}

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');
const SESSION_SECRET = process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

// Initial scrypt hash for the requested initial admin passcode (overridable via ADMIN_PASSCODE env or /painel)
const INITIAL_ADMIN_HASH =
  '87e92f2d559cdd2391a399986e34f778:65713ac0b6e9fbbf9cbde0fa08719ba48a21fe86cc0c06300bf9eabbbad8485ff8f798f0aa69ba366693465211a6144f2ba4cbf131181fde6734e00ef5208e10';

const DEFAULT_EXCHANGE_OPTIONS: ExchangeOption[] = [
  {
    id: 'credito-fatura',
    title: 'Crédito em Fatura ou Desconto',
    description: 'Abatimento direto em compras e faturas participantes',
    rateLabel: '1.000 pts = R$ 50,00',
  },
  {
    id: 'vale-compras',
    title: 'Vale-Compras Digital',
    description: 'Voucher imediato para lojas e parceiros credenciados',
    rateLabel: '1.000 pts = R$ 45,00',
  },
  {
    id: 'cashback-conta',
    title: 'Transferência para Conta',
    description: 'Conversão em saldo disponível via chave cadastrada',
    rateLabel: '1.000 pts = R$ 40,00',
  },
];

const DEFAULT_SETTINGS: SiteSettings = {
  brandName: 'Portal de Pontos',
  brandLogoUrl: null,
  heroTitle: 'Vamos verificar se você tem pontos disponíveis',
  heroSubtitle:
    'Consulte agora seu saldo vinculado ao CPF e solicite a troca dos seus pontos por benefícios, créditos ou descontos.',
  formHeading: 'Vamos trocar eles em pontos',
  pointsLabel: 'pontos disponíveis',
  minPointsPreview: 1250,
  maxPointsPreview: 4850,
  exchangeOptions: DEFAULT_EXCHANGE_OPTIONS,
};

function ensureDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function loadStore(): StoreData {
  ensureDirs();
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreData = {
      adminPasscodeHash: INITIAL_ADMIN_HASH,
      settings: DEFAULT_SETTINGS,
      consultas: [],
    };
    saveStore(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      adminPasscodeHash:
        typeof parsed.adminPasscodeHash === 'string' && parsed.adminPasscodeHash.includes(':')
          ? parsed.adminPasscodeHash
          : INITIAL_ADMIN_HASH,
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings || {}),
        exchangeOptions:
          Array.isArray(parsed.settings?.exchangeOptions) && parsed.settings.exchangeOptions.length > 0
            ? parsed.settings.exchangeOptions
            : DEFAULT_EXCHANGE_OPTIONS,
      },
      consultas: Array.isArray(parsed.consultas) ? parsed.consultas : [],
    };
  } catch {
    const fallback: StoreData = {
      adminPasscodeHash: INITIAL_ADMIN_HASH,
      settings: DEFAULT_SETTINGS,
      consultas: [],
    };
    saveStore(fallback);
    return fallback;
  }
}

function saveStore(data: StoreData): void {
  ensureDirs();
  const tmpPath = `${STORE_PATH}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasscode(candidate: string, store: StoreData): boolean {
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  if (envPasscode && envPasscode.length > 0) {
    const a = crypto.createHash('sha256').update(candidate).digest();
    const b = crypto.createHash('sha256').update(envPasscode).digest();
    return crypto.timingSafeEqual(a, b);
  }

  const [salt, storedHex] = store.adminPasscodeHash.split(':');
  if (!salt || !storedHex) return false;
  const derived = crypto.scryptSync(candidate, salt, 64);
  const storedBuf = Buffer.from(storedHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function signToken(payload: Record<string, unknown>, ttlSeconds: number): string {
  const fullPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
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
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Autenticação necessária.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
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

function computeDeterministicPoints(cpfDigits: string, minPts: number, maxPts: number): number {
  const min = Math.max(100, Math.min(minPts, maxPts));
  const max = Math.max(min, maxPts);
  const digest = crypto.createHash('sha256').update(cpfDigits).digest();
  const num = digest.readUInt32BE(0);
  const raw = min + (num % (max - min + 1));
  return Math.round(raw / 10) * 10;
}

function detectImageType(buffer: Buffer): { ext: 'png' | 'jpg' | 'webp'; mime: string } | null {
  if (buffer.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
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
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

function removeOldLogoIfManaged(logoUrl: string | null): void {
  if (!logoUrl || !logoUrl.startsWith('/api/uploads/')) return;
  const filename = path.basename(logoUrl);
  if (!/^[0-9a-f-]+\.(png|jpg|webp)$/i.test(filename)) return;
  const resolved = path.resolve(UPLOADS_DIR, filename);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return;
  if (fs.existsSync(resolved)) {
    try {
      fs.unlinkSync(resolved);
    } catch {
      // Ignore cleanup failures
    }
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  // Initialize store on boot
  loadStore();

  // Public settings
  app.get('/api/settings', (_req, res) => {
    const store = loadStore();
    res.json(store.settings);
  });

  // Safe uploaded logo serving
  app.get('/api/uploads/:filename', (req, res) => {
    const { filename } = req.params;
    if (!/^[0-9a-f-]+\.(png|jpg|webp)$/i.test(filename)) {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
      return;
    }
    const resolved = path.resolve(UPLOADS_DIR, filename);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(resolved);
  });

  // Public points consultation submission (strict server-side name & CPF validation)
  app.post('/api/consultas', (req, res) => {
    const body = req.body as { fullName?: unknown; cpf?: unknown };
    const fullNameRaw = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
    const cpfRaw = typeof body.cpf === 'string' ? body.cpf : '';

    if (!isValidFullName(fullNameRaw)) {
      res.status(400).json({ error: 'Informe seu nome completo (nome e sobrenome).' });
      return;
    }

    if (!isValidCpf(cpfRaw)) {
      res.status(400).json({ error: 'CPF inválido. Informe um CPF válido com 11 dígitos.' });
      return;
    }

    const cpfDigits = stripNonDigits(cpfRaw);
    const store = loadStore();

    const id = crypto.randomUUID();
    const protocol = `PT-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
    const pointsAvailable = computeDeterministicPoints(
      cpfDigits,
      store.settings.minPointsPreview,
      store.settings.maxPointsPreview,
    );

    const record: StoredConsulta = {
      id,
      protocol,
      fullName: fullNameRaw,
      cpfDigits,
      cpfFormatted: formatCpf(cpfDigits),
      pointsAvailable,
      status: 'consultado',
      selectedOptionId: null,
      selectedOptionTitle: null,
      createdAt: new Date().toISOString(),
      exchangedAt: null,
    };

    store.consultas.unshift(record);
    if (store.consultas.length > 500) {
      store.consultas = store.consultas.slice(0, 500);
    }
    saveStore(store);

    const claimToken = signToken({ role: 'claim', consultaId: id }, 3600);

    res.status(201).json({
      id: record.id,
      protocol: record.protocol,
      fullName: record.fullName,
      maskedCpf: maskCpf(cpfDigits),
      pointsAvailable: record.pointsAvailable,
      status: record.status,
      selectedOptionTitle: record.selectedOptionTitle,
      createdAt: record.createdAt,
      exchangedAt: record.exchangedAt,
      claimToken,
    });
  });

  // Confirm exchange for a verified consultation
  app.patch('/api/consultas/:id/trocar', (req, res) => {
    const { id } = req.params;
    const body = req.body as { optionId?: unknown; claimToken?: unknown };
    if (typeof body.claimToken !== 'string' || typeof body.optionId !== 'string') {
      res.status(400).json({ error: 'Dados da solicitação incompletos.' });
      return;
    }

    const tokenData = verifyToken(body.claimToken);
    if (!tokenData || tokenData.role !== 'claim' || tokenData.consultaId !== id) {
      res.status(403).json({ error: 'Sessão de consulta inválida ou expirada. Consulte novamente.' });
      return;
    }

    const store = loadStore();
    const option = store.settings.exchangeOptions.find((opt) => opt.id === body.optionId);
    if (!option) {
      res.status(400).json({ error: 'Opção de troca inválida.' });
      return;
    }

    const target = store.consultas.find((c) => c.id === id);
    if (!target) {
      res.status(404).json({ error: 'Consulta não encontrada.' });
      return;
    }

    target.status = 'troca_solicitada';
    target.selectedOptionId = option.id;
    target.selectedOptionTitle = option.title;
    target.exchangedAt = new Date().toISOString();
    saveStore(store);

    res.json({
      id: target.id,
      protocol: target.protocol,
      fullName: target.fullName,
      maskedCpf: maskCpf(target.cpfDigits),
      pointsAvailable: target.pointsAvailable,
      status: target.status,
      selectedOptionTitle: target.selectedOptionTitle,
      createdAt: target.createdAt,
      exchangedAt: target.exchangedAt,
      claimToken: body.claimToken,
    });
  });

  // Admin login
  app.post('/api/admin/login', (req, res) => {
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

    const store = loadStore();
    if (!verifyPasscode(passcode, store)) {
      recordFailedLogin(ip);
      res.status(401).json({ error: 'Senha incorreta. Tente novamente.' });
      return;
    }

    clearLoginAttempts(ip);
    const token = signToken({ role: 'admin' }, 60 * 60 * 8);
    res.json({ token, expiresInSeconds: 60 * 60 * 8 });
  });

  // Admin session check
  app.get('/api/admin/verify', requireAdminAuth, (_req, res) => {
    res.json({ authenticated: true });
  });

  // Admin update branding & form settings
  app.put('/api/admin/settings', requireAdminAuth, (req, res) => {
    const body = req.body as Partial<SiteSettings>;
    const store = loadStore();

    const brandName =
      typeof body.brandName === 'string' ? body.brandName.trim().slice(0, 60) : store.settings.brandName;
    if (brandName.length < 2) {
      res.status(400).json({ error: 'O nome personalizado deve ter pelo menos 2 caracteres.' });
      return;
    }

    const heroTitle =
      typeof body.heroTitle === 'string' && body.heroTitle.trim().length >= 4
        ? body.heroTitle.trim().slice(0, 120)
        : store.settings.heroTitle;

    const heroSubtitle =
      typeof body.heroSubtitle === 'string' && body.heroSubtitle.trim().length >= 4
        ? body.heroSubtitle.trim().slice(0, 260)
        : store.settings.heroSubtitle;

    const formHeading =
      typeof body.formHeading === 'string' && body.formHeading.trim().length >= 4
        ? body.formHeading.trim().slice(0, 100)
        : store.settings.formHeading;

    const pointsLabel =
      typeof body.pointsLabel === 'string' && body.pointsLabel.trim().length >= 2
        ? body.pointsLabel.trim().slice(0, 40)
        : store.settings.pointsLabel;

    let minPointsPreview = store.settings.minPointsPreview;
    let maxPointsPreview = store.settings.maxPointsPreview;
    if (typeof body.minPointsPreview === 'number' && Number.isFinite(body.minPointsPreview)) {
      minPointsPreview = Math.max(100, Math.min(1000000, Math.round(body.minPointsPreview)));
    }
    if (typeof body.maxPointsPreview === 'number' && Number.isFinite(body.maxPointsPreview)) {
      maxPointsPreview = Math.max(minPointsPreview, Math.min(1000000, Math.round(body.maxPointsPreview)));
    }

    store.settings = {
      ...store.settings,
      brandName,
      heroTitle,
      heroSubtitle,
      formHeading,
      pointsLabel,
      minPointsPreview,
      maxPointsPreview,
    };

    saveStore(store);
    res.json(store.settings);
  });

  // Admin upload custom logo (validated base64 dataUrl with magic byte verification)
  app.post('/api/admin/logo', requireAdminAuth, (req, res) => {
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
    if (buffer.length === 0 || buffer.length > 2.5 * 1024 * 1024) {
      res.status(400).json({ error: 'A imagem deve ter no máximo 2,5 MB.' });
      return;
    }

    const detected = detectImageType(buffer);
    if (!detected) {
      res.status(400).json({ error: 'Arquivo de imagem inválido ou corrompido.' });
      return;
    }

    const filename = `${crypto.randomUUID()}.${detected.ext}`;
    const resolved = path.resolve(UPLOADS_DIR, filename);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(400).json({ error: 'Caminho de arquivo inválido.' });
      return;
    }

    ensureDirs();
    fs.writeFileSync(resolved, buffer);

    const store = loadStore();
    removeOldLogoIfManaged(store.settings.brandLogoUrl);
    store.settings.brandLogoUrl = `/api/uploads/${filename}`;
    saveStore(store);

    res.json({ brandLogoUrl: store.settings.brandLogoUrl, settings: store.settings });
  });

  // Admin remove custom logo
  app.delete('/api/admin/logo', requireAdminAuth, (_req, res) => {
    const store = loadStore();
    removeOldLogoIfManaged(store.settings.brandLogoUrl);
    store.settings.brandLogoUrl = null;
    saveStore(store);
    res.json({ brandLogoUrl: null, settings: store.settings });
  });

  // Admin change passcode
  app.put('/api/admin/passcode', requireAdminAuth, (req, res) => {
    const body = req.body as { currentPasscode?: unknown; newPasscode?: unknown };
    const currentPasscode = typeof body.currentPasscode === 'string' ? body.currentPasscode.trim() : '';
    const newPasscode = typeof body.newPasscode === 'string' ? body.newPasscode.trim() : '';

    if (process.env.ADMIN_PASSCODE?.trim()) {
      res.status(400).json({ error: 'A senha é gerenciada pela variável de ambiente ADMIN_PASSCODE.' });
      return;
    }

    if (newPasscode.length < 4 || newPasscode.length > 64) {
      res.status(400).json({ error: 'A nova senha deve ter entre 4 e 64 caracteres.' });
      return;
    }

    const store = loadStore();
    if (!verifyPasscode(currentPasscode, store)) {
      res.status(400).json({ error: 'Senha atual incorreta.' });
      return;
    }

    store.adminPasscodeHash = hashPasscode(newPasscode);
    saveStore(store);
    res.json({ updated: true });
  });

  // Admin list consultations
  app.get('/api/admin/consultas', requireAdminAuth, (_req, res) => {
    const store = loadStore();
    const list: ConsultaAdminRecord[] = store.consultas.map((c) => ({
      id: c.id,
      protocol: c.protocol,
      fullName: c.fullName,
      cpfFormatted: c.cpfFormatted,
      pointsAvailable: c.pointsAvailable,
      status: c.status,
      selectedOptionId: c.selectedOptionId,
      selectedOptionTitle: c.selectedOptionTitle,
      createdAt: c.createdAt,
      exchangedAt: c.exchangedAt,
    }));
    res.json({ consultas: list });
  });

  // Admin delete consultation
  app.delete('/api/admin/consultas/:id', requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const store = loadStore();
    const nextList = store.consultas.filter((c) => c.id !== id);
    if (nextList.length === store.consultas.length) {
      res.status(404).json({ error: 'Registro não encontrado.' });
      return;
    }
    store.consultas = nextList;
    saveStore(store);
    res.json({ deleted: true });
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
