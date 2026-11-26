import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Lock,
  LogOut,
  Palette,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  ConsultaAdminRecord,
  RedemptionAdminStatus,
  RevealedDepositDetails,
  SiteSettings,
} from '../types';
import { CAMPAIGN_BRL_VALUE, calculateConvertedBrl, formatBrl } from '../utils/points';
import { BrandMark } from './BrandMark';

interface AdminPanelProps {
  settings: SiteSettings;
  adminToken: string | null;
  onLoginSuccess: (token: string) => void;
  onLogout: () => void;
  onSettingsUpdated: (nextSettings: SiteSettings) => void;
  onNavigate: (path: string) => void;
}

type AdminTab = 'marca' | 'solicitacoes' | 'consultas' | 'seguranca';
type StatusFilter = 'todas' | 'consultado' | 'troca_solicitada';

const REDEMPTION_STATUS_OPTIONS: Array<{ value: RedemptionAdminStatus; label: string }> = [
  { value: 'aguardando_analise', label: 'Aguardando análise' },
  { value: 'identidade_verificada', label: 'Identidade verificada' },
  { value: 'correcao_necessaria', label: 'Correção necessária' },
  { value: 'resgate_aprovado', label: 'Resgate aprovado' },
  { value: 'deposito_realizado', label: 'Depósito realizado' },
  { value: 'resgate_recusado', label: 'Resgate recusado' },
];

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

  // Consultas & Solicitações de Resgate state
  const [consultas, setConsultas] = useState<ConsultaAdminRecord[]>([]);
  const [loadingConsultas, setLoadingConsultas] = useState(false);
  const [consultasError, setConsultasError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');

  // Solicitações de Resgate filters & protected actions
  const [reqSearch, setReqSearch] = useState('');
  const [reqDateFilter, setReqDateFilter] = useState('');
  const [reqStatusFilter, setReqStatusFilter] = useState<'todos' | RedemptionAdminStatus>('todos');
  const [revealedMap, setRevealedMap] = useState<Record<string, RevealedDepositDetails>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<
    Record<string, { status: RedemptionAdminStatus; guaranteed24h: boolean; note: string }>
  >({});
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [reqFeedback, setReqFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

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
  }, [settings]);

  useEffect(() => {
    if (!adminToken) return;
    if (activeTab === 'consultas' || activeTab === 'solicitacoes') {
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

  async function handleRevealDepositDetails(id: string): Promise<void> {
    if (!adminToken) return;
    if (revealedMap[id]) {
      setRevealedMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    setRevealingId(id);
    setReqFeedback(null);
    try {
      const response = await fetch(`/api/admin/consultas/${encodeURIComponent(id)}/revelar-dados`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = (await response.json()) as {
        details?: RevealedDepositDetails;
        consulta?: ConsultaAdminRecord;
        error?: string;
      };
      if (!response.ok || !data.details) {
        setReqFeedback({ type: 'err', text: data.error || 'Não foi possível descriptografar os dados.' });
        return;
      }
      setRevealedMap((prev) => ({ ...prev, [id]: data.details! }));
      if (data.consulta) {
        setConsultas((prev) => prev.map((c) => (c.id === id ? data.consulta! : c)));
      }
    } catch {
      setReqFeedback({ type: 'err', text: 'Erro de conexão ao acessar dados protegidos.' });
    } finally {
      setRevealingId(null);
    }
  }

  async function handleUpdateRedemptionStatus(row: ConsultaAdminRecord): Promise<void> {
    if (!adminToken) return;
    const draft = statusDrafts[row.id] ?? {
      status: row.redemptionStatus,
      guaranteed24h: row.guaranteed24h,
      note: '',
    };

    setUpdatingStatusId(row.id);
    setReqFeedback(null);
    try {
      const response = await fetch(`/api/admin/consultas/${encodeURIComponent(row.id)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          redemptionStatus: draft.status,
          guaranteed24h: draft.status === 'resgate_aprovado' && draft.guaranteed24h,
          note: draft.note.trim(),
        }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = (await response.json()) as {
        consulta?: ConsultaAdminRecord;
        error?: string;
      };
      if (!response.ok || !data.consulta) {
        setReqFeedback({ type: 'err', text: data.error || 'Erro ao atualizar status da solicitação.' });
        return;
      }
      setConsultas((prev) => prev.map((c) => (c.id === row.id ? data.consulta! : c)));
      setStatusDrafts((prev) => ({
        ...prev,
        [row.id]: {
          status: data.consulta!.redemptionStatus,
          guaranteed24h: data.consulta!.guaranteed24h,
          note: '',
        },
      }));
      setReqFeedback({
        type: 'ok',
        text: `Status do protocolo ${row.protocol} atualizado e registrado no histórico.`,
      });
    } catch {
      setReqFeedback({ type: 'err', text: 'Erro de conexão ao atualizar status.' });
    } finally {
      setUpdatingStatusId(null);
    }
  }

  function handleExportCsv(): void {
    const headers = [
      'Protocolo',
      'Participante',
      'CPF (Mascarado)',
      'Telefone (Mascarado)',
      'Pontos',
      'Valor Equivalente',
      'Status Resgate',
      'Banco',
      'Agencia (Mascarada)',
      'Conta Corrente (Mascarada)',
      'Data Solicitacao',
    ];
    const rows = filteredConsultas.map((c) => {
      const brl =
        typeof c.amountBrl === 'number' && Number.isFinite(c.amountBrl)
          ? c.amountBrl
          : calculateConvertedBrl(c.pointsAvailable, getRateLabelForRow(c));
      const statusLabel =
        REDEMPTION_STATUS_OPTIONS.find((opt) => opt.value === c.redemptionStatus)?.label ||
        c.redemptionStatus;
      return [
        escapeCsvCell(c.protocol),
        escapeCsvCell(c.profileLabel),
        escapeCsvCell(c.cpfMasked || '***.***.***-**'),
        escapeCsvCell(c.phoneMasked || '(**) *****-****'),
        escapeCsvCell(c.pointsAvailable),
        escapeCsvCell(formatBrl(brl)),
        escapeCsvCell(statusLabel),
        escapeCsvCell(c.bankLabel || '-'),
        escapeCsvCell(c.agencyMasked || '-'),
        escapeCsvCell(c.accountMasked || '-'),
        escapeCsvCell(new Date(c.exchangedAt || c.createdAt).toLocaleString('pt-BR')),
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

  const filteredSolicitacoes = consultas
    .filter((c) => c.status === 'troca_solicitada')
    .filter((item) => {
      if (reqStatusFilter !== 'todos' && item.redemptionStatus !== reqStatusFilter) return false;
      if (reqDateFilter) {
        const refDate = (item.exchangedAt || item.createdAt).slice(0, 10);
        if (refDate !== reqDateFilter) return false;
      }
      if (!reqSearch.trim()) return true;
      const q = reqSearch.toLowerCase().trim();
      const digitsOnly = q.replace(/\D/g, '');
      return (
        item.profileLabel.toLowerCase().includes(q) ||
        (item.cpfMasked || '').toLowerCase().includes(q) ||
        (digitsOnly.length >= 2 && (item.cpfMasked || '').replace(/\D/g, '').includes(digitsOnly)) ||
        item.protocol.toLowerCase().includes(q)
      );
    });

  const totalConsultas = consultas.length;
  const totalTrocas = consultas.filter((c) => c.status === 'troca_solicitada').length;
  const totalPontos = consultas.reduce((acc, item) => acc + item.pointsAvailable, 0);

  const tabTitles: Record<AdminTab, string> = {
    marca: 'Identidade e Logo',
    solicitacoes: 'Solicitações de Resgate',
    consultas: 'Consultas de Pontos',
    seguranca: 'Segurança e Senha',
  };

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
            onClick={() => setActiveTab('solicitacoes')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'solicitacoes'
                ? 'bg-[#151515] text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-[#151515]'
            }`}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Solicitações de Resgate</span>
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

          {/* TAB: SOLICITAÇÕES DE RESGATE */}
          {activeTab === 'solicitacoes' && (
            <div className="space-y-6">
              <div className="bg-white border border-neutral-200 rounded-xl p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#151515]">
                      SOLICITAÇÕES DE RESGATE
                    </h2>
                    <p className="text-xs sm:text-sm text-neutral-600">
                      Dados completos para depósito ficam criptografados e exigem acesso autorizado com registro de auditoria.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 shrink-0">
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    <span>Acesso auditado ativo</span>
                  </div>
                </div>

                {/* Filtros: Cliente, CPF, Protocolo, Data e Status */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-5">
                  <div className="md:col-span-5 relative">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      type="text"
                      value={reqSearch}
                      onChange={(e) => setReqSearch(e.target.value)}
                      placeholder="Filtrar por cliente, CPF ou protocolo..."
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:border-[#FE0A8C]"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <input
                      type="date"
                      aria-label="Filtrar por data"
                      value={reqDateFilter}
                      onChange={(e) => setReqDateFilter(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:border-[#FE0A8C]"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <select
                      aria-label="Filtrar por status do resgate"
                      value={reqStatusFilter}
                      onChange={(e) =>
                        setReqStatusFilter(e.target.value as 'todos' | RedemptionAdminStatus)
                      }
                      className="w-full h-10 px-3 rounded-lg border border-neutral-300 text-sm bg-white focus:outline-none focus:border-[#FE0A8C]"
                    >
                      <option value="todos">Todos os status</option>
                      {REDEMPTION_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {reqFeedback && (
                  <div
                    role="status"
                    className={`mb-4 p-3 rounded-lg border text-xs sm:text-sm flex items-center gap-2 ${
                      reqFeedback.type === 'ok'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    {reqFeedback.type === 'ok' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{reqFeedback.text}</span>
                  </div>
                )}

                {loadingConsultas ? (
                  <div className="p-8 text-center text-sm text-neutral-500">
                    Carregando solicitações de resgate...
                  </div>
                ) : filteredSolicitacoes.length === 0 ? (
                  <div className="p-10 text-center border border-dashed border-neutral-200 rounded-xl">
                    <p className="text-sm font-medium text-[#151515] mb-1">
                      Nenhuma solicitação de resgate encontrada
                    </p>
                    <p className="text-xs text-neutral-500">
                      Quando um participante concluir o envio dos dados bancários, o pedido aparecerá aqui para análise e processamento.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredSolicitacoes.map((row) => {
                      const revealed = revealedMap[row.id];
                      const draft = statusDrafts[row.id] ?? {
                        status: row.redemptionStatus,
                        guaranteed24h: row.guaranteed24h,
                        note: '',
                      };
                      const historyOpen = expandedHistoryId === row.id;

                      return (
                        <article
                          key={row.id}
                          className="border border-neutral-200 rounded-xl p-5 bg-neutral-50/40 space-y-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-neutral-200">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[#151515] text-white">
                                  {row.protocol}
                                </span>
                                <span className="font-display text-base font-bold text-[#151515]">
                                  {row.profileLabel}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-500 mt-1">
                                Solicitado em {new Date(row.exchangedAt || row.createdAt).toLocaleString('pt-BR')}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="font-display text-lg font-bold text-[#C8006B] tabular-nums">
                                {formatBrl(row.amountBrl || CAMPAIGN_BRL_VALUE)}
                              </p>
                              <p className="text-xs font-mono text-neutral-600 tabular-nums">
                                {row.pointsAvailable.toLocaleString('pt-BR')} pontos
                              </p>
                            </div>
                          </div>

                          {/* Dados Cadastrais & Bancários (Protegidos) */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="bg-white border border-neutral-200 rounded-lg p-3.5 space-y-1">
                              <p className="text-neutral-500 font-medium">Titular / CPF / Telefone</p>
                              <p className="font-semibold text-[#151515]">{row.profileLabel}</p>
                              <p className="font-mono text-neutral-700">
                                CPF: {revealed ? revealed.cpf : row.cpfMasked}
                              </p>
                              <p className="font-mono text-neutral-700">
                                Tel: {revealed ? revealed.phone : row.phoneMasked}
                              </p>
                            </div>

                            <div className="bg-white border border-neutral-200 rounded-lg p-3.5 space-y-1">
                              <p className="text-neutral-500 font-medium">Dados Bancários para Depósito</p>
                              <p className="font-semibold text-[#151515]">
                                {revealed ? revealed.bankLabel : row.bankLabel || 'Banco do Brasil — 001'}
                              </p>
                              <p className="font-mono text-neutral-700">
                                Agência:{' '}
                                {revealed
                                  ? `${revealed.agency}${revealed.agencyDigit ? `-${revealed.agencyDigit}` : ''}`
                                  : row.agencyMasked || '-'}
                              </p>
                              <p className="font-mono text-neutral-700">
                                Conta:{' '}
                                {revealed
                                  ? `${revealed.accountNumber}${revealed.accountDigit ? `-${revealed.accountDigit}` : ''}`
                                  : row.accountMasked || '-'}
                              </p>
                            </div>

                            <div className="bg-white border border-neutral-200 rounded-lg p-3.5 space-y-1.5">
                              <p className="text-neutral-500 font-medium">Status do Pedido</p>
                              <p>
                                Titularidade:{' '}
                                <span className="font-semibold text-emerald-700">
                                  {row.ownershipConfirmed ? 'Confirmada' : 'Pendente'}
                                </span>
                              </p>
                              <p className="text-neutral-700">
                                Situação:{' '}
                                <strong className="text-[#151515]">
                                  {REDEMPTION_STATUS_OPTIONS.find((o) => o.value === row.redemptionStatus)?.label}
                                </strong>
                              </p>
                              {row.guaranteed24h && (
                                <p className="text-[11px] font-semibold text-emerald-700">
                                  Previsão: até 24 horas
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Botão de Acesso Protegido + Atualização de Status */}
                          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pt-2 border-t border-neutral-200">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={revealingId === row.id}
                                onClick={() => void handleRevealDepositDetails(row.id)}
                                className="h-9 px-3.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-xs font-semibold text-[#151515] inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span>
                                  {revealingId === row.id
                                    ? 'Descriptografando...'
                                    : revealed
                                      ? 'Ocultar dados completos'
                                      : 'Acessar dados completos (auditado)'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedHistoryId((prev) => (prev === row.id ? null : row.id))
                                }
                                className="h-9 px-3.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-xs font-medium text-neutral-700 inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Histórico ({row.auditHistory?.length || 0})</span>
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                aria-label={`Status do pedido ${row.protocol}`}
                                value={draft.status}
                                onChange={(e) =>
                                  setStatusDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: {
                                      ...draft,
                                      status: e.target.value as RedemptionAdminStatus,
                                    },
                                  }))
                                }
                                className="h-9 px-2.5 rounded-lg border border-neutral-300 bg-white text-xs text-[#151515]"
                              >
                                {REDEMPTION_STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>

                              {draft.status === 'resgate_aprovado' && (
                                <label className="inline-flex items-center gap-1.5 text-xs text-neutral-700 px-2">
                                  <input
                                    type="checkbox"
                                    checked={draft.guaranteed24h}
                                    onChange={(e) =>
                                      setStatusDrafts((prev) => ({
                                        ...prev,
                                        [row.id]: { ...draft, guaranteed24h: e.target.checked },
                                      }))
                                    }
                                    className="w-3.5 h-3.5 accent-[#151515]"
                                  />
                                  <span>Garantir até 24h</span>
                                </label>
                              )}

                              <input
                                type="text"
                                value={draft.note}
                                onChange={(e) =>
                                  setStatusDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: { ...draft, note: e.target.value },
                                  }))
                                }
                                placeholder="Observação (opcional)"
                                maxLength={120}
                                className="h-9 px-2.5 rounded-lg border border-neutral-300 bg-white text-xs w-44"
                              />

                              <button
                                type="button"
                                disabled={updatingStatusId === row.id}
                                onClick={() => void handleUpdateRedemptionStatus(row)}
                                className="h-9 px-3.5 rounded-lg bg-[#FE0A8C] hover:bg-[#DF067A] disabled:bg-[#FE0A8C]/60 text-white text-xs font-bold cursor-pointer"
                              >
                                {updatingStatusId === row.id ? 'Salvando...' : 'Atualizar status'}
                              </button>
                            </div>
                          </div>

                          {/* Histórico de alterações */}
                          {historyOpen && (
                            <div className="bg-white border border-neutral-200 rounded-lg p-3.5 space-y-2">
                              <p className="text-xs font-semibold text-[#151515]">
                                Histórico de alterações e acessos
                              </p>
                              {(!row.auditHistory || row.auditHistory.length === 0) ? (
                                <p className="text-xs text-neutral-500">Sem eventos registrados.</p>
                              ) : (
                                <ul className="space-y-1.5 text-xs">
                                  {row.auditHistory.map((ev) => (
                                    <li
                                      key={ev.id}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-neutral-100 pb-1.5 last:border-b-0 last:pb-0"
                                    >
                                      <div>
                                        <span className="font-semibold text-[#151515]">{ev.action}</span>
                                        {ev.details && (
                                          <span className="text-neutral-600"> — {ev.details}</span>
                                        )}
                                      </div>
                                      <span className="font-mono text-[11px] text-neutral-400 shrink-0">
                                        {new Date(ev.at).toLocaleString('pt-BR')} · {ev.actor}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
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
