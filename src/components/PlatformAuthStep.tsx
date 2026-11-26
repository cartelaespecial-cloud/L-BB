import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import type { ConsultaPublicResult } from '../types';

interface PlatformAuthStepProps {
  consulta: ConsultaPublicResult;
  platformName: string;
  platformLogoUrl: string | null;
  authButtonText: string;
  onCompleted: (updated: ConsultaPublicResult) => void;
}

type AuthPhase = 'code8' | 'code8_ok' | 'code4' | 'code4_ok';

export function PlatformAuthStep({
  consulta,
  platformName,
  platformLogoUrl,
  authButtonText,
  onCompleted,
}: PlatformAuthStepProps) {
  const [phase, setPhase] = useState<AuthPhase>('code8');
  const [currentConsulta, setCurrentConsulta] = useState<ConsultaPublicResult>(consulta);
  const [digits8, setDigits8] = useState<string[]>(Array(8).fill(''));
  const [digits4, setDigits4] = useState<string[]>(Array(4).fill(''));
  const [validating, setValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputsRef8 = useRef<Array<HTMLInputElement | null>>([]);
  const inputsRef4 = useRef<Array<HTMLInputElement | null>>([]);

  const isStepA = phase === 'code8' || phase === 'code8_ok';
  const expectedLength = isStepA ? 8 : 4;
  const activeDigits = isStepA ? digits8 : digits4;
  const setActiveDigits = isStepA ? setDigits8 : setDigits4;
  const activeRefs = isStepA ? inputsRef8 : inputsRef4;

  function handleDigitChange(index: number, rawValue: string): void {
    const clean = rawValue.replace(/\D/g, '');
    if (errorMsg) setErrorMsg(null);

    if (clean.length > 1) {
      const next = [...activeDigits];
      for (let i = 0; i < clean.length && index + i < expectedLength; i++) {
        next[index + i] = clean[i];
      }
      setActiveDigits(next);
      const focusIdx = Math.min(expectedLength - 1, index + clean.length);
      activeRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...activeDigits];
    next[index] = clean;
    setActiveDigits(next);
    if (clean && index < expectedLength - 1) {
      activeRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace' && !activeDigits[index] && index > 0) {
      activeRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>): void {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, expectedLength);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(expectedLength).fill('');
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setActiveDigits(next);
    const focusIdx = Math.min(expectedLength - 1, pasted.length);
    activeRefs.current[focusIdx]?.focus();
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);

    const step = isStepA ? 'code8' : 'code4';
    const code = activeDigits.join('');
    if (code.length !== expectedLength) {
      setErrorMsg(`Preencha todas as ${expectedLength} posições com os dígitos do código.`);
      return;
    }

    setValidating(true);
    try {
      const response = await fetch(
        `/api/consultas/${encodeURIComponent(currentConsulta.id)}/autenticar-plataforma`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimToken: currentConsulta.claimToken,
            step,
            code,
          }),
        },
      );

      const data = (await response.json()) as {
        consulta?: ConsultaPublicResult;
        error?: string;
      };

      if (!response.ok || !data.consulta) {
        setErrorMsg(data.error || 'Código de confirmação inválido. Verifique e tente novamente.');
        return;
      }

      setCurrentConsulta(data.consulta);
      if (isStepA) {
        setPhase('code8_ok');
        window.setTimeout(() => {
          setDigits4(Array(4).fill(''));
          setPhase('code4');
          window.setTimeout(() => inputsRef4.current[0]?.focus(), 80);
        }, 900);
      } else {
        setPhase('code4_ok');
        window.setTimeout(() => {
          onCompleted(data.consulta!);
        }, 900);
      }
    } catch {
      setErrorMsg('Erro de conexão ao validar confirmação. Tente novamente.');
    } finally {
      setValidating(false);
    }
  }

  return (
    <motion.div
      key={`platform-auth-${phase}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-white text-[#151515] border border-black/10 rounded-xl p-6 sm:p-8"
    >
      <div className="flex items-center justify-between gap-3 pb-4 mb-5 border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          {platformLogoUrl ? (
            <img
              src={platformLogoUrl}
              alt={platformName}
              referrerPolicy="no-referrer"
              className="h-8 max-w-[120px] object-contain"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-[#151515] text-[#FFED00] font-display font-bold text-xs flex items-center justify-center">
              {platformName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {isStepA ? 'Etapa A · 8 dígitos' : 'Etapa B · 4 dígitos'}
          </span>
        </div>
        <span className="text-xs font-mono text-neutral-500">
          Protocolo {currentConsulta.protocol}
        </span>
      </div>

      {validating ? (
        <div className="py-10 text-center space-y-4">
          <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              className="w-14 h-14 rounded-xl bg-[#151515] flex items-center justify-center p-2"
            >
              {platformLogoUrl ? (
                <img
                  src={platformLogoUrl}
                  alt={platformName}
                  referrerPolicy="no-referrer"
                  className="max-h-10 max-w-full object-contain"
                />
              ) : (
                <span className="font-display font-bold text-sm text-[#FFED00]">
                  {platformName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </motion.div>
            <Loader2
              className="w-20 h-20 text-[#151515]/30 animate-spin absolute inset-0"
              aria-hidden="true"
            />
          </div>
          <p className="font-display text-lg font-bold text-[#151515]">
            Validando confirmação segura...
          </p>
          <p className="text-xs text-neutral-500">
            Verificando autenticidade criptográfica da sessão sem armazenar credenciais.
          </p>
        </div>
      ) : phase === 'code8_ok' || phase === 'code4_ok' ? (
        <div className="py-10 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" aria-hidden="true" />
          <h2 className="font-display text-xl font-bold text-[#151515]">
            CONFIRMAÇÃO CONCLUÍDA
          </h2>
          <p className="text-sm text-neutral-600">
            {phase === 'code8_ok'
              ? 'Etapa A validada com sucesso. Avançando para a confirmação de 4 dígitos...'
              : 'Autenticação da plataforma concluída. Registrando protocolo final...'}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="flex items-center gap-2 text-[#151515] mb-2">
            <KeyRound className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight">
              {isStepA
                ? 'Confirmação Segura — 8 Dígitos'
                : 'Confirmação Final — 4 Dígitos'}
            </h1>
          </div>

          <p className="text-sm text-neutral-600 mb-5 leading-relaxed">
            {isStepA
              ? 'Para concluir a autenticação segura sem solicitar sua senha pessoal ou bancária, informe nas 8 posições abaixo o código de confirmação gerado para esta sessão.'
              : 'Agora informe nas 4 posições abaixo o código final de autorização emitido para este protocolo.'}
          </p>

          {currentConsulta.stepChallengeCode && (
            <div className="mb-6 p-4 rounded-xl bg-[#151515] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-neutral-300">
                  {isStepA ? 'Código de sessão (8 dígitos)' : 'PIN de autorização (4 dígitos)'}
                </p>
                <p className="text-xs text-neutral-400">
                  Emitido com validade temporária exclusiva para este protocolo.
                </p>
              </div>
              <span className="font-mono text-2xl font-bold tracking-[0.2em] text-[#FFED00] tabular-nums">
                {currentConsulta.stepChallengeCode}
              </span>
            </div>
          )}

          {/* Posições visuais dos dígitos */}
          <div
            className={`grid gap-2 mb-5 ${
              isStepA ? 'grid-cols-4 sm:grid-cols-8' : 'grid-cols-4 max-w-xs mx-auto'
            }`}
          >
            {activeDigits.map((digit, idx) => (
              <input
                key={`${phase}-${idx}`}
                ref={(el) => {
                  activeRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                aria-label={`Dígito ${idx + 1} de ${expectedLength}`}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                className="h-12 sm:h-14 text-center font-mono text-lg sm:text-xl font-bold rounded-lg border border-neutral-300 bg-neutral-50 text-[#151515] focus:bg-white focus:outline-none focus:border-[#151515] focus:ring-2 focus:ring-[#151515]/15"
              />
            ))}
          </div>

          <div className="mb-5 p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#151515] shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Este procedimento confirma a solicitação sem coletar ou armazenar senhas pessoais ou bancárias.
            </span>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={validating}
            className="w-full h-14 px-6 bg-[#151515] hover:bg-neutral-800 disabled:bg-neutral-600 text-white text-base font-bold rounded-xl transition-colors cursor-pointer"
          >
            {authButtonText || 'VALIDAR CONFIRMAÇÃO'}
          </button>
        </form>
      )}
    </motion.div>
  );
}
