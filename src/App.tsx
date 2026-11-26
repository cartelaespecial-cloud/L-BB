import { useCallback, useEffect, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { PublicPortal } from './components/PublicPortal';
import type { SiteSettings } from './types';

const FALLBACK_SETTINGS: SiteSettings = {
  brandName: 'Portal de Pontos',
  brandLogoUrl: null,
  heroTitle: 'Vamos verificar se você tem pontos disponíveis',
  heroSubtitle:
    'Explore a consulta demonstrativa com perfil fictício gerado automaticamente e simule a troca dos pontos por benefícios.',
  formHeading: 'Vamos trocar eles em pontos',
  pointsLabel: 'pontos ilustrativos',
  minPointsPreview: 1250,
  maxPointsPreview: 4850,
  exchangeOptions: [
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
  ],
};

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export default function App() {
  const [pathname, setPathname] = useState<string>(() => normalizePath(window.location.pathname));
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK_SETTINGS);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [adminToken, setAdminToken] = useState<string | null>(null);

  const navigate = useCallback((targetPath: string) => {
    const normalized = normalizePath(targetPath);
    if (normalizePath(window.location.pathname) !== normalized) {
      window.history.pushState({}, '', normalized);
    }
    setPathname(normalized);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/settings')
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as (SiteSettings & { error?: string }) | null;
        if (!res.ok) {
          throw new Error(
            data && typeof data.error === 'string'
              ? data.error
              : 'Falha ao carregar configurações persistidas.',
          );
        }
        return data;
      })
      .then((data) => {
        if (active && data && typeof data.brandName === 'string') {
          setSettings(data);
          setStorageError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setStorageError(
            err instanceof Error ? err.message : 'Falha ao conectar ao armazenamento.',
          );
        }
      })
      .finally(() => {
        if (active) setLoadingSettings(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const isAdminRoute = pathname === '/painel';
    document.title = isAdminRoute
      ? `Painel Admin — ${settings.brandName}`
      : `${settings.brandName} — Consulta e Troca de Pontos`;
  }, [pathname, settings.brandName]);

  if (loadingSettings) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Carregando...</div>
      </div>
    );
  }

  if (pathname === '/painel') {
    return (
      <AdminPanel
        settings={settings}
        adminToken={adminToken}
        onLoginSuccess={(token) => setAdminToken(token)}
        onLogout={() => setAdminToken(null)}
        onSettingsUpdated={(next) => setSettings(next)}
        onNavigate={navigate}
      />
    );
  }

  return (
    <PublicPortal
      settings={settings}
      storageError={storageError}
      onNavigate={navigate}
    />
  );
}
