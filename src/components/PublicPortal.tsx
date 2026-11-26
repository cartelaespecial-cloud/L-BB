import { useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Gift,
  Info,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import type { ConsultaPublicResult, SiteSettings } from '../types';
import { BrandMark } from './BrandMark';

interface PublicPortalProps {
  settings: SiteSettings;
  storageError: string | null;
  onNavigate: (path: string) => void;
}

const SHOWCASE_IMAGE_URL = '/src/assets/images/loyalty_rewards_showcase_1795672630305.jpg';

const FAQ_ITEMS = [
  {
    q: 'Preciso informar meu nome ou CPF para consultar os pontos?',
    a: 'Não. Esta consulta funciona com perfis fictícios gerados automaticamente pelo servidor, sem solicitar ou aceitar nome, CPF, e-mail ou qualquer dado pessoal.',
  },
  {
    q: 'Os pontos exibidos têm valor real para resgate?',
    a: 'Não. Trata-se de um saldo ilustrativo sem valor para resgate, utilizado apenas para demonstrar a apuração de pontos e a simulação de escolha de benefícios.',
  },
  {
    q: 'Como funciona a simulação de troca dos pontos?',
    a: 'Ao clicar em verificar pontos disponíveis, um perfil fictício é gerado no servidor com um saldo ilustrativo. Em seguida, você escolhe uma modalidade e registra uma troca simulada com protocolo.',
  },
  {
    q: 'Posso gerar uma nova consulta demonstrativa?',
    a: 'Sim. Basta clicar em Fazer nova consulta ao concluir a etapa atual para gerar um novo perfil fictício e repetir o fluxo.',
  },
];

export function PublicPortal({ settings, storageError, onNavigate }: PublicPortalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [consultaResult, setConsultaResult] = useState<ConsultaPublicResult | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    settings.exchangeOptions[0]?.id ?? 'credito-fatura',
  );
  const [exchanging, setExchanging] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [showcaseImgFailed, setShowcaseImgFailed] = useState(false);

  const submitButtonRef = useRef<HTMLButtonElement>(null);

  function focusForm(): void {
    const el = document.getElementById('formulario-pontos');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      submitButtonRef.current?.focus();
    }, 250);
  }

  async function handleConsultarSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setFormError(null);

    setSubmitting(true);
    try {
      const response = await fetch('/api/consultas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error || 'Não foi possível gerar a consulta no momento.');
        return;
      }
      setConsultaResult(data as ConsultaPublicResult);
      setSelectedOptionId(settings.exchangeOptions[0]?.id ?? 'credito-fatura');
      setExchangeError(null);
    } catch {
      setFormError('Erro de conexão ao gerar a consulta. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmExchange(): Promise<void> {
    if (!consultaResult) return;
    setExchanging(true);
    setExchangeError(null);
    try {
      const response = await fetch(`/api/consultas/${encodeURIComponent(consultaResult.id)}/trocar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId: selectedOptionId,
          claimToken: consultaResult.claimToken,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setExchangeError(data.error || 'Não foi possível registrar a troca simulada.');
        return;
      }
      setConsultaResult(data as ConsultaPublicResult);
    } catch {
      setExchangeError('Erro de conexão ao registrar a troca simulada. Tente novamente.');
    } finally {
      setExchanging(false);
    }
  }

  function handleReset(): void {
    setConsultaResult(null);
    setFormError(null);
    setExchangeError(null);
  }

  const optionIcons = [CreditCard, Gift, Landmark];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: strictly 3 zones */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <BrandMark
            brandName={settings.brandName}
            brandLogoUrl={settings.brandLogoUrl}
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#formulario-pontos"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Consultar
            </a>
            <a
              href="#como-funciona"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Como funciona
            </a>
            <a
              href="#opcoes-troca"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Opções de troca
            </a>
            <a
              href="#duvidas"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Dúvidas
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={focusForm}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              Verificar pontos
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {storageError && (
          <div className="bg-red-50 border-b border-red-200">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 text-xs sm:text-sm text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{storageError}</span>
            </div>
          </div>
        )}

        {/* Hero & Verification Form */}
        <section className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              {/* Left Column: Proposition */}
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-sm font-medium text-blue-800 mb-3">
                  {settings.brandName} · Programa de Fidelidade
                </p>
                <h1
                  className="font-display font-bold text-slate-950 tracking-tight leading-[1.12] mb-5"
                  style={{ fontSize: 'clamp(2.125rem, 3.8vw, 3.25rem)', textWrap: 'balance' }}
                >
                  {settings.heroTitle}
                </h1>
                <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mb-8">
                  {settings.heroSubtitle}
                </p>

                <div className="border-t border-slate-200 pt-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <p className="font-display font-semibold text-sm text-slate-900 mb-1">
                      01. Perfil automático
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Um perfil fictício é gerado no servidor sem dados pessoais.
                    </p>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-sm text-slate-900 mb-1">
                      02. Saldo ilustrativo
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Visualize a pontuação demonstrativa atribuída à consulta.
                    </p>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-sm text-slate-900 mb-1">
                      03. Troca simulada
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Escolha uma modalidade e gere o protocolo ilustrativo.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Form Card */}
              <div id="formulario-pontos" className="lg:col-span-6 flex flex-col justify-center">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 sm:p-8">
                  {!consultaResult && (
                    <form onSubmit={handleConsultarSubmit} noValidate>
                      <div className="mb-6">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-950 tracking-tight">
                            {settings.formHeading}
                          </h2>
                          <ShieldCheck className="w-5 h-5 text-blue-800 shrink-0" aria-hidden="true" />
                        </div>
                        <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5 mb-3">
                          <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>Saldo ilustrativo · sem valor para resgate</span>
                        </p>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          Clique abaixo para gerar um perfil fictício no servidor e verificar os pontos ilustrativos disponíveis para simulação de troca.
                        </p>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-5">
                        <p className="text-xs font-semibold text-slate-800 mb-1">
                          Consulta sem envio de dados pessoais
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Não solicitamos nome, CPF, e-mail ou telefone. Cada solicitação cria um registro fictício exclusivo para visualização do fluxo.
                        </p>
                      </div>

                      {formError && (
                        <div
                          role="alert"
                          className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 flex items-start gap-2"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{formError}</span>
                        </div>
                      )}

                      <button
                        ref={submitButtonRef}
                        type="submit"
                        disabled={submitting}
                        className="w-full h-11 px-5 bg-blue-800 hover:bg-blue-900 disabled:bg-blue-800/60 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                      >
                        <span>
                          {submitting ? 'Gerando consulta...' : 'Verificar pontos disponíveis'}
                        </span>
                        {!submitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                      </button>

                      <p className="mt-4 text-xs text-slate-500 leading-relaxed">
                        Exibição demonstrativa de {settings.brandName} · Nenhum dado pessoal é coletado.
                      </p>
                    </form>
                  )}

                  {/* Etapa 2: Saldo ilustrativo encontrado + escolha da troca simulada */}
                  {consultaResult && consultaResult.status === 'consultado' && (
                    <div>
                      <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-200">
                        <div>
                          <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5 mb-1.5">
                            <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Saldo ilustrativo · sem valor para resgate</span>
                          </p>
                          <h2 className="font-display text-lg font-bold text-slate-950">
                            {consultaResult.profileLabel}
                          </h2>
                          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            Ref. {consultaResult.referenceCode} · Protocolo {consultaResult.protocol}
                          </p>
                        </div>
                      </div>

                      <div className="py-5 border-b border-slate-200">
                        <p className="text-xs font-medium text-slate-500 mb-1">
                          Pontuação demonstrativa gerada
                        </p>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-3xl sm:text-4xl font-bold text-slate-950 tabular-nums">
                            {consultaResult.pointsAvailable.toLocaleString('pt-BR')}
                          </span>
                          <span className="text-sm font-medium text-slate-600">
                            {settings.pointsLabel}
                          </span>
                        </div>
                      </div>

                      <div className="pt-5">
                        <p className="text-sm font-semibold text-slate-900 mb-3">
                          Escolha uma opção para simular a troca:
                        </p>
                        <div className="space-y-2.5">
                          {settings.exchangeOptions.map((option) => {
                            const selected = selectedOptionId === option.id;
                            return (
                              <label
                                key={option.id}
                                className={`block p-3.5 rounded-lg border cursor-pointer transition-colors ${
                                  selected
                                    ? 'bg-white border-blue-800 ring-1 ring-blue-800'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <input
                                    type="radio"
                                    name="exchangeOption"
                                    value={option.id}
                                    checked={selected}
                                    onChange={() => setSelectedOptionId(option.id)}
                                    className="mt-1 accent-blue-800"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-semibold text-slate-900">
                                        {option.title}
                                      </span>
                                      <span className="text-xs font-mono tabular-nums text-blue-800 font-medium whitespace-nowrap">
                                        {option.rateLabel}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-600 mt-0.5">
                                      {option.description}
                                    </p>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {exchangeError && (
                          <div
                            role="alert"
                            className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2"
                          >
                            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>{exchangeError}</span>
                          </div>
                        )}

                        <div className="mt-5 flex flex-col sm:flex-row gap-3">
                          <button
                            type="button"
                            onClick={handleConfirmExchange}
                            disabled={exchanging}
                            className="flex-1 h-11 px-5 bg-blue-800 hover:bg-blue-900 disabled:bg-blue-800/60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {exchanging ? 'Registrando simulação...' : 'Simular troca de pontos'}
                          </button>
                          <button
                            type="button"
                            onClick={handleReset}
                            className="h-11 px-4 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Nova consulta
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Etapa 3: Troca simulada confirmada */}
                  {consultaResult && consultaResult.status === 'troca_solicitada' && (
                    <div>
                      <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5 mb-2">
                        <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Saldo ilustrativo · sem valor para resgate</span>
                      </p>
                      <div className="flex items-center gap-2.5 text-emerald-700 mb-3">
                        <CheckCircle2 className="w-6 h-6 shrink-0" aria-hidden="true" />
                        <h2 className="font-display text-xl font-bold text-slate-950">
                          Troca simulada registrada
                        </h2>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed mb-5">
                        A simulação de conversão foi registrada para{' '}
                        <strong className="text-slate-900">{consultaResult.profileLabel}</strong> sem coleta de dados pessoais.
                      </p>

                      <dl className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200 text-sm mb-6">
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-slate-500">Protocolo</dt>
                          <dd className="font-mono font-semibold text-slate-950 tabular-nums">
                            {consultaResult.protocol}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-slate-500">Referência</dt>
                          <dd className="font-mono text-slate-900 tabular-nums">
                            {consultaResult.referenceCode}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-slate-500">Pontos ilustrativos</dt>
                          <dd className="font-semibold text-slate-950 tabular-nums">
                            {consultaResult.pointsAvailable.toLocaleString('pt-BR')} pts
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-slate-500">Modalidade simulada</dt>
                          <dd className="font-medium text-blue-800 text-right">
                            {consultaResult.selectedOptionTitle}
                          </dd>
                        </div>
                      </dl>

                      <button
                        type="button"
                        onClick={handleReset}
                        className="w-full h-11 px-5 border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Fazer nova consulta
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Como Funciona / Visual Showcase */}
        <section id="como-funciona" className="py-16 lg:py-20 bg-slate-50 border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
              <div className="lg:col-span-7">
                {!showcaseImgFailed ? (
                  <img
                    src={SHOWCASE_IMAGE_URL}
                    alt={`Programa de fidelidade ${settings.brandName}`}
                    referrerPolicy="no-referrer"
                    onError={() => setShowcaseImgFailed(true)}
                    className="w-full h-64 sm:h-80 lg:h-full object-cover rounded-xl border border-slate-200"
                  />
                ) : (
                  <div className="w-full h-64 sm:h-80 lg:h-full min-h-[280px] rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 p-8 flex flex-col justify-end text-white">
                    <p className="font-display text-2xl font-bold">{settings.brandName}</p>
                    <p className="text-sm text-slate-300 mt-1">
                      Demonstração de consulta de pontos e simulação de escolha de benefícios.
                    </p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 flex flex-col justify-center">
                <p className="text-xs font-semibold text-blue-800 mb-2">
                  Experiência demonstrativa segura
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight mb-4">
                  Do saldo ilustrativo ao benefício simulado em poucos cliques
                </h2>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6">
                  Todo o fluxo opera com perfis fictícios gerados automaticamente pelo servidor, preservando a visualização completa das etapas sem coletar informações pessoais.
                </p>

                <dl className="grid grid-cols-2 gap-6 border-t border-slate-200 pt-6">
                  <div>
                    <dt className="text-xs text-slate-500 mb-1">Dados pessoais</dt>
                    <dd className="font-display text-xl font-bold text-slate-950 tabular-nums">
                      Não coletados
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 mb-1">Protocolo ilustrativo</dt>
                    <dd className="font-display text-xl font-bold text-slate-950 tabular-nums">
                      Imediato
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* Opções de Troca */}
        <section id="opcoes-troca" className="py-16 lg:py-20 bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl mb-10">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight mb-3">
                Opções disponíveis para simulação
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Confira as modalidades ilustrativas configuradas para o portal {settings.brandName}.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {settings.exchangeOptions.map((option, index) => {
                const Icon = optionIcons[index % optionIcons.length];
                return (
                  <div
                    key={option.id}
                    className="p-6 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-blue-800 mb-4">
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <h3 className="font-display text-lg font-bold text-slate-950 mb-2">
                        {option.title}
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed mb-4">
                        {option.description}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Referência ilustrativa</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {option.rateLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Dúvidas Frequentes */}
        <section id="duvidas" className="py-16 lg:py-20 bg-slate-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight mb-8">
              Dúvidas frequentes
            </h2>
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <span className="font-display text-sm sm:text-base font-semibold text-slate-900">
                        {item.q}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-3">
            <BrandMark brandName={settings.brandName} brandLogoUrl={settings.brandLogoUrl} size="sm" />
            <span aria-hidden="true">·</span>
            <span>Saldo ilustrativo · sem valor para resgate</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#formulario-pontos" className="hover:text-slate-900 transition-colors">
              Consultar pontos
            </a>
            <button
              type="button"
              onClick={() => onNavigate('/painel')}
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Painel Admin
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
