import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  LayoutTemplate,
  Lock,
  LogOut,
  Palette,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ConsultaAdminRecord, SiteSettings } from '../types';
import { CAMPAIGN_BRL_VALUE, calculateConvertedBrl, formatBrl } from '../utils/points';
import { isValidHexColor } from '../utils/validation';
import { BrandMark } from './BrandMark';

interface AdminPanelProps {
  settings: SiteSettings;
  adminToken: string | null;
  onLoginSuccess: (token: string) => void;
  onLogout: () => void;
  onSettingsUpdated: (nextSettings: SiteSettings) => void;
  onNavigate: (path: string) => void;
}

type AdminTab = 'marca' | 'resgate' | 'consultas' | 'seguranca';
type StatusFilter = 'todas' | 'consultado' | 'troca_solicitada';

function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function AdminPanel({
  settings,
  adminToken,
  onLoginSuccess,
  onLogout,
  onSettingsUpdated,
  onNavigate,
}: AdminPanelProps) {
  // Login state
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<AdminTab>('marca');

  // Brand & form settings state
  const [brandName, setBrandName] = useState(settings.brandName);
  const [heroTitle, setHeroTitle] = useState(settings.heroTitle);
  const [heroSubtitle, setHeroSubtitle] = useState(settings.heroSubtitle);
  const [formHeading, setFormHeading] = useState(settings.formHeading);
  const [pointsLabel, setPointsLabel] = useState(settings.pointsLabel);
  const [minPointsPreview, setMinPointsPreview] = useState(String(settings.minPointsPreview));
  const [maxPointsPreview, setMaxPointsPreview] = useState(String(settings.maxPointsPreview));
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [logoFeedback, setLogoFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redemption page customization state
  const [platformName, setPlatformName] = useState(settings.redemptionPage.platformName);
  const [companyName, setCompanyName] = useState(settings.redemptionPage.companyName);
  const [backgroundColor, setBackgroundColor] = useState(settings.redemptionPage.backgroundColor);
  const [rpTitle, setRpTitle] = useState(settings.redemptionPage.title);
  const [rpSubtitle, setRpSubtitle] = useState(settings.redemptionPage.subtitle);
  const [rpInfoText, setRpInfoText] = useState(settings.redemptionPage.infoText);
  const [bankLabel, setBankLabel] = useState(settings.redemptionPage.bankLabel);
  const [depositInstructions, setDepositInstructions] = useState(settings.redemptionPage.depositInstructions);
  const [showAgencyDigit, setShowAgencyDigit] = useState(settings.redemptionPage.showAgencyDigit);
  const [convertButtonText, setConvertButtonText] = useState(settings.redemptionPage.convertButtonText);
  const [ownershipButtonText, setOwnershipButtonText] = useState(settings.redemptionPage.ownershipButtonText);
  const [requestButtonText, setRequestButtonText] = useState(settings.redemptionPage.requestButtonText);
  const [confirmButtonText, setConfirmButtonText] = useState(settings.redemptionPage.confirmButtonText);
  const [savingRedemption, setSavingRedemption] = useState(false);
  const [redemptionFeedback, setRedemptionFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [uploadingRedemptionLogo, setUploadingRedemptionLogo] = useState(false);
  const [redemptionDragActive, setRedemptionDragActive] = useState(false);
  const [redemptionLogoFeedback, setRedemptionLogoFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const redemptionFileInputRef = useRef<HTMLInputElement>(null);

  // Consultas state
  const [consultas, setConsultas] = useState<ConsultaAdminRecord[]>([]);
  const [loadingConsultas, setLoadingConsultas] = useState(false);
  const [consultasError, setConsultasError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');

  // Security / passcode change state
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [savingPasscode, setSavingPasscode] = useState(false);
  const [passcodeFeedback, setPasscodeFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setBrandName(settings.brandName);
    setHeroTitle(settings.heroTitle);
    setHeroSubtitle(settings.heroSubtitle);
    setFormHeading(settings.formHeading);
    setPointsLabel(settings.pointsLabel);
    setMinPointsPreview(String(settings.minPointsPreview));
    setMaxPointsPreview(String(settings.maxPointsPreview));

    setPlatformName(settings.redemptionPage.platformName);
    setCompanyName(settings.redemptionPage.companyName);
    setBackgroundColor(settings.redemptionPage.backgroundColor);
    setRpTitle(settings.redemptionPage.title);
    setRpSubtitle(settings.redemptionPage.subtitle);
    setRpInfoText(settings.redemptionPage.infoText);
    setBankLabel(settings.redemptionPage.bankLabel);
    setDepositInstructions(settings.redemptionPage.depositInstructions);
    setShowAgencyDigit(settings.redemptionPage.showAgencyDigit);
    setConvertButtonText(settings.redemptionPage.convertButtonText);
    setOwnershipButtonText(settings.redemptionPage.ownershipButtonText);
    setRequestButtonText(settings.redemptionPage.requestButtonText);
    setConfirmButtonText(settings.redemptionPage.confirmButtonText);
  }, [settings]);

  useEffect(() => {
    if (!adminToken) return;
    if (activeTab === 'consultas') {
      void fetchConsultas();
    }
  }, [adminToken, activeTab]);

  async function fetchConsultas(): Promise<void> {
    if (!adminToken) return;
    setLoadingConsultas(true);
    setConsultasError(null);
    try {
      const response = await fetch('/api/admin/consultas', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = (await response.json()) as { consultas?: ConsultaAdminRecord[]; error?: string };
      if (!response.ok) {
        setConsultasError(data.error || 'Não foi possível carregar os registros.');
        return;
      }
      setConsultas(Array.isArray(data.consultas) ? data.consultas : []);
    } catch {
      setConsultasError('Erro de conexão ao carregar consultas.');
    } finally {
      setLoadingConsultas(false);
    }
  }

  async function handleLoginSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setLoginError(null);
    if (!passcode.trim()) {
      setLoginError('Digite a senha para acessar o painel.');
      return;
    }

    setLoggingIn(true);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      const data = (await response.json()) as { token?: string; error?: string };
      if (!response.ok) {
        setLoginError(data.error || 'Senha incorreta.');
        return;
      }
      setPasscode('');
      onLoginSuccess(data.token ?? '');
    } catch {
      setLoginError('Erro de conexão ao validar acesso.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleSaveSettings(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!adminToken) return;
    setSettingsFeedback(null);

    if (brandName.trim().length < 2) {
      setSettingsFeedback({ type: 'err', text: 'Informe um nome personalizado com pelo menos 2 caracteres.' });
      return;
    }

    setSavingSettings(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          brandName: brandName.trim(),
          heroTitle: heroTitle.trim(),
          heroSubtitle: heroSubtitle.trim(),
          formHeading: formHeading.trim(),
          pointsLabel: pointsLabel.trim(),
          minPointsPreview: Number(minPointsPreview) || 45811,
          maxPointsPreview: Number(maxPointsPreview) || 45811,
        }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = (await response.json()) as SiteSettings & { error?: string };
      if (!response.ok) {
        setSettingsFeedback({ type: 'err', text: data.error || 'Erro ao salvar configurações.' });
        return;
      }
      onSettingsUpdated(data);
      setSettingsFeedback({ type: 'ok', text: 'Alterações salvas e aplicadas ao site.' });
    } catch {
      setSettingsFeedback({ type: 'err', text: 'Erro de conexão ao salvar alterações.' });
    } finally {
      setSavingSettings(false);
    }
  }

  async function uploadLogoFile(file: File): Promise<void> {
    if (!adminToken) return;
    setLogoFeedback(null);

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setLogoFeedback({ type: 'err', text: 'Formato inválido. Selecione uma imagem PNG, JPG ou WEBP.' });
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setLogoFeedback({ type: 'err', text: 'A imagem deve ter no máximo 1,5 MB.' });
      return;
    }

    setUploadingLogo(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/admin/logo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ dataUrl }),
      });

      if (response.status === 401) {
        onLogout();
        return;
      }

      const data = (await response.json()) as { settings?: SiteSettings; error?: string };
      if (!response.ok) {
        setLogoFeedback({ type: 'err', text: data.error || 'Falha ao enviar a logo.' });
        return;
      }

      if (data.settings) onSettingsUpdated(data.settings);
      setLogoFeedback({ type: 'ok', text: 'Logo enviada e persistida no armazenamento.' });
    } catch {
      setLogoFeedback({ type: 'err', text: 'Não foi possível enviar a imagem.' });
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) void uploadLogoFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadLogoFile(file);
  }

  async function handleRemoveLogo(): Promise<void> {
    if (!adminToken) return;
    setLogoFeedback(null);
    setUploadingLogo(true);
    try {
      const response = await fetch('/api/admin/logo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = (await response.json()) as { settings?: SiteSettings; error?: string };
      if (!response.ok) {
        setLogoFeedback({ type: 'err', text: data.error || 'Erro ao remover logo.' });
        return;
      }
      if (data.settings) onSettingsUpdated(data.settings);
      setLogoFeedback({ type: 'ok', text: 'Logo removida. Exibindo iniciais da marca.' });
    } catch {
      setLogoFeedback({ type: 'err', text: 'Erro de conexão ao remover logo.' });
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSaveRedemptionSettings(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!adminToken) return;
    setRedemptionFeedback(null);

    if (platformName.trim().length < 2) {
      setRedemptionFeedback({ type: 'err', text: 'Informe o nome da plataforma (mínimo 2 caracteres).' });
      return;
    }
    if (!isValidHexColor(backgroundColor.trim())) {
      setRedemptionFeedback({ type: 'err', text: 'Informe uma cor de fundo hexadecimal válida (ex.: #FFED00).' });
      return;
    }

    setSavingRedemption(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          redemptionPage: {
            platformName: platformName.trim(),
            companyName: companyName.trim(),
            backgroundColor: backgroundColor.trim().toUpperCase(),
            title: rpTitle.trim(),
            subtitle: rpSubtitle.trim(),
            infoText: rpInfoText.trim(),
            bankLabel: bankLabel.trim(),
            depositInstructions: depositInstructions.trim(),
            showAgencyDigit,
            convertButtonText: convertButtonText.trim(),
            ownershipButtonText: ownershipButtonText.trim(),
            requestButtonText: requestButtonText.trim(),
            confirmButtonText: confirmButtonText.trim(),
          },
        }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = (await response.json()) as SiteSettings & { error?: string };
      if (!response.ok) {
        setRedemptionFeedback({ type: 'err', text: data.error || 'Erro ao salvar personalização da página de resgate.' });
        return;
      }
      onSettingsUpdated(data);
      setRedemptionFeedback({ type: 'ok', text: 'Personalização da página de resgate salva e aplicada com sucesso.' });
    } catch {
      setRedemptionFeedback({ type: 'err', text: 'Erro de conexão ao salvar personalização.' });
    } finally {
      setSavingRedemption(false);
    }
  }

  async function uploadRedemptionLogoFile(file: File): Promise<void> {
    if (!adminToken) return;
    setRedemptionLogoFeedback(null);

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setRedemptionLogoFeedback({ type: 'err', text: 'Formato inválido. Selecione uma imagem PNG, JPG ou WEBP.' });
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setRedemptionLogoFeedback({ type: 'err', text: 'A imagem deve ter no máximo 1,5 MB.' });
      return;
    }

    setUploadingRedemptionLogo(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/admin/redemption-logo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ dataUrl }),
      });

      if (response.status === 401) {
        onLogout();
        return;
      }

      const data = (await response.json()) as { settings?: SiteSettings; error?: string };
      if (!response.ok) {
        setRedemptionLogoFeedback({ type: 'err', text: data.error || 'Falha ao enviar a logo da plataforma.' });
        return;
      }

      if (data.settings) onSettingsUpdated(data.settings);
      setRedemptionLogoFeedback({ type: 'ok', text: 'Logo da página de resgate enviada e persistida.' });
    } catch {
      setRedemptionLogoFeedback({ type: 'err', text: 'Não foi possível enviar a imagem.' });
    } finally {
      setUploadingRedemptionLogo(false);
      if (redemptionFileInputRef.current) {
        redemptionFileInputRef.current.value = '';
      }
    }
  }

  function handleRedemptionFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) void uploadRedemptionLogoFile(file);
  }

  function handleRedemptionDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setRedemptionDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadRedemptionLogoFile(file);
  }

  async function handleRemoveRedemptionLogo(): Promise<void> {
    if (!adminToken) return;
    setRedemptionLogoFeedback(null);
    setUploadingRedemptionLogo(true);
    try {
      const response = await fetch('/api/admin/redemption-logo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = (await response.json()) as { settings?: SiteSettings; error?: string };
      if (!response.ok) {
        setRedemptionLogoFeedback({ type: 'err', text: data.error || 'Erro ao remover logo.' });
        return;
      }
      if (data.settings) onSettingsUpdated(data.settings);
      setRedemptionLogoFeedback({ type: 'ok', text: 'Logo exclusiva removida. Exibindo a logo principal ou iniciais.' });
    } catch {
      setRedemptionLogoFeedback({ type: 'err', text: 'Erro de conexão ao remover logo.' });
    } finally {
      setUploadingRedemptionLogo(false);
    }
  }

  async function handleDeleteConsulta(id: string): Promise<void> {
    if (!adminToken) return;
    setConsultasError(null);
    try {
      const response = await fetch(`/api/admin/consultas/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setConsultasError(data.error || 'Não foi possível remover o registro.');
        return;
      }
      setConsultas((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setConsultasError('Erro de conexão ao remover o registro.');
    }
  }

  function getRateLabelForRow(row: ConsultaAdminRecord): string {
    const matched = settings.exchangeOptions.find((opt) => opt.id === row.selectedOptionId);
    return matched?.rateLabel ?? settings.exchangeOptions[0]?.rateLabel ?? '1.000 pts = R$ 50,00';
  }

  function handleExportCsv(): void {
    const headers = [
      'Protocolo',
      'Participante',
      'CPF (Mascarado)',
      'Telefone (Mascarado)',
      'Pontos',
      'Valor Equivalente',
      'Status',
      'Banco',
      'Agência (Mascarada)',
      'Conta Corrente (Mascarada)',
      'Data Consulta',
    ];
    const rows = filteredConsultas.map((c) => {
      const brl =
        typeof c.amountBrl === 'number' && Number.isFinite(c.amountBrl)
          ? c.amountBrl
          : calculateConvertedBrl(c.pointsAvailable, getRateLabelForRow(c));
      return [
        escapeCsvCell(c.protocol),
        escapeCsvCell(c.profileLabel),
        escapeCsvCell(c.cpfMasked || '***.***.***-**'),
        escapeCsvCell(c.phoneMasked || '(**) *****-****'),
        escapeCsvCell(c.pointsAvailable),
        escapeCsvCell(formatBrl(brl)),
        escapeCsvCell(c.status === 'troca_solicitada' ? 'Em análise e processamento' : 'Consultado'),
        escapeCsvCell(c.bankLabel || '-'),
        escapeCsvCell(c.agencyMasked || '-'),
        escapeCsvCell(c.accountMasked || '-'),
        escapeCsvCell(new Date(c.createdAt).toLocaleString('pt-BR')),
      ];
    });

    const csv = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `consultas-pontos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleUpdatePasscode(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!adminToken) return;
    setPasscodeFeedback(null);

    if (newPasscode.trim().length < 4) {
      setPasscodeFeedback({ type: 'err', text: 'A nova senha deve ter pelo menos 4 caracteres.' });
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setPasscodeFeedback({ type: 'err', text: 'A confirmação da nova senha não confere.' });
      return;
    }

    setSavingPasscode(true);
    try {
      const response = await fetch('/api/admin/passcode', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          currentPasscode: currentPasscode.trim(),
          newPasscode: newPasscode.trim(),
        }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setPasscodeFeedback({ type: 'err', text: data.error || 'Não foi possível alterar a senha.' });
        return;
      }
      setCurrentPasscode('');
      setNewPasscode('');
      setConfirmPasscode('');
      setPasscodeFeedback({ type: 'ok', text: 'Senha do painel atualizada com sucesso.' });
    } catch {
      setPasscodeFeedback({ type: 'err', text: 'Erro de conexão ao atualizar senha.' });
    } finally {
      setSavingPasscode(false);
    }
  }

  // Login Screen
  if (!adminToken) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col justify-between">
        <header className="bg-white border-b border-neutral-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <BrandMark
              brandName={settings.brandName}
              brandLogoUrl={settings.brandLogoUrl}
              onClick={() => onNavigate('/')}
            />
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="text-sm font-medium text-neutral-600 hover:text-[#151515] transition-colors cursor-pointer"
            >
              Voltar ao site
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl p-6 sm:p-8">
            <div className="w-10 h-10 rounded-lg bg-[#151515] flex items-center justify-center text-[#FE0A8C] mb-5">
              <Lock className="w-5 h-5" aria-hidden="true" />
            </div>
            <h1 className="font-display text-2xl font-bold text-[#151515] tracking-tight mb-1.5">
              Painel Administrativo
            </h1>
            <p className="text-sm text-neutral-600 mb-6">
              Informe a senha de administrador para personalizar o nome, subir a logo e gerenciar as consultas de pontos.
            </p>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label htmlFor="admin-passcode" className="block text-sm font-medium text-[#151515] mb-1.5">
                  Senha de acesso
                </label>
                <div className="relative">
                  <input
                    id="admin-passcode"
                    type={showPasscode ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoFocus
                    value={passcode}
                    onChange={(e) => {
                      setPasscode(e.target.value);
                      if (loginError) setLoginError(null);
                    }}
                    placeholder="Digite sua senha"
                    className="w-full h-11 pl-3.5 pr-11 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((prev) => !prev)}
                    aria-label={showPasscode ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-[#151515] cursor-pointer"
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full h-11 px-5 bg-[#FE0A8C] hover:bg-[#DF067A] disabled:bg-[#FE0A8C]/60 text-white text-sm font-bold rounded-lg transition-colors cursor-pointer"
              >
                {loggingIn ? 'Verificando...' : 'Entrar no painel'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const filteredConsultas = consultas.filter((item) => {
    if (statusFilter !== 'todas' && item.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.profileLabel.toLowerCase().includes(q) ||
      (item.cpfMasked || '').toLowerCase().includes(q) ||
      item.referenceCode.toLowerCase().includes(q) ||
      item.protocol.toLowerCase().includes(q)
    );
  });

  const totalConsultas = consultas.length;
  const totalTrocas = consultas.filter((c) => c.status === 'troca_solicitada').length;
  const totalPontos = consultas.reduce((acc, item) => acc + item.pointsAvailable, 0);

  const tabTitles: Record<AdminTab, string> = {
    marca: 'Identidade e Logo',
    resgate: 'Personalização da Página de Resgate',
    consultas: 'Consultas e Resgates',
    seguranca: 'Segurança e Senha',
  };

  const previewBgColor = isValidHexColor(backgroundColor.trim()) ? backgroundColor.trim() : '#FFED00';
  const previewLogoUrl = settings.redemptionPage.redemptionLogoUrl || settings.brandLogoUrl;

  return (
    <div className="min-h-screen bg-neutral-50 text-[#151515] flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-neutral-200 shrink-0">
        <div className="h-16 px-5 border-b border-neutral-200 flex items-center justify-between lg:justify-start">
          <BrandMark
            brandName={brandName.trim() || settings.brandName}
            brandLogoUrl={settings.brandLogoUrl}
            size="sm"
          />
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('marca')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'marca'
                ? 'bg-[#151515] text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-[#151515]'
            }`}
          >
            <Palette className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Nome e Logo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resgate')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'resgate'
                ? 'bg-[#151515] text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-[#151515]'
            }`}
          >
            <LayoutTemplate className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Página de Resgate</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('consultas')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'consultas'
                ? 'bg-[#151515] text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-[#151515]'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Consultas de Pontos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('seguranca')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'seguranca'
                ? 'bg-[#151515] text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-[#151515]'
            }`}
          >
            <KeyRound className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Senha do Painel</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract for Admin */}
        <header className="h-16 bg-white border-b border-neutral-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="text-sm text-neutral-500 truncate">
            <span>Painel</span>
            <span className="mx-2">/</span>
            <span className="font-semibold text-[#151515]">{tabTitles[activeTab]}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="px-3.5 py-2 text-xs sm:text-sm font-medium text-[#151515] bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span>Ver site</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2 text-xs sm:text-sm font-medium text-neutral-700 hover:text-red-700 hover:bg-red-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-5xl w-full mx-auto">
          {/* TAB 1: NOME E LOGO */}
          {activeTab === 'marca' && (
            <div className="space-y-8">
              {/* Live Header Preview */}
              <section className="bg-white border border-neutral-200 rounded-xl p-6">
                <p className="text-xs font-medium text-neutral-500 mb-3">
                  Pré-visualização do cabeçalho no site público
                </p>
                <div className="border border-neutral-200 rounded-lg px-5 h-16 flex items-center justify-between bg-white">
                  <BrandMark
                    brandName={brandName.trim() || settings.brandName}
                    brandLogoUrl={settings.brandLogoUrl}
                  />
                  <span className="px-3.5 py-1.5 rounded-lg bg-[#FE0A8C] text-white text-xs font-bold">
                    Verificar pontos
                  </span>
                </div>
              </section>

              {/* Upload Logo */}
              <section className="bg-white border border-neutral-200 rounded-xl p-6">
                <h2 className="font-display text-lg font-bold text-[#151515] mb-1">
                  Logo personalizada
                </h2>
                <p className="text-sm text-neutral-600 mb-5">
                  Envie a imagem da sua marca em PNG, JPG ou WEBP (até 1,5 MB). Ela aparecerá automaticamente no cabeçalho e no rodapé do site.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  <div className="md:col-span-4 flex flex-col items-center justify-center p-5 border border-neutral-200 rounded-lg bg-neutral-50 min-h-[140px]">
                    {settings.brandLogoUrl ? (
                      <img
                        src={settings.brandLogoUrl}
                        alt="Logo atual"
                        referrerPolicy="no-referrer"
                        className="max-h-20 max-w-full object-contain"
                      />
                    ) : (
                      <p className="text-xs text-neutral-500 text-center">
                        Nenhuma logo enviada ainda.
                        <br />
                        Exibindo iniciais da marca.
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-8">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        dragActive ? 'border-[#FE0A8C] bg-[#FE0A8C]/5' : 'border-neutral-300 bg-neutral-50/60'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleFileChange}
                        className="hidden"
                        id="logo-upload-input"
                      />
                      <Upload className="w-6 h-6 text-neutral-500 mx-auto mb-2" aria-hidden="true" />
                      <p className="text-sm font-medium text-[#151515] mb-1">
                        Arraste a imagem aqui ou clique para escolher
                      </p>
                      <p className="text-xs text-neutral-500 mb-4">
                        PNG, JPG ou WEBP · Máximo 1,5 MB
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          disabled={uploadingLogo}
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-[#151515] hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          {uploadingLogo ? 'Enviando...' : 'Subir logo'}
                        </button>
                        {settings.brandLogoUrl && (
                          <button
                            type="button"
                            disabled={uploadingLogo}
                            onClick={handleRemoveLogo}
                            className="px-4 py-2 bg-white border border-neutral-300 hover:bg-red-50 hover:border-red-300 hover:text-red-700 text-neutral-700 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer"
                          >
                            Remover logo
                          </button>
                        )}
                      </div>
                    </div>

                    {logoFeedback && (
                      <div
                        role="status"
                        className={`mt-3 p-3 rounded-lg border text-xs sm:text-sm flex items-center gap-2 ${
                          logoFeedback.type === 'ok'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        {logoFeedback.type === 'ok' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        <span>{logoFeedback.text}</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Nome e Textos do Formulário */}
              <section className="bg-white border border-neutral-200 rounded-xl p-6">
                <h2 className="font-display text-lg font-bold text-[#151515] mb-1">
                  Nome do site e textos do formulário
                </h2>
                <p className="text-sm text-neutral-600 mb-6">
                  Personalize o nome exibido em todo o portal e os textos exibidos aos visitantes.
                </p>

                <form onSubmit={handleSaveSettings} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="brandName" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Nome personalizado do site
                      </label>
                      <input
                        id="brandName"
                        type="text"
                        required
                        maxLength={60}
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder="Ex.: Clube Vantagens Brasil"
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>

                    <div>
                      <label htmlFor="formHeading" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Título do formulário
                      </label>
                      <input
                        id="formHeading"
                        type="text"
                        required
                        maxLength={100}
                        value={formHeading}
                        onChange={(e) => setFormHeading(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="heroTitle" className="block text-sm font-medium text-[#151515] mb-1.5">
                      Chamada principal da página
                    </label>
                    <input
                      id="heroTitle"
                      type="text"
                      required
                      maxLength={120}
                      value={heroTitle}
                      onChange={(e) => setHeroTitle(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="heroSubtitle" className="block text-sm font-medium text-[#151515] mb-1.5">
                      Descrição inicial
                    </label>
                    <textarea
                      id="heroSubtitle"
                      rows={2}
                      maxLength={260}
                      value={heroSubtitle}
                      onChange={(e) => setHeroSubtitle(e.target.value)}
                      className="w-full p-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <label htmlFor="pointsLabel" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Rótulo dos pontos
                      </label>
                      <input
                        id="pointsLabel"
                        type="text"
                        maxLength={40}
                        value={pointsLabel}
                        onChange={(e) => setPointsLabel(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>
                    <div>
                      <label htmlFor="minPoints" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Pontos mínimos exibidos
                      </label>
                      <input
                        id="minPoints"
                        type="number"
                        min={100}
                        max={1000000}
                        value={minPointsPreview}
                        onChange={(e) => setMinPointsPreview(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm font-mono tabular-nums text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>
                    <div>
                      <label htmlFor="maxPoints" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Pontos máximos exibidos
                      </label>
                      <input
                        id="maxPoints"
                        type="number"
                        min={100}
                        max={1000000}
                        value={maxPointsPreview}
                        onChange={(e) => setMaxPointsPreview(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm font-mono tabular-nums text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>
                  </div>

                  {settingsFeedback && (
                    <div
                      role="status"
                      className={`p-3 rounded-lg border text-xs sm:text-sm flex items-center gap-2 ${
                        settingsFeedback.type === 'ok'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      {settingsFeedback.type === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      )}
                      <span>{settingsFeedback.text}</span>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="h-11 px-6 bg-[#FE0A8C] hover:bg-[#DF067A] disabled:bg-[#FE0A8C]/60 text-white text-sm font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      {savingSettings ? 'Salvando...' : 'Salvar alterações'}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {/* TAB: PERSONALIZAÇÃO DA PÁGINA DE RESGATE */}
          {activeTab === 'resgate' && (
            <div className="space-y-8">
              {/* Pré-visualização ao vivo */}
              <section className="bg-white border border-neutral-200 rounded-xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#151515]">
                      PERSONALIZAÇÃO DA PÁGINA DE RESGATE
                    </h2>
                    <p className="text-xs text-neutral-500">
                      Pré-visualização em tempo real da tela exibida após clicar em Solicitar Resgate.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-neutral-100 text-xs font-mono text-neutral-700">
                    Fundo: {previewBgColor}
                  </span>
                </div>

                <div
                  className="rounded-xl border border-black/15 p-5 sm:p-6 transition-colors"
                  style={{ backgroundColor: previewBgColor }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-black/10">
                    <div className="flex items-center gap-3">
                      {previewLogoUrl ? (
                        <img
                          src={previewLogoUrl}
                          alt={platformName || 'Logo da plataforma'}
                          referrerPolicy="no-referrer"
                          className="h-9 max-w-[140px] object-contain"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-[#151515] text-[#FFED00] flex items-center justify-center font-display font-bold text-sm">
                          {(platformName || 'PL').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-display text-base font-bold text-[#151515] leading-tight">
                          {platformName.trim() || 'Pontos Legais'}
                        </p>
                        {companyName.trim() && (
                          <p className="text-[11px] font-medium text-[#151515]/75">
                            {companyName.trim()}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="bg-[#151515] text-white px-3.5 py-1.5 rounded-lg text-right">
                      <span className="block text-[10px] uppercase tracking-wider text-white/70">
                        Valor disponível
                      </span>
                      <span className="font-display text-sm font-bold text-[#FFED00] tabular-nums">
                        {formatBrl(CAMPAIGN_BRL_VALUE)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 bg-white rounded-xl border border-black/10 p-5 space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#0038A8]">
                        Olá, Participante Exemplo
                      </p>
                      <h3 className="font-display text-lg font-bold text-[#151515] mt-1">
                        {rpTitle.trim() || 'Confirme seus dados para concluir sua solicitação de resgate.'}
                      </h3>
                      <p className="text-xs text-neutral-600 mt-1">
                        {rpSubtitle.trim() || 'Informe os dados da conta corrente de sua titularidade para depósito.'}
                      </p>
                    </div>

                    <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3.5 py-2.5 text-xs">
                      <span className="text-neutral-500 block">Banco para depósito</span>
                      <span className="font-semibold text-[#151515]">
                        {bankLabel.trim() || 'Banco do Brasil — 001'}
                      </span>
                    </div>

                    <div className={`grid gap-2.5 ${showAgencyDigit ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                      <div className="rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-400">
                        Agência (0000)
                      </div>
                      {showAgencyDigit && (
                        <div className="rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-400">
                          Dígito (opcional)
                        </div>
                      )}
                      <div className="rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-400">
                        Conta corrente
                      </div>
                      <div className="rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-400">
                        Dígito conta
                      </div>
                    </div>

                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      {rpInfoText.trim() || 'A solicitação será analisada e processada para a conta corrente informada.'}
                    </p>

                    <div className="w-full h-11 rounded-lg bg-[#0038A8] text-white font-display font-bold text-xs sm:text-sm flex items-center justify-center uppercase tracking-wide">
                      {confirmButtonText.trim() || 'CONFIRMAR RESGATE'}
                    </div>
                  </div>
                </div>
              </section>

              {/* Upload Logo da Plataforma */}
              <section className="bg-white border border-neutral-200 rounded-xl p-6">
                <h2 className="font-display text-lg font-bold text-[#151515] mb-1">
                  Logo da plataforma na página de resgate
                </h2>
                <p className="text-sm text-neutral-600 mb-5">
                  Envie uma logo exclusiva para o topo da página de resgate (PNG, JPG ou WEBP até 1,5 MB). Se não enviar, será usada a logo principal do site.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  <div
                    className="md:col-span-4 flex flex-col items-center justify-center p-5 border border-black/15 rounded-lg min-h-[140px]"
                    style={{ backgroundColor: previewBgColor }}
                  >
                    {settings.redemptionPage.redemptionLogoUrl ? (
                      <img
                        src={settings.redemptionPage.redemptionLogoUrl}
                        alt="Logo da página de resgate"
                        referrerPolicy="no-referrer"
                        className="max-h-20 max-w-full object-contain"
                      />
                    ) : settings.brandLogoUrl ? (
                      <div className="text-center space-y-2">
                        <img
                          src={settings.brandLogoUrl}
                          alt="Logo principal (herdado)"
                          referrerPolicy="no-referrer"
                          className="max-h-14 max-w-full object-contain mx-auto opacity-85"
                        />
                        <p className="text-[11px] font-medium text-[#151515]">
                          Usando logo principal do portal
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-[#151515]/80 text-center font-medium">
                        Nenhuma logo exclusiva enviada.
                        <br />
                        Exibindo iniciais da plataforma.
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-8">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setRedemptionDragActive(true);
                      }}
                      onDragLeave={() => setRedemptionDragActive(false)}
                      onDrop={handleRedemptionDrop}
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        redemptionDragActive ? 'border-[#0038A8] bg-[#FFED00]/20' : 'border-neutral-300 bg-neutral-50/60'
                      }`}
                    >
                      <input
                        ref={redemptionFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleRedemptionFileChange}
                        className="hidden"
                        id="redemption-logo-upload-input"
                      />
                      <Upload className="w-6 h-6 text-neutral-500 mx-auto mb-2" aria-hidden="true" />
                      <p className="text-sm font-medium text-[#151515] mb-1">
                        Arraste a logo da plataforma aqui ou clique para selecionar
                      </p>
                      <p className="text-xs text-neutral-500 mb-4">
                        PNG, JPG ou WEBP · Máximo 1,5 MB
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          disabled={uploadingRedemptionLogo}
                          onClick={() => redemptionFileInputRef.current?.click()}
                          className="px-4 py-2 bg-[#151515] hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          {uploadingRedemptionLogo ? 'Enviando...' : 'Subir logo da plataforma'}
                        </button>
                        {settings.redemptionPage.redemptionLogoUrl && (
                          <button
                            type="button"
                            disabled={uploadingRedemptionLogo}
                            onClick={handleRemoveRedemptionLogo}
                            className="px-4 py-2 bg-white border border-neutral-300 hover:bg-red-50 hover:border-red-300 hover:text-red-700 text-neutral-700 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer"
                          >
                            Remover logo exclusiva
                          </button>
                        )}
                      </div>
                    </div>

                    {redemptionLogoFeedback && (
                      <div
                        role="status"
                        className={`mt-3 p-3 rounded-lg border text-xs sm:text-sm flex items-center gap-2 ${
                          redemptionLogoFeedback.type === 'ok'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        {redemptionLogoFeedback.type === 'ok' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        <span>{redemptionLogoFeedback.text}</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Configurações de Marca, Cores, Textos e Botões */}
              <section className="bg-white border border-neutral-200 rounded-xl p-6">
                <h2 className="font-display text-lg font-bold text-[#151515] mb-1">
                  Identidade, cores, textos e botões
                </h2>
                <p className="text-sm text-neutral-600 mb-6">
                  Personalize o nome da plataforma, cor de fundo amarela, textos de orientação e rótulos dos botões principais.
                </p>

                <form onSubmit={handleSaveRedemptionSettings} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                      <label htmlFor="rp-platformName" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Nome da plataforma
                      </label>
                      <input
                        id="rp-platformName"
                        type="text"
                        required
                        maxLength={60}
                        value={platformName}
                        onChange={(e) => setPlatformName(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                      />
                    </div>

                    <div>
                      <label htmlFor="rp-companyName" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Nome da empresa / programa
                      </label>
                      <input
                        id="rp-companyName"
                        type="text"
                        maxLength={80}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                      />
                    </div>

                    <div>
                      <label htmlFor="rp-bgColor" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Cor de fundo da página
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label="Selecionar cor de fundo"
                          value={previewBgColor}
                          onChange={(e) => setBackgroundColor(e.target.value.toUpperCase())}
                          className="w-11 h-11 p-1 rounded-lg border border-neutral-300 bg-white cursor-pointer shrink-0"
                        />
                        <input
                          id="rp-bgColor"
                          type="text"
                          maxLength={7}
                          value={backgroundColor}
                          onChange={(e) => setBackgroundColor(e.target.value)}
                          placeholder="#FFED00"
                          className="w-full h-11 px-3 rounded-lg bg-white border border-neutral-300 text-sm font-mono uppercase text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                        />
                        <button
                          type="button"
                          onClick={() => setBackgroundColor('#FFED00')}
                          className="px-2.5 h-11 text-xs font-medium text-neutral-600 hover:text-[#151515] border border-neutral-300 rounded-lg whitespace-nowrap cursor-pointer"
                        >
                          Padrão
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="rp-title" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Título principal da página de resgate
                      </label>
                      <input
                        id="rp-title"
                        type="text"
                        required
                        maxLength={140}
                        value={rpTitle}
                        onChange={(e) => setRpTitle(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                      />
                    </div>

                    <div>
                      <label htmlFor="rp-bankLabel" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Banco exibido para depósito
                      </label>
                      <input
                        id="rp-bankLabel"
                        type="text"
                        required
                        maxLength={80}
                        value={bankLabel}
                        onChange={(e) => setBankLabel(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="rp-subtitle" className="block text-sm font-medium text-[#151515] mb-1.5">
                      Subtítulo da página de resgate
                    </label>
                    <input
                      id="rp-subtitle"
                      type="text"
                      maxLength={240}
                      value={rpSubtitle}
                      onChange={(e) => setRpSubtitle(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="rp-depositInstructions" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Instruções dos campos bancários
                      </label>
                      <textarea
                        id="rp-depositInstructions"
                        rows={3}
                        maxLength={320}
                        value={depositInstructions}
                        onChange={(e) => setDepositInstructions(e.target.value)}
                        className="w-full p-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                      />
                    </div>

                    <div>
                      <label htmlFor="rp-infoText" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Texto informativo de segurança
                      </label>
                      <textarea
                        id="rp-infoText"
                        rows={3}
                        maxLength={400}
                        value={rpInfoText}
                        onChange={(e) => setRpInfoText(e.target.value)}
                        className="w-full p-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-neutral-200">
                    <p className="text-sm font-semibold text-[#151515] mb-3">
                      Rótulos dos botões de ação
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="rp-btn-convert" className="block text-xs font-medium text-neutral-600 mb-1">
                          Botão na tela de resultado
                        </label>
                        <input
                          id="rp-btn-convert"
                          type="text"
                          required
                          maxLength={60}
                          value={convertButtonText}
                          onChange={(e) => setConvertButtonText(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                        />
                      </div>
                      <div>
                        <label htmlFor="rp-btn-ownership" className="block text-xs font-medium text-neutral-600 mb-1">
                          Botão de confirmação de titularidade
                        </label>
                        <input
                          id="rp-btn-ownership"
                          type="text"
                          required
                          maxLength={60}
                          value={ownershipButtonText}
                          onChange={(e) => setOwnershipButtonText(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                        />
                      </div>
                      <div>
                        <label htmlFor="rp-btn-request" className="block text-xs font-medium text-neutral-600 mb-1">
                          Botão após confirmar titularidade
                        </label>
                        <input
                          id="rp-btn-request"
                          type="text"
                          required
                          maxLength={60}
                          value={requestButtonText}
                          onChange={(e) => setRequestButtonText(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                        />
                      </div>
                      <div>
                        <label htmlFor="rp-btn-confirm" className="block text-xs font-medium text-neutral-600 mb-1">
                          Botão final na página de resgate
                        </label>
                        <input
                          id="rp-btn-confirm"
                          type="text"
                          required
                          maxLength={60}
                          value={confirmButtonText}
                          onChange={(e) => setConfirmButtonText(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C]"
                        />
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 text-sm text-neutral-700 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={showAgencyDigit}
                      onChange={(e) => setShowAgencyDigit(e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-300 accent-[#0038A8]"
                    />
                    <span>Exibir campo opcional de dígito da agência no formulário de depósito</span>
                  </label>

                  {redemptionFeedback && (
                    <div
                      role="status"
                      className={`p-3 rounded-lg border text-xs sm:text-sm flex items-center gap-2 ${
                        redemptionFeedback.type === 'ok'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      {redemptionFeedback.type === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      )}
                      <span>{redemptionFeedback.text}</span>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingRedemption}
                      className="h-11 px-6 bg-[#FE0A8C] hover:bg-[#DF067A] disabled:bg-[#FE0A8C]/60 text-white text-sm font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      {savingRedemption ? 'Salvando...' : 'Salvar página de resgate'}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {/* TAB 2: CONSULTAS */}
          {activeTab === 'consultas' && (
            <div className="space-y-6">
              {/* Metrics Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-neutral-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-neutral-500 mb-1">Consultas registradas</p>
                  <p className="font-display text-2xl font-bold text-[#151515] tabular-nums">
                    {totalConsultas.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-neutral-500 mb-1">Solicitações de resgate</p>
                  <p className="font-display text-2xl font-bold text-[#C8006B] tabular-nums">
                    {totalTrocas.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-neutral-500 mb-1">Total de pontos</p>
                  <p className="font-display text-2xl font-bold text-[#151515] tabular-nums">
                    {totalPontos.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              {/* Filter & Export Toolbar */}
              <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-neutral-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por participante, CPF ou protocolo..."
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:border-[#FE0A8C]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
                      {(
                        [
                          ['todas', 'Todas'],
                          ['consultado', 'Consultado'],
                          ['troca_solicitada', 'Em processamento'],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setStatusFilter(val)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                            statusFilter === val
                              ? 'bg-white text-[#151515] shadow-sm'
                              : 'text-neutral-600 hover:text-[#151515]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleExportCsv}
                      disabled={filteredConsultas.length === 0}
                      className="h-9 px-3.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 text-xs font-semibold text-[#151515] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Exportar CSV</span>
                    </button>
                  </div>
                </div>

                {loadingConsultas ? (
                  <div className="p-8 text-center text-sm text-neutral-500">
                    Carregando registros...
                  </div>
                ) : consultasError ? (
                  <div className="p-8 text-center text-sm text-red-700">{consultasError}</div>
                ) : filteredConsultas.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-sm font-medium text-[#151515] mb-1">
                      Nenhuma consulta encontrada
                    </p>
                    <p className="text-xs text-neutral-500">
                      {consultas.length === 0
                        ? 'As consultas geradas no portal aparecerão aqui.'
                        : 'Ajuste os filtros ou a busca para visualizar outros registros.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                          <th className="py-3 px-4">Protocolo</th>
                          <th className="py-3 px-4">Participante</th>
                          <th className="py-3 px-4">CPF / Contato</th>
                          <th className="py-3 px-4 text-right">Pontos</th>
                          <th className="py-3 px-4 text-right">Valor em R$</th>
                          <th className="py-3 px-4">Status / Conta para Depósito</th>
                          <th className="py-3 px-4">Data</th>
                          <th className="py-3 px-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {filteredConsultas.map((row) => {
                          const rowBrl =
                            typeof row.amountBrl === 'number' && Number.isFinite(row.amountBrl)
                              ? row.amountBrl
                              : calculateConvertedBrl(row.pointsAvailable, getRateLabelForRow(row));
                          return (
                            <tr key={row.id} className="hover:bg-neutral-50/70">
                              <td className="py-3 px-4 font-mono text-xs text-neutral-700 tabular-nums whitespace-nowrap">
                                {row.protocol}
                              </td>
                              <td className="py-3 px-4 font-medium text-[#151515]">
                                {row.profileLabel}
                              </td>
                              <td className="py-3 px-4 font-mono text-xs text-neutral-600 tabular-nums whitespace-nowrap">
                                <div>{row.cpfMasked || '***.***.***-**'}</div>
                                <div className="text-neutral-400">{row.phoneMasked || '(**) *****-****'}</div>
                              </td>
                              <td className="py-3 px-4 font-mono text-right font-semibold text-[#151515] tabular-nums whitespace-nowrap">
                                {row.pointsAvailable.toLocaleString('pt-BR')}
                              </td>
                              <td className="py-3 px-4 font-mono text-right font-semibold text-[#C8006B] tabular-nums whitespace-nowrap">
                                {formatBrl(rowBrl)}
                              </td>
                              <td className="py-3 px-4">
                                {row.status === 'troca_solicitada' ? (
                                  <div className="text-xs">
                                    <span className="font-semibold text-[#C8006B]">
                                      Em análise e processamento
                                    </span>
                                    {(row.bankLabel || row.agencyMasked || row.accountMasked) && (
                                      <span className="block font-mono text-neutral-500">
                                        {row.bankLabel || 'Conta Corrente'} · Ag. {row.agencyMasked || '***'} · CC {row.accountMasked || '***'}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs font-medium text-neutral-600">
                                    Apenas consultado
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-xs text-neutral-500 tabular-nums whitespace-nowrap">
                                {new Date(row.createdAt).toLocaleString('pt-BR')}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteConsulta(row.id)}
                                  aria-label={`Excluir registro ${row.protocol}`}
                                  className="p-1.5 text-neutral-400 hover:text-red-700 rounded transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SEGURANÇA */}
          {activeTab === 'seguranca' && (
            <section className="bg-white border border-neutral-200 rounded-xl p-6 max-w-xl">
              <h2 className="font-display text-lg font-bold text-[#151515] mb-1">
                Senha do painel administrativo
              </h2>

              {settings.passcodeManagedByEnv ? (
                <div className="mt-4 p-4 rounded-lg bg-neutral-50 border border-neutral-200 text-sm text-neutral-700 leading-relaxed">
                  A autenticação deste ambiente é gerenciada pela variável privada{' '}
                  <span className="font-mono font-semibold text-[#151515]">ADMIN_PASSCODE</span> em{' '}
                  <strong>Settings &gt; Secrets</strong>. Para alterar a senha, atualize o segredo diretamente no painel de configurações do projeto.
                </div>
              ) : (
                <>
                  <p className="text-sm text-neutral-600 mb-6">
                    Atualize a senha usada para entrar no endereço <span className="font-mono">/painel</span> em modo local.
                  </p>

                  <form onSubmit={handleUpdatePasscode} className="space-y-4">
                    <div>
                      <label htmlFor="currentPasscode" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Senha atual
                      </label>
                      <input
                        id="currentPasscode"
                        type="password"
                        required
                        value={currentPasscode}
                        onChange={(e) => setCurrentPasscode(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>

                    <div>
                      <label htmlFor="newPasscode" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Nova senha
                      </label>
                      <input
                        id="newPasscode"
                        type="password"
                        required
                        minLength={4}
                        value={newPasscode}
                        onChange={(e) => setNewPasscode(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>

                    <div>
                      <label htmlFor="confirmPasscode" className="block text-sm font-medium text-[#151515] mb-1.5">
                        Confirmar nova senha
                      </label>
                      <input
                        id="confirmPasscode"
                        type="password"
                        required
                        minLength={4}
                        value={confirmPasscode}
                        onChange={(e) => setConfirmPasscode(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>

                    {passcodeFeedback && (
                      <div
                        role="status"
                        className={`p-3 rounded-lg border text-xs sm:text-sm flex items-center gap-2 ${
                          passcodeFeedback.type === 'ok'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        {passcodeFeedback.type === 'ok' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        <span>{passcodeFeedback.text}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={savingPasscode}
                      className="h-11 px-6 bg-[#FE0A8C] hover:bg-[#DF067A] disabled:bg-[#FE0A8C]/60 text-white text-sm font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      {savingPasscode ? 'Atualizando...' : 'Atualizar senha'}
                    </button>
                  </form>
                </>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
