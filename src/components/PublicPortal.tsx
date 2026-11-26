import { useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Gift,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import type { ConsultaPublicResult, SiteSettings } from '../types';
import {
  calculateConvertedBrl,
  calculatePointsForBrl,
  formatBrl,
} from '../utils/points';
import { BrandMark } from './BrandMark';

interface PublicPortalProps {
  settings: SiteSettings;
  storageError: string | null;
  onNavigate: (path: string) => void;
}

const SHOWCASE_IMAGE_URL = '/src/assets/images/loyalty_rewards_showcase_1795672630305.jpg';

const FAQ_ITEMS = [
  {
    q: 'Como sei quantos reais meus pontos valem?',
    a: 'Cada modalidade de troca possui uma taxa de conversão transparente (por exemplo, 1.000 pontos = R$ 50,00). Ao verificar seu saldo, calculamos automaticamente o valor exato em reais que você recebe.',
  },
  {
    q: 'Quantos pontos são necessários para trocar por R$ 50,00 ou R$ 100,00?',
    a: 'Na modalidade principal de crédito em fatura ou desconto, 1.000 pontos equivalem a R$ 50,00 e 2.000 pontos equivalem a R$ 100,00. Você também pode conferir os valores exatos na tabela de conversão.',
  },
  {
    q: 'Como funciona o registro da troca de pontos?',
    a: 'Após consultar seus pontos disponíveis e visualizar o valor em reais correspondente, basta escolher a opção desejada e confirmar a troca para gerar seu protocolo na hora.',
  },
  {
    q: 'Posso fazer uma nova consulta quando quiser?',
    a: 'Sim. Ao concluir uma etapa, clique em Fazer nova consulta para verificar novamente os pontos disponíveis e as opções de conversão.',
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

  const [targetBrlPreset, setTargetBrlPreset] = useState<number>(100);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [showcaseImgFailed, setShowcaseImgFailed] = useState(false);

  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const primaryRateLabel = settings.exchangeOptions[0]?.rateLabel ?? '1.000 pts = R$ 50,00';
  const selectedOption =
    settings.exchangeOptions.find((opt) => opt.id === selectedOptionId) ??
    settings.exchangeOptions[0];

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
      const data = (await response.json()) as ConsultaPublicResult & { error?: string };
      if (!response.ok) {
        setFormError(data.error || 'Não foi possível verificar seus pontos no momento.');
        return;
      }
      setConsultaResult(data);
      setSelectedOptionId(settings.exchangeOptions[0]?.id ?? 'credito-fatura');
      setExchangeError(null);
    } catch {
      setFormError('Erro de conexão ao verificar seus pontos. Tente novamente.');
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
      const data = (await response.json()) as ConsultaPublicResult & { error?: string };
      if (!response.ok) {
        setExchangeError(data.error || 'Não foi possível confirmar a troca.');
        return;
      }
      setConsultaResult(data);
    } catch {
      setExchangeError('Erro de conexão ao confirmar a troca. Tente novamente.');
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

  const bestBrlForResult = consultaResult
    ? Math.max(
        ...settings.exchangeOptions.map((opt) =>
          calculateConvertedBrl(consultaResult.pointsAvailable, opt.rateLabel),
        ),
      )
    : 0;

  const selectedConvertedBrl =
    consultaResult && selectedOption
      ? calculateConvertedBrl(consultaResult.pointsAvailable, selectedOption.rateLabel)
      : 0;

  const confirmedOption =
    consultaResult?.selectedOptionTitle
      ? settings.exchangeOptions.find((opt) => opt.title === consultaResult.selectedOptionTitle) ??
        selectedOption
      : selectedOption;

  const confirmedBrlValue =
    consultaResult && confirmedOption
      ? calculateConvertedBrl(consultaResult.pointsAvailable, confirmedOption.rateLabel)
      : 0;

  const presetPointsNeeded = calculatePointsForBrl(targetBrlPreset, primaryRateLabel);

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#151515]">
      {/* Top Bar Contract: strictly 3 zones */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <BrandMark
            brandName={settings.brandName}
            brandLogoUrl={settings.brandLogoUrl}
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#151515]/75">
            <a
              href="#formulario-pontos"
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Consultar
            </a>
            <a
              href="#como-funciona"
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Conversão
            </a>
            <a
              href="#opcoes-troca"
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Opções de troca
            </a>
            <a
              href="#duvidas"
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Dúvidas
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={focusForm}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#FE0A8C] hover:bg-[#DF067A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE0A8C] focus-visible:ring-offset-2"
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

        {/* Hero & Interactive Points Conversion Form (#151515 + #FFFFFF + #FE0A8C) */}
        <section className="bg-[#151515] text-white border-b border-neutral-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              {/* Left Column: Proposition */}
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-sm font-semibold text-[#FE0A8C] mb-3">
                  {settings.brandName} · Programa de Pontos
                </p>
                <h1
                  className="font-display font-bold text-white tracking-tight leading-[1.12] mb-5"
                  style={{ fontSize: 'clamp(2.125rem, 3.8vw, 3.25rem)', textWrap: 'balance' }}
                >
                  {settings.heroTitle}
                </h1>
                <p className="text-base sm:text-lg text-neutral-300 leading-relaxed max-w-xl mb-8">
                  {settings.heroSubtitle}
                </p>

                <div className="border-t border-white/15 pt-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <p className="font-display font-semibold text-sm text-white mb-1">
                      01. Confira o saldo
                    </p>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      Veja na hora quantos pontos estão disponíveis para troca.
                    </p>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-sm text-white mb-1">
                      02. Valor em reais
                    </p>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      Saiba exatamente quantos pontos precisa para cada valor em R$.
                    </p>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-sm text-white mb-1">
                      03. Troque agora
                    </p>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      Escolha o benefício e receba seu protocolo de conversão.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column: Crisp White Interactive Card */}
              <div id="formulario-pontos" className="lg:col-span-6 flex flex-col justify-center">
                <div className="bg-white text-[#151515] border border-neutral-200 rounded-xl p-6 sm:p-8">
                  {!consultaResult && (
                    <form onSubmit={handleConsultarSubmit} noValidate>
                      <div className="mb-5">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#151515] tracking-tight">
                            {settings.formHeading}
                          </h2>
                          <ShieldCheck className="w-5 h-5 text-[#FE0A8C] shrink-0" aria-hidden="true" />
                        </div>
                        <p className="text-sm text-neutral-600 leading-relaxed">
                          Consulte seu saldo disponível e veja quanto seus pontos valem em reais na conversão direta.
                        </p>
                      </div>

                      {/* Referência rápida de pontos por valor */}
                      <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200 mb-6 bg-neutral-50/70">
                        <div className="px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-neutral-500">
                          <span>Pontos necessários</span>
                          <span>Valor convertido</span>
                        </div>
                        {[50, 100, 250].map((brl) => {
                          const ptsNeeded = calculatePointsForBrl(brl, primaryRateLabel);
                          return (
                            <div
                              key={brl}
                              className="px-4 py-2.5 flex items-center justify-between text-sm"
                            >
                              <span className="font-mono font-medium text-[#151515] tabular-nums">
                                {ptsNeeded.toLocaleString('pt-BR')} pontos
                              </span>
                              <span className="font-display font-bold text-[#C8006B] tabular-nums">
                                {formatBrl(brl)}
                              </span>
                            </div>
                          );
                        })}
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
                        className="w-full h-12 px-5 bg-[#FE0A8C] hover:bg-[#DF067A] disabled:bg-[#FE0A8C]/60 text-white text-sm font-bold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE0A8C] focus-visible:ring-offset-2"
                      >
                        <span>
                          {submitting ? 'Verificando pontos...' : 'Verificar pontos disponíveis'}
                        </span>
                        {!submitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                      </button>

                      <p className="mt-4 text-xs text-neutral-500 leading-relaxed">
                        Consulta imediata pelo portal {settings.brandName} · Taxa base de {primaryRateLabel}.
                      </p>
                    </form>
                  )}

                  {/* Etapa 2: Saldo encontrado + conversão exata em R$ */}
                  {consultaResult && consultaResult.status === 'consultado' && (
                    <div>
                      <div className="flex items-start justify-between gap-4 pb-5 border-b border-neutral-200">
                        <div>
                          <p className="text-xs font-semibold text-[#C8006B] mb-1">
                            Saldo liberado para conversão
                          </p>
                          <h2 className="font-display text-lg font-bold text-[#151515]">
                            {consultaResult.profileLabel}
                          </h2>
                          <p className="text-xs text-neutral-500 font-mono tabular-nums mt-0.5">
                            Protocolo {consultaResult.protocol} · Ref. {consultaResult.referenceCode}
                          </p>
                        </div>
                      </div>

                      <div className="py-5 border-b border-neutral-200">
                        <p className="text-sm text-neutral-600 mb-1">
                          Você tem{' '}
                          <strong className="text-[#151515] font-display tabular-nums">
                            {consultaResult.pointsAvailable.toLocaleString('pt-BR')} {settings.pointsLabel}
                          </strong>{' '}
                          que podem ser convertidos em até:
                        </p>
                        <div className="flex items-baseline gap-3 mt-1">
                          <span className="font-display text-3xl sm:text-4xl font-bold text-[#151515] tabular-nums">
                            {formatBrl(bestBrlForResult)}
                          </span>
                          <span className="text-xs font-mono text-neutral-500 tabular-nums">
                            ({consultaResult.pointsAvailable.toLocaleString('pt-BR')} pts)
                          </span>
                        </div>
                      </div>

                      <div className="pt-5">
                        <p className="text-sm font-semibold text-[#151515] mb-3">
                          Escolha como deseja converter seus pontos:
                        </p>
                        <div className="space-y-2.5">
                          {settings.exchangeOptions.map((option) => {
                            const selected = selectedOptionId === option.id;
                            const optionBrl = calculateConvertedBrl(
                              consultaResult.pointsAvailable,
                              option.rateLabel,
                            );
                            return (
                              <label
                                key={option.id}
                                className={`block p-3.5 rounded-lg border cursor-pointer transition-colors ${
                                  selected
                                    ? 'bg-neutral-50 border-[#FE0A8C] ring-1 ring-[#FE0A8C]'
                                    : 'bg-white border-neutral-200 hover:border-neutral-300'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <input
                                    type="radio"
                                    name="exchangeOption"
                                    value={option.id}
                                    checked={selected}
                                    onChange={() => setSelectedOptionId(option.id)}
                                    className="mt-1 accent-[#FE0A8C]"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-semibold text-[#151515]">
                                        {option.title}
                                      </span>
                                      <span className="font-display text-sm font-bold text-[#C8006B] tabular-nums whitespace-nowrap">
                                        {formatBrl(optionBrl)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                      <p className="text-xs text-neutral-600">{option.description}</p>
                                      <span className="text-[11px] font-mono text-neutral-500 tabular-nums whitespace-nowrap">
                                        {option.rateLabel}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        <div className="mt-4 px-3.5 py-2.5 rounded-lg bg-[#151515] text-white text-xs flex items-center justify-between gap-2">
                          <span>
                            {consultaResult.pointsAvailable.toLocaleString('pt-BR')} pontos selecionados
                          </span>
                          <span className="font-display font-bold text-sm text-[#FE0A8C] tabular-nums">
                            Receba {formatBrl(selectedConvertedBrl)}
                          </span>
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

                        <div className="mt-4 flex flex-col sm:flex-row gap-3">
                          <button
                            type="button"
                            onClick={handleConfirmExchange}
                            disabled={exchanging}
                            className="flex-1 h-11 px-5 bg-[#FE0A8C] hover:bg-[#DF067A] disabled:bg-[#FE0A8C]/60 text-white text-sm font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {exchanging ? 'Confirmando troca...' : 'Confirmar troca de pontos'}
                          </button>
                          <button
                            type="button"
                            onClick={handleReset}
                            className="h-11 px-4 border border-neutral-300 bg-white hover:bg-neutral-100 text-[#151515] text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Nova consulta
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Etapa 3: Troca confirmada */}
                  {consultaResult && consultaResult.status === 'troca_solicitada' && (
                    <div>
                      <div className="flex items-center gap-2.5 text-emerald-700 mb-3">
                        <CheckCircle2 className="w-6 h-6 shrink-0" aria-hidden="true" />
                        <h2 className="font-display text-xl font-bold text-[#151515]">
                          Troca de pontos confirmada
                        </h2>
                      </div>
                      <p className="text-sm text-neutral-600 leading-relaxed mb-5">
                        A conversão de{' '}
                        <strong className="text-[#151515] tabular-nums">
                          {consultaResult.pointsAvailable.toLocaleString('pt-BR')} pontos
                        </strong>{' '}
                        em{' '}
                        <strong className="text-[#C8006B] tabular-nums">
                          {formatBrl(confirmedBrlValue)}
                        </strong>{' '}
                        foi registrada para{' '}
                        <strong className="text-[#151515]">{consultaResult.profileLabel}</strong>.
                      </p>

                      <dl className="bg-neutral-50 border border-neutral-200 rounded-lg divide-y divide-neutral-200 text-sm mb-6">
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-neutral-500">Protocolo</dt>
                          <dd className="font-mono font-semibold text-[#151515] tabular-nums">
                            {consultaResult.protocol}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-neutral-500">Pontos convertidos</dt>
                          <dd className="font-semibold text-[#151515] tabular-nums">
                            {consultaResult.pointsAvailable.toLocaleString('pt-BR')} pts
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-neutral-500">Valor convertido</dt>
                          <dd className="font-display font-bold text-[#C8006B] tabular-nums">
                            {formatBrl(confirmedBrlValue)}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-neutral-500">Modalidade</dt>
                          <dd className="font-medium text-[#151515] text-right">
                            {consultaResult.selectedOptionTitle}
                          </dd>
                        </div>
                      </dl>

                      <button
                        type="button"
                        onClick={handleReset}
                        className="w-full h-11 px-5 border border-neutral-300 bg-white hover:bg-neutral-100 text-[#151515] text-sm font-semibold rounded-lg transition-colors cursor-pointer"
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

        {/* Como Funciona / Tabela & Calculadora de Pontos para R$ */}
        <section id="como-funciona" className="py-16 lg:py-20 bg-neutral-50 border-b border-neutral-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
              <div className="lg:col-span-6">
                {!showcaseImgFailed ? (
                  <img
                    src={SHOWCASE_IMAGE_URL}
                    alt={`Programa de fidelidade ${settings.brandName}`}
                    referrerPolicy="no-referrer"
                    onError={() => setShowcaseImgFailed(true)}
                    className="w-full h-64 sm:h-80 lg:h-full object-cover rounded-xl border border-neutral-200"
                  />
                ) : (
                  <div className="w-full h-64 sm:h-80 lg:h-full min-h-[280px] rounded-xl border border-neutral-200 bg-[#151515] p-8 flex flex-col justify-end text-white">
                    <p className="font-display text-2xl font-bold">{settings.brandName}</p>
                    <p className="text-sm text-neutral-300 mt-1">
                      Converta seus pontos acumulados em reais de forma rápida e transparente.
                    </p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-xs font-semibold text-[#C8006B] mb-2">
                  Conversão direta em reais
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#151515] tracking-tight mb-4">
                  Quantos pontos você precisa para cada valor em reais
                </h2>
                <p className="text-sm sm:text-base text-neutral-600 leading-relaxed mb-6">
                  Selecione um valor desejado abaixo para ver exatamente a quantidade de pontos necessária na modalidade principal.
                </p>

                <div className="bg-white border border-neutral-200 rounded-xl p-5">
                  <div className="flex flex-wrap items-center gap-2 mb-5">
                    {[50, 100, 250, 500].map((amount) => {
                      const active = targetBrlPreset === amount;
                      return (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setTargetBrlPreset(amount)}
                          className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold tabular-nums transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#FE0A8C] text-white'
                              : 'bg-neutral-100 text-[#151515] hover:bg-neutral-200'
                          }`}
                        >
                          {formatBrl(amount)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-baseline justify-between gap-4 border-t border-neutral-200 pt-4">
                    <div>
                      <p className="text-xs text-neutral-500 mb-1">Quantidade necessária</p>
                      <p className="font-display text-2xl sm:text-3xl font-bold text-[#151515] tabular-nums">
                        {presetPointsNeeded.toLocaleString('pt-BR')} pontos
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-neutral-500 mb-1">Equivale a</p>
                      <p className="font-display text-2xl sm:text-3xl font-bold text-[#C8006B] tabular-nums">
                        {formatBrl(targetBrlPreset)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Opções de Troca */}
        <section id="opcoes-troca" className="py-16 lg:py-20 bg-white border-b border-neutral-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl mb-10">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#151515] tracking-tight mb-3">
                Opções disponíveis para troca
              </h2>
              <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
                Confira as modalidades do programa {settings.brandName} e quantos pontos cada opção exige para converter em R$ 100,00.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {settings.exchangeOptions.map((option, index) => {
                const Icon = optionIcons[index % optionIcons.length];
                const ptsFor100 = calculatePointsForBrl(100, option.rateLabel);
                return (
                  <div
                    key={option.id}
                    className="p-6 rounded-xl border border-neutral-200 bg-white flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-[#151515] flex items-center justify-center text-[#FE0A8C] mb-4">
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <h3 className="font-display text-lg font-bold text-[#151515] mb-2">
                        {option.title}
                      </h3>
                      <p className="text-sm text-neutral-600 leading-relaxed mb-5">
                        {option.description}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-neutral-200 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Taxa de conversão</span>
                        <span className="font-mono font-semibold text-[#151515] tabular-nums">
                          {option.rateLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Para receber R$ 100,00</span>
                        <span className="font-mono font-semibold text-[#C8006B] tabular-nums">
                          {ptsFor100.toLocaleString('pt-BR')} pontos
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Dúvidas Frequentes */}
        <section id="duvidas" className="py-16 lg:py-20 bg-neutral-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#151515] tracking-tight mb-8">
              Dúvidas frequentes
            </h2>
            <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-200">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      <span className="font-display text-sm sm:text-base font-semibold text-[#151515]">
                        {item.q}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-[#FE0A8C]' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 text-sm text-neutral-600 leading-relaxed">
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

      <footer className="bg-[#151515] text-neutral-300 border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-3">
            <BrandMark
              brandName={settings.brandName}
              brandLogoUrl={settings.brandLogoUrl}
              size="sm"
              theme="dark"
            />
            <span aria-hidden="true">·</span>
            <span className="text-neutral-400">
              © {new Date().getFullYear()} Todos os direitos reservados
            </span>
          </div>
          <div className="flex items-center gap-6 text-neutral-300">
            <a href="#formulario-pontos" className="hover:text-[#FE0A8C] transition-colors">
              Consultar pontos
            </a>
            <button
              type="button"
              onClick={() => onNavigate('/painel')}
              className="hover:text-[#FE0A8C] transition-colors cursor-pointer"
            >
              Painel Admin
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
