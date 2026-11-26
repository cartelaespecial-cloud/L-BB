export interface ExchangeOption {
  id: string;
  title: string;
  description: string;
  rateLabel: string;
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
  passcodeManagedByEnv?: boolean;
}

export type ConsultaStatus = 'consultado' | 'troca_solicitada';

export interface ConsultaPublicResult {
  id: string;
  protocol: string;
  profileLabel: string;
  referenceCode: string;
  pointsAvailable: number;
  status: ConsultaStatus;
  selectedOptionTitle: string | null;
  createdAt: string;
  exchangedAt: string | null;
  claimToken: string;
}

export interface ConsultaAdminRecord {
  id: string;
  protocol: string;
  profileLabel: string;
  referenceCode: string;
  pointsAvailable: number;
  status: ConsultaStatus;
  selectedOptionId: string | null;
  selectedOptionTitle: string | null;
  createdAt: string;
  exchangedAt: string | null;
}
