export interface ParsedDeviceInfo {
  ip: string;
  os: string;
  device: string;
  deviceBrand: string;
  deviceModel: string;
  deviceType: 'Celular' | 'Tablet' | 'Computador';
  browser: string;
  userAgent: string;
  screen?: string;
}

export interface ClientMeta {
  screen?: string;
  platform?: string;
  mobile?: boolean;
  vendor?: string;
  touchPoints?: number;
}

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
}

export function extractClientIp(req: RequestLike): string {
  const getHeader = (name: string): string | undefined => {
    const val = req.headers[name] ?? req.headers[name.toLowerCase()];
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string' && val[0].trim().length > 0) {
      return val[0].trim();
    }
    return undefined;
  };

  const cfIp = getHeader('cf-connecting-ip');
  if (cfIp) return sanitizeIp(cfIp);

  const xForwardedFor = getHeader('x-forwarded-for');
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0]?.trim();
    if (first) return sanitizeIp(first);
  }

  const xRealIp = getHeader('x-real-ip');
  if (xRealIp) return sanitizeIp(xRealIp);

  const fastlyIp = getHeader('fastly-client-ip') || getHeader('true-client-ip') || getHeader('x-client-ip');
  if (fastlyIp) return sanitizeIp(fastlyIp);

  if (req.ip && req.ip.trim().length > 0) {
    return sanitizeIp(req.ip.trim());
  }

  const remote = req.socket?.remoteAddress;
  if (remote && remote.trim().length > 0) {
    return sanitizeIp(remote.trim());
  }

  return '127.0.0.1';
}

function sanitizeIp(raw: string): string {
  let ip = raw.replace(/^::ffff:/, '').trim();
  if (ip === '::1' || ip === '127.0.0.1') {
    return '127.0.0.1';
  }
  return ip.slice(0, 64);
}

// Map common Samsung model prefixes to friendly names
const SAMSUNG_MODEL_MAP: Record<string, string> = {
  'SM-S928': 'Galaxy S24 Ultra',
  'SM-S926': 'Galaxy S24+',
  'SM-S921': 'Galaxy S24',
  'SM-S918': 'Galaxy S23 Ultra',
  'SM-S916': 'Galaxy S23+',
  'SM-S911': 'Galaxy S23',
  'SM-S908': 'Galaxy S22 Ultra',
  'SM-S906': 'Galaxy S22+',
  'SM-S901': 'Galaxy S22',
  'SM-G998': 'Galaxy S21 Ultra',
  'SM-G996': 'Galaxy S21+',
  'SM-G991': 'Galaxy S21',
  'SM-G780': 'Galaxy S20 FE',
  'SM-G781': 'Galaxy S20 FE 5G',
  'SM-A546': 'Galaxy A54 5G',
  'SM-A536': 'Galaxy A53 5G',
  'SM-A525': 'Galaxy A52',
  'SM-A346': 'Galaxy A34 5G',
  'SM-A336': 'Galaxy A33 5G',
  'SM-A155': 'Galaxy A15',
  'SM-A145': 'Galaxy A14',
  'SM-A135': 'Galaxy A13',
  'SM-A055': 'Galaxy A05',
  'SM-A042': 'Galaxy A04',
  'SM-M546': 'Galaxy M54 5G',
  'SM-M346': 'Galaxy M34 5G',
  'SM-F946': 'Galaxy Z Fold 5',
  'SM-F731': 'Galaxy Z Flip 5',
  'SM-F936': 'Galaxy Z Fold 4',
  'SM-F721': 'Galaxy Z Flip 4',
  'SM-T870': 'Galaxy Tab S7',
  'SM-X910': 'Galaxy Tab S9 Ultra',
  'SM-X810': 'Galaxy Tab S9+',
  'SM-X710': 'Galaxy Tab S9',
};

export function parseUserAgentDetails(
  userAgentRaw: string | undefined,
  clientMeta?: ClientMeta,
): Omit<ParsedDeviceInfo, 'ip'> {
  const ua = (userAgentRaw || '').trim();

  // 1. Operating System
  let os = 'Desconhecido';
  if (/Android\s*([0-9.]+)?/i.test(ua)) {
    const match = ua.match(/Android\s*([0-9.]+)?/i);
    const ver = match?.[1] ? ` ${match[1]}` : '';
    os = `Android${ver}`;
  } else if (/(?:iPhone|iPad|iPod).*?OS\s*([0-9_]+)/i.test(ua)) {
    const match = ua.match(/(?:iPhone|iPad|iPod).*?OS\s*([0-9_]+)/i);
    const ver = match?.[1] ? ` ${match[1].replace(/_/g, '.')}` : '';
    os = /iPad/i.test(ua) ? `iPadOS${ver}` : `iOS${ver}`;
  } else if (/Windows NT 10\.0/i.test(ua)) {
    os = 'Windows 10/11';
  } else if (/Windows NT 6\.3/i.test(ua)) {
    os = 'Windows 8.1';
  } else if (/Windows NT 6\.1/i.test(ua)) {
    os = 'Windows 7';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
  } else if (/Mac OS X\s*([0-9_]+)?/i.test(ua)) {
    const match = ua.match(/Mac OS X\s*([0-9_]+)?/i);
    const ver = match?.[1] ? ` ${match[1].replace(/_/g, '.')}` : '';
    os = `macOS${ver}`;
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/Linux/i.test(ua)) {
    if (/Ubuntu/i.test(ua)) os = 'Linux (Ubuntu)';
    else if (/Fedora/i.test(ua)) os = 'Linux (Fedora)';
    else if (/Debian/i.test(ua)) os = 'Linux (Debian)';
    else os = 'Linux';
  }

  // 2. Device Type
  let deviceType: 'Celular' | 'Tablet' | 'Computador' = 'Computador';
  if (/iPad|Tablet|(?:Android(?!.*Mobile))/i.test(ua)) {
    deviceType = 'Tablet';
  } else if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || clientMeta?.mobile) {
    deviceType = 'Celular';
  }

  // 3. Device Brand & Model
  let deviceBrand = 'Genérico';
  let deviceModel = 'Dispositivo';

  if (/iPhone/i.test(ua)) {
    deviceBrand = 'Apple';
    deviceModel = 'iPhone';
    deviceType = 'Celular';
  } else if (/iPad/i.test(ua)) {
    deviceBrand = 'Apple';
    deviceModel = 'iPad';
    deviceType = 'Tablet';
  } else if (/Macintosh/i.test(ua)) {
    deviceBrand = 'Apple';
    deviceModel = 'Mac (Desktop / MacBook)';
    deviceType = 'Computador';
  } else if (/SM-[A-Z0-9]+|GT-[A-Z0-9]+|SAMSUNG/i.test(ua)) {
    deviceBrand = 'Samsung';
    const match = ua.match(/(SM-[A-Z0-9]+|GT-[A-Z0-9]+)/i);
    const code = match ? match[1].toUpperCase() : '';
    const prefix = code.slice(0, 7);
    const friendly = SAMSUNG_MODEL_MAP[prefix] || SAMSUNG_MODEL_MAP[code.slice(0, 6)];
    deviceModel = friendly ? `${friendly} (${code})` : code ? `Galaxy (${code})` : 'Galaxy';
  } else if (/moto\s*[a-z0-9\s]+|XT[0-9]+/i.test(ua)) {
    deviceBrand = 'Motorola';
    const match = ua.match(/(moto\s*[a-z0-9\s+]+|XT[0-9]+)/i);
    deviceModel = match ? match[1].trim() : 'Moto G';
    deviceType = 'Celular';
  } else if (/Redmi|POCO|Xiaomi|22[0-9]{2}[0-9A-Z]+|23[0-9]{2}[0-9A-Z]+|24[0-9]{2}[0-9A-Z]+/i.test(ua)) {
    deviceBrand = /POCO/i.test(ua) ? 'POCO' : /Redmi/i.test(ua) ? 'Redmi' : 'Xiaomi';
    const match = ua.match(/(Redmi(?:\s*Note)?\s*[0-9A-Z\s]+|POCO\s*[A-Z0-9\s]+|(?:22|23|24)[0-9]{2}[0-9A-Z]+)/i);
    deviceModel = match ? match[1].trim() : `${deviceBrand} Smartphone`;
    deviceType = 'Celular';
  } else if (/Pixel\s*[0-9a-zA-Z\s]*/i.test(ua)) {
    deviceBrand = 'Google';
    const match = ua.match(/(Pixel\s*[0-9a-zA-Z\s]*)/i);
    deviceModel = match ? match[1].trim() : 'Google Pixel';
    deviceType = 'Celular';
  } else if (/Realme|RMX[0-9]+/i.test(ua)) {
    deviceBrand = 'Realme';
    const match = ua.match(/(RMX[0-9]+|Realme\s*[0-9A-Z]+)/i);
    deviceModel = match ? match[1].trim() : 'Realme Smartphone';
    deviceType = 'Celular';
  } else if (/LG-[A-Z0-9]+|LM-[A-Z0-9]+/i.test(ua)) {
    deviceBrand = 'LG';
    const match = ua.match(/(LG-[A-Z0-9]+|LM-[A-Z0-9]+)/i);
    deviceModel = match ? match[1].trim() : 'LG Smartphone';
    deviceType = 'Celular';
  } else if (/ASUS|ROG Phone/i.test(ua)) {
    deviceBrand = 'Asus';
    deviceModel = /ROG Phone/i.test(ua) ? 'ROG Phone' : 'Zenfone';
    deviceType = 'Celular';
  } else if (/Windows/i.test(ua)) {
    deviceBrand = 'PC / Windows';
    deviceModel = 'Computador Desktop / Notebook';
    deviceType = 'Computador';
  } else if (/Linux/i.test(ua) && deviceType === 'Computador') {
    deviceBrand = 'PC / Linux';
    deviceModel = 'Computador Desktop / Notebook';
    deviceType = 'Computador';
  } else if (deviceType === 'Celular') {
    // Attempt to extract Android model before Build/
    const androidMatch = ua.match(/;\s*([^;]+?)\s*Build\//i);
    if (androidMatch && androidMatch[1]) {
      const candidate = androidMatch[1].trim();
      deviceBrand = 'Android';
      deviceModel = candidate;
    } else {
      deviceBrand = 'Smartphone';
      deviceModel = 'Dispositivo Móvel';
    }
  }

  // 4. Browser
  let browser = 'Navegador Web';
  if (/SamsungBrowser\/([0-9.]+)/i.test(ua)) {
    const v = ua.match(/SamsungBrowser\/([0-9.]+)/i)?.[1] || '';
    browser = `Samsung Internet ${v.split('.')[0]}`;
  } else if (/Edg(?:e|A|iOS)?\/([0-9.]+)/i.test(ua)) {
    const v = ua.match(/Edg(?:e|A|iOS)?\/([0-9.]+)/i)?.[1] || '';
    browser = `Microsoft Edge ${v.split('.')[0]}`;
  } else if (/OPR\/([0-9.]+)|Opera/i.test(ua)) {
    const v = ua.match(/OPR\/([0-9.]+)/i)?.[1] || '';
    browser = `Opera ${v.split('.')[0]}`;
  } else if (/Brave/i.test(ua)) {
    browser = 'Brave Browser';
  } else if (/(?:Firefox|FxiOS)\/([0-9.]+)/i.test(ua)) {
    const v = ua.match(/(?:Firefox|FxiOS)\/([0-9.]+)/i)?.[1] || '';
    browser = `Firefox ${v.split('.')[0]}`;
  } else if (/Chrome\/([0-9.]+)|CriOS\/([0-9.]+)/i.test(ua)) {
    const match = ua.match(/(?:Chrome|CriOS)\/([0-9.]+)/i);
    const v = match?.[1] ? match[1].split('.')[0] : '';
    browser = deviceType === 'Computador' ? `Google Chrome ${v}` : `Chrome Mobile ${v}`;
  } else if (/Version\/([0-9.]+).*?Safari/i.test(ua)) {
    const v = ua.match(/Version\/([0-9.]+)/i)?.[1] || '';
    browser = deviceType === 'Computador' ? `Safari ${v.split('.')[0]}` : `Safari Mobile ${v.split('.')[0]}`;
  }

  const device = `${deviceBrand} · ${deviceModel}`;

  return {
    os,
    device,
    deviceBrand,
    deviceModel,
    deviceType,
    browser,
    userAgent: ua.slice(0, 300),
    screen: clientMeta?.screen,
  };
}

export function parseRequestDeviceInfo(req: RequestLike, clientMeta?: ClientMeta): ParsedDeviceInfo {
  const ip = extractClientIp(req);
  const uaHeader = req.headers['user-agent'];
  const ua = typeof uaHeader === 'string' ? uaHeader : Array.isArray(uaHeader) ? uaHeader[0] : '';
  const parsed = parseUserAgentDetails(ua, clientMeta);

  return {
    ip,
    ...parsed,
  };
}
