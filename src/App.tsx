import { useCallback, useEffect, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { PublicPortal } from './components/PublicPortal';
import type { SiteSettings } from './types';

const FALLBACK_SETTINGS: SiteSettings = {
  brandName: 'Portal de Pontos',
  brandLogoUrl: null,
  heroTitle: 'Vamos verificar se você tem pontos disponíveis',
  heroSubtitle:
    'Consulte agora seu saldo vinculado ao CPF e solicite a troca dos seus pontos por benefícios, créditos ou descontos.',
  formHeading: 'Vamos trocar eles em pontos',
  pointsLabel: 'pontos disponíveis',
  minPointsPreview: 1250,
  maxPointsPreview: 4850,
  exchangeOptions: [
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
  ],
};

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export default function App() {
  const [pathname, setPathname] = useState<string>(() => normalizePath(window.location.pathname));
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK_SETTINGS);
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
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SiteSettings | null) => {
        if (active && data && typeof data.brandName === 'string') {
          setSettings(data);
        }
      })
      .catch(() => {
        // Use fallback settings if server is unreachable
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

  return <PublicPortal settings={settings} onNavigate={navigate} />;
}
