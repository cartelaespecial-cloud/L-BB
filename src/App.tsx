import { useCallback, useEffect, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { PublicPortal } from './components/PublicPortal';
import type { SiteSettings } from './types';

const FALLBACK_SETTINGS: SiteSettings = {
  brandName: 'Portal de Pontos',
  brandLogoUrl: null,
  heroTitle: 'CONSULTE SEUS PONTOS',
  heroSubtitle: 'Realize sua consulta e confira seus pontos disponíveis para conversão em reais.',
  formHeading: 'CONSULTE SEUS PONTOS',
  pointsLabel: 'pontos',
  minPointsPreview: 45811,
  maxPointsPreview: 45811,
  exchangeOptions: [
    {
      id: 'saldo-conta',
      title: 'Depósito em Conta Corrente',
      description: 'Solicitação de conversão fixa dos pontos da campanha para conta corrente',
      rateLabel: '45.811 pts = R$ 2.748,63',
    },
  ],
  redemptionPage: {
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
    redemptionLogoUrl: null,
  },
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
