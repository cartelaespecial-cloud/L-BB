import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
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

type FlowStep = 'inicio' | 'analisando' | 'resultado' | 'resgatado';

const ANALYSIS_MESSAGES = [
  'Verificando cadastro no sistema...',
  'Calculando saldo de pontos disponíveis...',
  'Convertendo pontos em valor em reais...',
];

export function PublicPortal({ settings, storageError, onNavigate }: PublicPortalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showIntro, setShowIntro] = useState<boolean>(() => !prefersReducedMotion);

  const [step, setStep] = useState<FlowStep>('inicio');
  const [analysisPhase, setAnalysisPhase] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const [consultaResult, setConsultaResult] = useState<ConsultaPublicResult | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  const verifyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      setShowIntro(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowIntro(false);
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (step !== 'analisando') return;
    setAnalysisPhase(0);
    const t1 = window.setTimeout(() => setAnalysisPhase(1), 400);
    const t2 = window.setTimeout(() => setAnalysisPhase(2), 820);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [step]);

  const accountOption = settings.exchangeOptions.find((opt) => opt.id === 'saldo-conta') ?? {
    id: 'saldo-conta',
    title: 'Resgate em Saldo em Conta',
    description: 'Conversão direta dos pontos disponíveis em saldo em conta',
    rateLabel: settings.exchangeOptions[0]?.rateLabel ?? '1.000 pts = R$ 50,00',
  };
  const primaryRateLabel = accountOption.rateLabel;

  const minRangeBrl = calculateConvertedBrl(settings.minPointsPreview, primaryRateLabel);
  const maxRangeBrl = calculateConvertedBrl(settings.maxPointsPreview, primaryRateLabel);

  const convertedAccountBrl = consultaResult
    ? calculateConvertedBrl(consultaResult.pointsAvailable, primaryRateLabel)
    : 0;

  function focusVerifyAction(): void {
    const el = document.getElementById('painel-conversao');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.setTimeout(() => {
      verifyButtonRef.current?.focus();
    }, 200);
  }

  async function handleStartVerification(): Promise<void> {
    setFormError(null);
    setExchangeError(null);
    setStep('analisando');

    const minDelay = prefersReducedMotion
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.setTimeout(resolve, 1250));

    try {
      const [response] = await Promise.all([
        fetch('/api/consultas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        minDelay,
      ]);

      const data = (await response.json()) as ConsultaPublicResult & { error?: string };
      if (!response.ok) {
        setFormError(data.error || 'Não foi possível verificar seus pontos no momento.');
        setStep('inicio');
        return;
      }

      setConsultaResult(data);
      setStep('resultado');
    } catch {
      setFormError('Erro de conexão ao verificar seus pontos. Tente novamente.');
      setStep('inicio');
    }
  }

  async function handleConfirmRedeem(): Promise<void> {
    if (!consultaResult) return;
    setExchanging(true);
    setExchangeError(null);
    try {
      const response = await fetch(`/api/consultas/${encodeURIComponent(consultaResult.id)}/trocar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId: accountOption.id,
          claimToken: consultaResult.claimToken,
        }),
      });
      const data = (await response.json()) as ConsultaPublicResult & { error?: string };
      if (!response.ok) {
        setExchangeError(data.error || 'Não foi possível concluir o resgate.');
        return;
      }
      setConsultaResult(data);
      setStep('resgatado');
    } catch {
      setExchangeError('Erro de conexão ao resgatar seus pontos. Tente novamente.');
    } finally {
      setExchanging(false);
    }
  }

  function handleReset(): void {
    setConsultaResult(null);
    setFormError(null);
    setExchangeError(null);
    setStep('inicio');
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#151515]">
      {/* Animação de entrada ao acessar o site */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            key="portal-intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 bg-[#151515] text-white flex flex-col items-center justify-center px-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center text-center"
            >
              <BrandMark
                brandName={settings.brandName}
                brandLogoUrl={settings.brandLogoUrl}
                size="md"
                theme="dark"
              />
              <p className="mt-4 text-sm text-neutral-300">
                Preparando sua consulta de pontos em reais
              </p>
              <div className="mt-6 w-52 h-1 rounded-full bg-white/15 overflow-hidden">
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '0%' }}
                  transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full bg-[#FE0A8C]"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowIntro(false)}
                className="mt-6 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Entrar agora
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar Contract: 3 zonas limpas */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <BrandMark
            brandName={settings.brandName}
            brandLogoUrl={settings.brandLogoUrl}
            onClick={() => {
              handleReset();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#151515]/75">
            <a
              href="#painel-conversao"
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Verificar
            </a>
            <a
              href="#valores-conversao"
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Valores em R$
            </a>
            <button
              type="button"
              onClick={() => onNavigate('/painel')}
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Painel
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={focusVerifyAction}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#FE0A8C] hover:bg-[#DF067A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE0A8C] focus-visible:ring-offset-2"
            >
              Verificar
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {storageError && (
          <div className="bg-red-50 border-b border-red-200">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 text-xs sm:text-sm text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{storageError}</span>
            </div>
          </div>
        )}

        {/* Área Principal Enxuta e Interativa (#151515 + #FFFFFF + #FE0A8C) */}
        <section className="flex-1 bg-[#151515] text-white flex items-center">
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* Coluna Esquerda: Mensagem direta */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: showIntro ? 0.95 : 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6"
              >
                <p className="text-sm font-semibold text-[#FE0A8C] mb-3">
                  {settings.brandName}
                </p>
                <h1
                  className="font-display font-bold text-white tracking-tight leading-[1.12] mb-4"
                  style={{ fontSize: 'clamp(2.125rem, 3.8vw, 3.25rem)', textWrap: 'balance' }}
                >
                  {settings.heroTitle}
                </h1>
                <p className="text-base sm:text-lg text-neutral-300 leading-relaxed max-w-lg mb-8">
                  {settings.heroSubtitle}
                </p>

                <div
                  id="valores-conversao"
                  className="border-t border-white/15 pt-6 grid grid-cols-2 gap-6 max-w-md"
                >
                  <div>
                    <p className="text-xs text-neutral-400 mb-1">Faixa de conversão</p>
                    <p className="font-display text-lg sm:text-xl font-bold text-white tabular-nums">
                      {formatBrl(minRangeBrl)} – {formatBrl(maxRangeBrl)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400 mb-1">Referência direta</p>
                    <p className="font-display text-lg sm:text-xl font-bold text-[#FE0A8C] tabular-nums">
                      {primaryRateLabel}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Coluna Direita: Cartão Interativo de Etapas */}
              <motion.div
                id="painel-conversao"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: showIntro ? 1.05 : 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6"
              >
                <div className="bg-white text-[#151515] border border-neutral-200 rounded-xl p-6 sm:p-8 min-h-[340px] flex flex-col justify-center">
                  <AnimatePresence mode="wait">
                    {/* ETAPA 1: Botão Verificar */}
                    {step === 'inicio' && (
                      <motion.div
                        key="step-inicio"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                      >
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#151515] tracking-tight">
                            {settings.formHeading}
                          </h2>
                          <ShieldCheck className="w-5 h-5 text-[#FE0A8C] shrink-0" aria-hidden="true" />
                        </div>
                        <p className="text-sm text-neutral-600 leading-relaxed mb-6">
                          Clique em verificar para consultar seu saldo disponível e conferir o valor exato em R$ para troca.
                        </p>

                        <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200 mb-6 bg-neutral-50/70">
                          {[2000, 3000, 4000].map((brl) => {
                            const ptsNeeded = calculatePointsForBrl(brl, primaryRateLabel);
                            return (
                              <div
                                key={brl}
                                className="px-4 py-2.5 flex items-center justify-between text-sm"
                              >
                                <span className="font-mono font-medium text-[#151515] tabular-nums">
                                  {ptsNeeded.toLocaleString('pt-BR')} {settings.pointsLabel}
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
                          ref={verifyButtonRef}
                          type="button"
                          onClick={handleStartVerification}
                          className="w-full h-12 px-5 bg-[#FE0A8C] hover:bg-[#DF067A] text-white text-sm font-bold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE0A8C] focus-visible:ring-offset-2"
                        >
                          <span>Verificar meus pontos</span>
                          <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </motion.div>
                    )}

                    {/* ETAPA 2: Análise automática */}
                    {step === 'analisando' && (
                      <motion.div
                        key="step-analisando"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                        className="py-6 text-center"
                      >
                        <div className="w-12 h-12 rounded-xl bg-[#151515] text-[#FE0A8C] flex items-center justify-center mx-auto mb-5">
                          <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                        </div>
                        <h2 className="font-display text-xl font-bold text-[#151515] mb-2">
                          Analisando pontos disponíveis
                        </h2>
                        <p className="text-sm text-neutral-600 mb-6">
                          {ANALYSIS_MESSAGES[analysisPhase]}
                        </p>
                        <div className="w-full max-w-xs mx-auto h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                          <motion.div
                            initial={{ width: '15%' }}
                            animate={{ width: '100%' }}
                            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                            className="h-full bg-[#FE0A8C]"
                          />
                        </div>
                      </motion.div>
                    )}

                    {/* ETAPA 3: Pontos disponíveis + valor em R$ + Resgatar pontos agora */}
                    {step === 'resultado' && consultaResult && (
                      <motion.div
                        key="step-resultado"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                      >
                        <div className="pb-4 border-b border-neutral-200">
                          <p className="text-xs font-semibold text-[#C8006B] mb-1">
                            Consulta concluída · {consultaResult.profileLabel}
                          </p>
                          <p className="text-sm text-neutral-600">
                            Você tem{' '}
                            <strong className="text-[#151515] font-display tabular-nums">
                              {consultaResult.pointsAvailable.toLocaleString('pt-BR')}{' '}
                              {settings.pointsLabel}
                            </strong>{' '}
                            disponíveis para resgate em saldo em conta:
                          </p>
                          <div className="flex items-baseline gap-3 mt-1.5">
                            <span className="font-display text-3xl sm:text-4xl font-bold text-[#151515] tabular-nums">
                              {formatBrl(convertedAccountBrl)}
                            </span>
                            <span className="text-xs font-mono text-neutral-500 tabular-nums">
                              Protocolo {consultaResult.protocol}
                            </span>
                          </div>
                        </div>

                        <div className="pt-4 mb-5">
                          <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-[#FE0A8C] bg-neutral-50">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#151515]">
                                {accountOption.title}
                              </p>
                              <p className="text-xs text-neutral-600 mt-0.5">
                                {accountOption.description}
                              </p>
                            </div>
                            <span className="font-display text-sm font-bold text-[#C8006B] tabular-nums shrink-0">
                              {formatBrl(convertedAccountBrl)}
                            </span>
                          </div>
                        </div>

                        {exchangeError && (
                          <div
                            role="alert"
                            className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2"
                          >
                            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>{exchangeError}</span>
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3">
                          <button
                            type="button"
                            onClick={handleConfirmRedeem}
                            disabled={exchanging}
                            className="flex-1 h-12 px-5 bg-[#FE0A8C] hover:bg-[#DF067A] disabled:bg-[#FE0A8C]/60 text-white text-sm font-bold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                          >
                            <span>
                              {exchanging ? 'Processando resgate...' : 'Resgatar pontos agora'}
                            </span>
                            {!exchanging && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            onClick={handleReset}
                            className="h-12 px-4 border border-neutral-300 bg-white hover:bg-neutral-100 text-[#151515] text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Voltar
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* ETAPA 4: Resgate Confirmado */}
                    {step === 'resgatado' && consultaResult && (
                      <motion.div
                        key="step-resgatado"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                      >
                        <div className="flex items-center gap-2.5 text-emerald-700 mb-3">
                          <CheckCircle2 className="w-6 h-6 shrink-0" aria-hidden="true" />
                          <h2 className="font-display text-xl font-bold text-[#151515]">
                            Resgate em saldo em conta confirmado
                          </h2>
                        </div>
                        <p className="text-sm text-neutral-600 leading-relaxed mb-5">
                          A troca de{' '}
                          <strong className="text-[#151515] tabular-nums">
                            {consultaResult.pointsAvailable.toLocaleString('pt-BR')}{' '}
                            {settings.pointsLabel}
                          </strong>{' '}
                          por{' '}
                          <strong className="text-[#C8006B] tabular-nums">
                            {formatBrl(convertedAccountBrl)}
                          </strong>{' '}
                          em saldo em conta foi registrada para{' '}
                          <strong className="text-[#151515]">{consultaResult.profileLabel}</strong>.
                        </p>

                        <dl className="bg-neutral-50 border border-neutral-200 rounded-lg divide-y divide-neutral-200 text-sm mb-6">
                          <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                            <dt className="text-neutral-500">Protocolo</dt>
                            <dd className="font-mono font-semibold text-[#151515] tabular-nums">
                              {consultaResult.protocol}
                            </dd>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                            <dt className="text-neutral-500">Pontos resgatados</dt>
                            <dd className="font-semibold text-[#151515] tabular-nums">
                              {consultaResult.pointsAvailable.toLocaleString('pt-BR')} pts
                            </dd>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                            <dt className="text-neutral-500">Saldo em conta</dt>
                            <dd className="font-display font-bold text-[#C8006B] tabular-nums">
                              {formatBrl(convertedAccountBrl)}
                            </dd>
                          </div>
                          <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                            <dt className="text-neutral-500">Modalidade</dt>
                            <dd className="font-medium text-[#151515] text-right">
                              {consultaResult.selectedOptionTitle || accountOption.title}
                            </dd>
                          </div>
                        </dl>

                        <button
                          type="button"
                          onClick={handleReset}
                          className="w-full h-11 px-5 border border-neutral-300 bg-white hover:bg-neutral-100 text-[#151515] text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          Fazer nova verificação
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#151515] text-neutral-300 border-t border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
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
