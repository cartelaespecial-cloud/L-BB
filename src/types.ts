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
  createdAt: string;
  exchangedAt: string | null;
  claimToken: string;
  alreadyRegistered?: boolean;
}

export interface ConsultaAdminRecord {
  id: string;
  protocol: string;
  profileLabel: string;
  cpfHash?: string;
  cpfMasked: string;
  phoneMasked: string;
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
  createdAt: string;
  exchangedAt: string | null;
}
