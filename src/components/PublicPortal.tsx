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
import { formatCpf, isValidCpf, isValidFullName, stripNonDigits } from '../utils/cpf';
import { BrandMark } from './BrandMark';

interface PublicPortalProps {
  settings: SiteSettings;
  onNavigate: (path: string) => void;
}

const SHOWCASE_IMAGE_URL = '/src/assets/images/loyalty_rewards_showcase_1795672630305.jpg';

const FAQ_ITEMS = [
  {
    q: 'Por que preciso informar um CPF válido para verificar meus pontos?',
    a: 'Os pontos são vinculados exclusivamente ao CPF do titular. Nosso sistema valida os dígitos verificadores do documento no momento da consulta para garantir segurança e evitar erros de digitação.',
  },
  {
    q: 'Como funciona a troca dos pontos disponíveis?',
    a: 'Após validar seu nome completo e CPF, exibimos seu saldo disponível e as modalidades de resgate ativas. Ao confirmar a opção desejada, um protocolo de atendimento é gerado na hora.',
  },
  {
    q: 'A consulta possui alguma taxa ou custo?',
    a: 'Não. A verificação do saldo de pontos e a solicitação de troca são totalmente gratuitas para os participantes cadastrados.',
  },
  {
    q: 'Posso consultar mais de uma vez caso tenha dúvidas?',
    a: 'Sim. Basta clicar em Fazer nova consulta após finalizar ou digitar um novo CPF válido no formulário principal.',
  },
];

export function PublicPortal({ settings, onNavigate }: PublicPortalProps) {
  const [fullName, setFullName] = useState('');
  const [cpfInput, setCpfInput] = useState('');
  const [touchedName, setTouchedName] = useState(false);
  const [touchedCpf, setTouchedCpf] = useState(false);
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

  const fullNameInputRef = useRef<HTMLInputElement>(null);

  const cpfDigits = stripNonDigits(cpfInput);
  const cpfHasAllDigits = cpfDigits.length === 11;
  const cpfValid = isValidCpf(cpfInput);
  const nameValid = isValidFullName(fullName);

  const showCpfError = (touchedCpf && cpfDigits.length > 0 && !cpfValid) || (cpfHasAllDigits && !cpfValid);
  const showCpfSuccess = cpfHasAllDigits && cpfValid;
  const showNameError = touchedName && fullName.trim().length > 0 && !nameValid;

  function focusForm(): void {
    const el = document.getElementById('formulario-pontos');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      fullNameInputRef.current?.focus();
    }, 250);
  }

  function handleCpfChange(raw: string): void {
    setCpfInput(formatCpf(raw));
    if (formError) setFormError(null);
  }

  async function handleConsultarSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setTouchedName(true);
    setTouchedCpf(true);
    setFormError(null);

    if (!isValidFullName(fullName)) {
      setFormError('Digite seu nome completo (nome e sobrenome).');
      return;
    }

    if (!isValidCpf(cpfInput)) {
      setFormError('Apenas CPFs válidos são aceitos. Confira os 11 dígitos informados.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/consultas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          cpf: cpfInput,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error || 'Não foi possível verificar seus pontos no momento.');
        return;
      }
      setConsultaResult(data as ConsultaPublicResult);
      setSelectedOptionId(settings.exchangeOptions[0]?.id ?? 'credito-fatura');
      setExchangeError(null);
    } catch {
      setFormError('Erro de conexão ao consultar seus pontos. Tente novamente.');
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
        setExchangeError(data.error || 'Não foi possível concluir a solicitação.');
        return;
      }
      setConsultaResult(data as ConsultaPublicResult);
    } catch {
      setExchangeError('Erro de conexão ao confirmar a troca. Tente novamente.');
    } finally {
      setExchanging(false);
    }
  }

  function handleReset(): void {
    setConsultaResult(null);
    setFullName('');
    setCpfInput('');
    setTouchedName(false);
    setTouchedCpf(false);
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
                      01. Informe seus dados
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Nome completo e CPF com validação automática.
                    </p>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-sm text-slate-900 mb-1">
                      02. Confira seu saldo
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Visualize quantos pontos estão liberados para uso.
                    </p>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-sm text-slate-900 mb-1">
                      03. Solicite a troca
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Escolha o benefício desejado e receba o protocolo.
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
                        <p className="text-sm text-slate-600 leading-relaxed">
                          Coloque seu nome completo e um CPF válido para consultar seus pontos disponíveis.
                        </p>
                      </div>

                      <div className="space-y-4">
                        {/* Nome completo */}
                        <div>
                          <label
                            htmlFor="fullName"
                            className="block text-sm font-medium text-slate-800 mb-1.5"
                          >
                            Nome completo
                          </label>
                          <input
                            ref={fullNameInputRef}
                            id="fullName"
                            name="fullName"
                            type="text"
                            autoComplete="name"
                            required
                            value={fullName}
                            onChange={(e) => {
                              setFullName(e.target.value);
                              if (formError) setFormError(null);
                            }}
                            onBlur={() => setTouchedName(true)}
                            placeholder="Digite seu nome e sobrenome"
                            className={`w-full h-11 px-3.5 rounded-lg bg-white border text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-800/20 ${
                              showNameError
                                ? 'border-red-600 focus:border-red-600'
                                : 'border-slate-300 focus:border-blue-800'
                            }`}
                          />
                          {showNameError && (
                            <p className="mt-1.5 text-xs text-red-700 flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>Informe nome e sobrenome completos.</span>
                            </p>
                          )}
                        </div>

                        {/* CPF */}
                        <div>
                          <label
                            htmlFor="cpf"
                            className="block text-sm font-medium text-slate-800 mb-1.5"
                          >
                            CPF (apenas CPF válido)
                          </label>
                          <input
                            id="cpf"
                            name="cpf"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={14}
                            required
                            value={cpfInput}
                            onChange={(e) => handleCpfChange(e.target.value)}
                            onBlur={() => setTouchedCpf(true)}
                            placeholder="000.000.000-00"
                            className={`w-full h-11 px-3.5 rounded-lg bg-white border text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-800/20 ${
                              showCpfError
                                ? 'border-red-600 focus:border-red-600'
                                : showCpfSuccess
                                  ? 'border-emerald-600 focus:border-emerald-700'
                                  : 'border-slate-300 focus:border-blue-800'
                            }`}
                          />
                          {showCpfError && (
                            <p className="mt-1.5 text-xs text-red-700 flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>CPF inválido. Verifique os dígitos e tente novamente.</span>
                            </p>
                          )}
                          {showCpfSuccess && (
                            <p className="mt-1.5 text-xs text-emerald-700 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>CPF válido verificado.</span>
                            </p>
                          )}
                        </div>

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
                          disabled={submitting}
                          className="w-full h-11 px-5 bg-blue-800 hover:bg-blue-900 disabled:bg-blue-800/60 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                        >
                          <span>
                            {submitting ? 'Verificando pontos...' : 'Verificar pontos disponíveis'}
                          </span>
                          {!submitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                        </button>
                      </div>

                      <p className="mt-4 text-xs text-slate-500 leading-relaxed">
                        Seus dados são utilizados exclusivamente para validação do CPF e apuração de saldo no programa {settings.brandName}.
                      </p>
                    </form>
                  )}

                  {/* Etapa 2: Saldo encontrado + escolha da troca */}
                  {consultaResult && consultaResult.status === 'consultado' && (
                    <div>
                      <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-200">
                        <div>
                          <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5 mb-1">
                            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>Cadastro localizado com sucesso</span>
                          </p>
                          <h2 className="font-display text-lg font-bold text-slate-950">
                            {consultaResult.fullName}
                          </h2>
                          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            CPF {consultaResult.maskedCpf} · Protocolo {consultaResult.protocol}
                          </p>
                        </div>
                      </div>

                      <div className="py-5 border-b border-slate-200">
                        <p className="text-xs font-medium text-slate-500 mb-1">
                          Saldo identificado para troca
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
                          Escolha como deseja trocar seus pontos:
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
                            {exchanging ? 'Registrando troca...' : 'Confirmar troca de pontos'}
                          </button>
                          <button
                            type="button"
                            onClick={handleReset}
                            className="h-11 px-4 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Consultar outro CPF
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Etapa 3: Solicitação confirmada */}
                  {consultaResult && consultaResult.status === 'troca_solicitada' && (
                    <div>
                      <div className="flex items-center gap-2.5 text-emerald-700 mb-3">
                        <CheckCircle2 className="w-6 h-6 shrink-0" aria-hidden="true" />
                        <h2 className="font-display text-xl font-bold text-slate-950">
                          Solicitação de troca registrada
                        </h2>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed mb-5">
                        Recebemos o pedido de conversão de pontos para{' '}
                        <strong className="text-slate-900">{consultaResult.fullName}</strong>.
                        Guarde seu número de protocolo para acompanhamento.
                      </p>

                      <dl className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200 text-sm mb-6">
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-slate-500">Protocolo</dt>
                          <dd className="font-mono font-semibold text-slate-950 tabular-nums">
                            {consultaResult.protocol}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-slate-500">CPF verificado</dt>
                          <dd className="font-mono text-slate-900 tabular-nums">
                            {consultaResult.maskedCpf}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-slate-500">Pontos utilizados</dt>
                          <dd className="font-semibold text-slate-950 tabular-nums">
                            {consultaResult.pointsAvailable.toLocaleString('pt-BR')} pts
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-slate-500">Modalidade selecionada</dt>
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
                      Consulta segura de pontos acumulados e resgate simplificado.
                    </p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 flex flex-col justify-center">
                <p className="text-xs font-semibold text-blue-800 mb-2">
                  Transparência em cada etapa
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight mb-4">
                  Do saldo acumulado ao benefício escolhido em poucos minutos
                </h2>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6">
                  Nosso sistema analisa automaticamente os dígitos verificadores do CPF antes de registrar qualquer pedido, evitando divergências cadastrais e acelerando a liberação dos seus pontos.
                </p>

                <dl className="grid grid-cols-2 gap-6 border-t border-slate-200 pt-6">
                  <div>
                    <dt className="text-xs text-slate-500 mb-1">Validação cadastral</dt>
                    <dd className="font-display text-xl font-bold text-slate-950 tabular-nums">
                      100% CPF válido
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 mb-1">Emissão de protocolo</dt>
                    <dd className="font-display text-xl font-bold text-slate-950 tabular-nums">
                      Imediata
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
                Opções disponíveis para troca
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Veja as formas de conversão aceitas pelo programa {settings.brandName} após a confirmação do seu saldo.
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
                      <span className="text-slate-500">Conversão</span>
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
            <span>© {new Date().getFullYear()} Todos os direitos reservados</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#formulario-pontos" className="hover:text-slate-900 transition-colors">
              Consultar CPF
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
