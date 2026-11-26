import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { ConsultaPublicResult } from '../types';

interface FacialVerificationStepProps {
  consulta: ConsultaPublicResult;
  platformName: string;
  platformLogoUrl: string | null;
  facialTitle: string;
  facialInstructions: string;
  facialButtonText: string;
  onVerified: (updated: ConsultaPublicResult) => void;
}

type CameraStatus = 'idle' | 'requesting_camera' | 'capturing' | 'processing' | 'verified' | 'failed';

interface BrowserFaceDetector {
  detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<Array<{ boundingBox?: DOMRectReadOnly }>>;
}

export function FacialVerificationStep({
  consulta,
  platformName,
  platformLogoUrl,
  facialTitle,
  facialInstructions,
  facialButtonText,
  onVerified,
}: FacialVerificationStepProps) {
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lightingOk, setLightingOk] = useState(false);
  const [framingOk, setFramingOk] = useState(false);
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [guidanceText, setGuidanceText] = useState(
    'Autorize a câmera e posicione seu rosto dentro da moldura oval.',
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);

  function stopCamera(): void {
    if (loopTimerRef.current !== null) {
      window.clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function submitVerificationResult(payload: {
    faceDetected: boolean;
    motionDetected: boolean;
    ovalCoverageOk: boolean;
    framesAnalyzed: number;
    failedReason?: string;
  }): Promise<void> {
    setStatus('processing');
    setGuidanceText('Validando prova de vida no servidor...');

    try {
      const response = await fetch(
        `/api/consultas/${encodeURIComponent(consulta.id)}/verificar-identidade`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimToken: consulta.claimToken,
            livenessChallenge: consulta.livenessChallenge || '',
            consentAccepted: true,
            ...payload,
          }),
        },
      );

      const data = (await response.json()) as {
        consulta?: ConsultaPublicResult;
        error?: string;
      };

      if (!response.ok || !data.consulta) {
        setStatus('failed');
        setErrorMsg(
          data.error ||
            'Não foi possível concluir a verificação facial. Tente novamente em um local iluminado.',
        );
        return;
      }

      setStatus('verified');
      window.setTimeout(() => {
        onVerified(data.consulta!);
      }, 950);
    } catch {
      setStatus('failed');
      setErrorMsg('Erro de conexão ao validar verificação facial. Tente novamente.');
    }
  }

  async function handleStartFacialVerification(): Promise<void> {
    setErrorMsg(null);
    if (!consentAccepted) {
      setErrorMsg(
        'Marque a caixa de consentimento acima para autorizar o uso temporário da câmera.',
      );
      return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setStatus('failed');
      setErrorMsg(
        'Seu navegador ou dispositivo não disponibilizou acesso à câmera neste ambiente.',
      );
      return;
    }

    stopCamera();
    setLightingOk(false);
    setFramingOk(false);
    setLivenessProgress(0);
    setStatus('requesting_camera');
    setGuidanceText('Aguardando autorização da câmera...');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch {
      setStatus('failed');
      setErrorMsg(
        'Permissão da câmera negada ou dispositivo sem câmera disponível. Libere o acesso e tente novamente.',
      );
      return;
    }

    streamRef.current = stream;
    setStatus('capturing');
    setGuidanceText('Posicione seu rosto no centro da moldura oval e faça um leve movimento.');

    // Aguardar vídeo pronto
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    const videoEl = videoRef.current;
    if (!videoEl) {
      stopCamera();
      setStatus('failed');
      setErrorMsg('Não foi possível inicializar a visualização da câmera.');
      return;
    }

    videoEl.srcObject = stream;
    try {
      await videoEl.play();
    } catch {
      // Alguns navegadores já iniciam via autoPlay
    }

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      stopCamera();
      setStatus('failed');
      setErrorMsg('Erro ao processar quadros de vídeo.');
      return;
    }

    const DetectorCtor = (
      window as unknown as { FaceDetector?: new (opts?: { fastMode?: boolean }) => BrowserFaceDetector }
    ).FaceDetector;
    const faceDetector = DetectorCtor ? new DetectorCtor({ fastMode: true }) : null;

    let previousOvalLuma: Float32Array | null = null;
    let framesAnalyzed = 0;
    let goodLightingFrames = 0;
    let centeredFaceFrames = 0;
    let motionSamples = 0;
    let elapsedTicks = 0;
    let finalized = false;

    loopTimerRef.current = window.setInterval(() => {
      void (async () => {
        if (finalized) return;
        elapsedTicks += 1;

        if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
          if (elapsedTicks > 25) {
            finalized = true;
            stopCamera();
            await submitVerificationResult({
              faceDetected: false,
              motionDetected: false,
              ovalCoverageOk: false,
              framesAnalyzed: 0,
              failedReason: 'Tempo esgotado aguardando sinal da câmera.',
            });
          }
          return;
        }

        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        // Analisar região oval central (x: 40..120, y: 18..102)
        const ovalWidth = 80;
        const ovalHeight = 84;
        const currentLuma = new Float32Array(ovalWidth * ovalHeight);

        let sumLuma = 0;
        let sumSqLuma = 0;
        let skinOrFacePixels = 0;
        let totalPixels = 0;
        let motionDeltaSum = 0;

        let idxOut = 0;
        for (let y = 18; y < 102; y++) {
          for (let x = 40; x < 120; x++) {
            const p = (y * canvas.width + x) * 4;
            const r = imgData[p];
            const g = imgData[p + 1];
            const b = imgData[p + 2];
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            currentLuma[idxOut] = luma;
            if (previousOvalLuma) {
              motionDeltaSum += Math.abs(luma - previousOvalLuma[idxOut]);
            }

            sumLuma += luma;
            sumSqLuma += luma * luma;
            totalPixels += 1;

            // Heurística complementar para presença de rosto/pele sob luz variada + contraste interno
            if (r > 45 && g > 30 && b > 20 && r >= g * 0.85 && Math.max(r, g, b) - Math.min(r, g, b) > 8) {
              skinOrFacePixels += 1;
            }
            idxOut += 1;
          }
        }

        const meanLuma = sumLuma / totalPixels;
        const variance = sumSqLuma / totalPixels - meanLuma * meanLuma;
        const stdDev = Math.sqrt(Math.max(0, variance));
        const meanMotion = previousOvalLuma ? motionDeltaSum / totalPixels : 0;
        previousOvalLuma = currentLuma;

        let nativeFaceFound = false;
        if (faceDetector) {
          try {
            const faces = await faceDetector.detect(canvas);
            nativeFaceFound = faces.some((f) => {
              const box = f.boundingBox;
              if (!box) return true;
              const cx = box.x + box.width / 2;
              const cy = box.y + box.height / 2;
              return cx > 30 && cx < 130 && cy > 15 && cy < 105 && box.width > 24;
            });
          } catch {
            nativeFaceFound = false;
          }
        }

        const frameLighting = meanLuma > 35 && meanLuma < 235 && stdDev > 12;
        const frameFace =
          nativeFaceFound || (frameLighting && skinOrFacePixels / totalPixels > 0.14 && stdDev > 15);
        const frameMotion = meanMotion > 1.35 && meanMotion < 65;

        framesAnalyzed += 1;
        if (frameLighting) goodLightingFrames += 1;
        if (frameFace) centeredFaceFrames += 1;
        if (frameMotion) motionSamples += 1;

        setLightingOk(frameLighting);
        setFramingOk(frameFace);

        const progress = Math.min(
          100,
          Math.round(
            (Math.min(centeredFaceFrames, 6) / 6) * 55 +
              (Math.min(motionSamples, 3) / 3) * 45,
          ),
        );
        setLivenessProgress(progress);

        if (!frameLighting) {
          setGuidanceText('Melhore a iluminação e evite cobrir a câmera.');
        } else if (!frameFace) {
          setGuidanceText('Centralize seu rosto dentro da moldura oval.');
        } else if (motionSamples < 2) {
          setGuidanceText('Ótimo! Pisque ou movimente levemente a cabeça para prova de vida.');
        } else {
          setGuidanceText('Enquadramento e movimento detectados. Concluindo...');
        }

        const readyToFinalize =
          framesAnalyzed >= 7 && centeredFaceFrames >= 5 && goodLightingFrames >= 5 && motionSamples >= 2;

        if (readyToFinalize || elapsedTicks >= 24) {
          finalized = true;
          stopCamera();
          // Limpa buffer de canvas imediatamente (sem retenção de imagem)
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const faceOk = centeredFaceFrames >= 5;
          const motionOk = motionSamples >= 2;
          const lightingPass = goodLightingFrames >= 5;

          await submitVerificationResult({
            faceDetected: faceOk,
            motionDetected: motionOk,
            ovalCoverageOk: faceOk && lightingPass,
            framesAnalyzed,
            failedReason: !lightingPass
              ? 'Iluminação insuficiente ou câmera obstruída.'
              : !faceOk
                ? 'Rosto não detectado na área oval indicada.'
                : !motionOk
                  ? 'Não foi detectado movimento natural (prova de vida).'
                  : undefined,
          });
        }
      })();
    }, 260);
  }

  return (
    <motion.div
      key="facial-verification-card"
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
            Etapa 1 de 2 · Segurança
          </span>
        </div>
        <span className="text-xs font-mono text-neutral-500">
          Protocolo {consulta.protocol}
        </span>
      </div>

      <h1 className="font-display text-xl sm:text-2xl font-bold text-[#151515] tracking-tight mb-1.5">
        {facialTitle}
      </h1>
      <p className="text-sm text-neutral-600 mb-6">{facialInstructions}</p>

      {/* Moldura Oval da Câmera */}
      <div className="mb-5 flex flex-col items-center">
        <div
          className={`relative w-56 h-72 sm:w-64 sm:h-80 rounded-[999px] overflow-hidden border-4 bg-[#151515] flex items-center justify-center transition-colors ${
            status === 'verified'
              ? 'border-emerald-500'
              : status === 'failed'
                ? 'border-red-500'
                : framingOk && lightingOk
                  ? 'border-emerald-400'
                  : 'border-[#FFED00]'
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover scale-x-[-1] ${
              status === 'capturing' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'
            }`}
          />

          {/* Guia oval interna */}
          {status === 'capturing' && (
            <div className="pointer-events-none absolute inset-3 rounded-[999px] border-2 border-dashed border-white/75" />
          )}

          {status === 'idle' && (
            <div className="text-center px-6 text-white">
              <Camera className="w-10 h-10 text-[#FFED00] mx-auto mb-3" aria-hidden="true" />
              <p className="text-xs sm:text-sm font-medium text-neutral-200">
                Área reservada para enquadramento facial
              </p>
            </div>
          )}

          {(status === 'requesting_camera' || status === 'processing') && (
            <div className="text-center px-6 text-white">
              <Loader2 className="w-10 h-10 text-[#FFED00] mx-auto mb-3 animate-spin" aria-hidden="true" />
              <p className="text-xs sm:text-sm font-medium text-neutral-100">
                {status === 'requesting_camera'
                  ? 'Solicitando câmera...'
                  : 'Processando verificação...'}
              </p>
            </div>
          )}

          {status === 'verified' && (
            <div className="text-center px-6 text-white bg-emerald-950/90 inset-0 absolute flex flex-col items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" aria-hidden="true" />
              <p className="font-display text-base font-bold tracking-wide text-emerald-300">
                IDENTIDADE VERIFICADA
              </p>
            </div>
          )}

          {status === 'failed' && (
            <div className="text-center px-6 text-white">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" aria-hidden="true" />
              <p className="text-xs sm:text-sm font-medium text-red-200">
                Verificação não concluída
              </p>
            </div>
          )}
        </div>

        {/* Indicadores Visuais de Enquadramento */}
        {status === 'capturing' && (
          <div className="mt-4 w-full max-w-sm space-y-2.5">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div
                className={`px-3 py-2 rounded-lg border flex items-center gap-2 ${
                  lightingOk
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${lightingOk ? 'bg-emerald-500' : 'bg-amber-400'}`}
                />
                <span>Iluminação</span>
              </div>
              <div
                className={`px-3 py-2 rounded-lg border flex items-center gap-2 ${
                  framingOk
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${framingOk ? 'bg-emerald-500' : 'bg-amber-400'}`}
                />
                <span>Enquadramento</span>
              </div>
            </div>

            <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
              <div
                className="h-full bg-[#151515] transition-all duration-200"
                style={{ width: `${livenessProgress}%` }}
              />
            </div>
            <p className="text-xs text-center font-medium text-neutral-700">{guidanceText}</p>
          </div>
        )}
      </div>

      {status === 'idle' && (
        <label className="flex items-start gap-2.5 mb-5 p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs sm:text-sm text-neutral-700 cursor-pointer">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => {
              setConsentAccepted(e.target.checked);
              if (errorMsg) setErrorMsg(null);
            }}
            className="mt-0.5 accent-[#151515] w-4 h-4 shrink-0"
          />
          <span>
            Autorizo o uso temporário da câmera apenas para confirmar minha presença e identidade neste atendimento, sem armazenamento de imagem biométrica.
          </span>
        </label>
      )}

      <div className="mb-5 p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-[#151515] shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Nenhuma foto ou vídeo do seu rosto é salva ou enviada ao painel administrativo. Apenas o resultado da prova de vida é registrado.
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

      {(status === 'idle' || status === 'failed') && (
        <button
          type="button"
          onClick={() => void handleStartFacialVerification()}
          className="w-full h-14 px-6 bg-[#151515] hover:bg-neutral-800 text-white text-base font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2.5 cursor-pointer"
        >
          {status === 'failed' ? (
            <>
              <RefreshCw className="w-5 h-5" aria-hidden="true" />
              <span>Tentar novamente</span>
            </>
          ) : (
            <>
              <Camera className="w-5 h-5" aria-hidden="true" />
              <span>{facialButtonText || 'INICIAR VERIFICAÇÃO FACIAL'}</span>
            </>
          )}
        </button>
      )}
    </motion.div>
  );
}
