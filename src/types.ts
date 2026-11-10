/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BordereauItem {
  itemReference: string;
  designation: string;
  unit: string;
  quantity: number;
  referenceUnitPrice?: number;
}

export interface BidderItem extends BordereauItem {
  unitPrice: number;
  total: number;
  calculatedTotal: number;
  isCorrected: boolean;
  
  // Verification fields
  originalQuantity?: number;
  isQuantityCorrect: boolean;
  originalTotal?: number;
  hasArithmeticError: boolean;
  discrepancyMessage?: string;
  itemStatus?: 'Normal' | 'Abnormal' | 'Excessive';
}

export interface Bidder {
  id: string;
  companyName: string;
  items: BidderItem[];
  totalAmount: number;
  correctedTotalAmount: number;
  tvaAmount: number;
  ttcAmount: number;
  isExcessive: boolean;
  isAbnormallyLow: boolean;
  isExcluded: boolean;
  isManuallyExcluded?: boolean;
  justification?: string;
}

export type TenderType = 'Travaux' | 'Fourritures' | 'Services';

export interface TenderMetadata {
  tenderNumber: string;
  type: TenderType;
  estimation: number;
  numBidders: number;
  tvaRate: number;
  isSpecialService?: boolean; // مناولة /نظافة /حراسة
}

export interface Project {
  id: string;
  createdAt: number;
  updatedAt: number;
  metadata: TenderMetadata;
  templateItems: BordereauItem[];
  bidders: Bidder[];
}

export interface DirectorateSettings {
  nameAr: string;
  nameFr: string;
}

export const DEFAULT_DIRECTORATE: DirectorateSettings = {
  nameAr: "المديرية الإقليمية للعدل بمكناس",
  nameFr: "DP JUSTICE MEKNES",
};
