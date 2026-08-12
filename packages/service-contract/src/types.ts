export type FiscalStatus = 'DRAFT' | 'READY' | 'SENDING' | 'CONFIRMED' | 'ISSUED_WITHOUT_EOR' |
  'RETRY_PENDING' | 'REJECTED' | 'MANUAL_REVIEW' | 'REVERSED';

export interface FiscalInvoiceRequest {
  readonly legalEntityId: string;
  readonly taxNumber: string;
  readonly kind: 'STANDARD' | 'CORRECTION' | 'CANCELLATION';
  readonly correctionOfDocumentId?: string;
  readonly businessPremiseId: string;
  readonly electronicDeviceId: string;
  readonly issueLocalTime: string;
  readonly messageId: string;
  readonly numberingStructure: 'B' | 'C';
  readonly customerVatNumber?: string;
  readonly invoiceAmount: string;
  readonly returnsAmount?: string;
  readonly paymentAmount: string;
  readonly taxesPerSeller: readonly SellerTaxesRequest[];
  readonly operator: OperatorRequest;
  readonly subsequentSubmit?: boolean;
  readonly specialNotes?: string;
}

export interface VatSummaryRequest {
  readonly rate: string;
  readonly taxableAmount: string;
  readonly taxAmount: string;
}

export interface FlatRateCompensationRequest {
  readonly rate: string;
  readonly taxableAmount: string;
  readonly amount: string;
}

export interface SellerTaxesRequest {
  readonly sellerTaxNumber?: string;
  readonly vat?: readonly VatSummaryRequest[];
  readonly flatRateCompensation?: readonly FlatRateCompensationRequest[];
  readonly otherTaxesAmount?: string;
  readonly exemptVatTaxableAmount?: string;
  readonly reverseVatTaxableAmount?: string;
  readonly nontaxableAmount?: string;
  readonly specialTaxRulesAmount?: string;
}

export type OperatorRequest =
  | { readonly kind: 'slovenian'; readonly taxNumber: string }
  | { readonly kind: 'foreign' }
  | { readonly kind: 'self-service'; readonly taxNumber: string };

export interface FiscalDocumentResponse {
  readonly id: string;
  readonly operationClass: 'FISCAL_INVOICE' | 'BUSINESS_PREMISE';
  readonly kind: 'STANDARD' | 'CORRECTION' | 'CANCELLATION' | 'PREMISE';
  readonly correctionOfDocumentId?: string;
  readonly status: FiscalStatus;
  readonly businessPremiseId: string;
  readonly electronicDeviceId?: string;
  readonly invoiceSequence?: string;
  readonly issueLocalTime: string;
  readonly messageId: string;
  readonly payloadSha256: string;
  readonly schemaSha256: string;
  readonly zoi?: string;
  readonly eor?: string;
  readonly confirmedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly subsequentSubmit: boolean;
}

export interface BusinessPremiseRequest {
  readonly legalEntityId: string;
  readonly taxNumber: string;
  readonly businessPremiseId: string;
  readonly lifecycleStatus: 'REGISTERED' | 'CLOSED';
  readonly messageId: string;
  readonly sentAt: string;
  readonly location: MovablePremiseRequest | RealEstatePremiseRequest;
  readonly validityDate: string;
  readonly softwareSuppliers: readonly SoftwareSupplierRequest[];
  readonly specialNotes?: string;
}

export interface MovablePremiseRequest { readonly kind: 'movable'; readonly premiseType: 'A' | 'B' | 'C'; }
export interface RealEstatePremiseRequest {
  readonly kind: 'real-estate';
  readonly cadastralNumber: number;
  readonly buildingNumber: number;
  readonly buildingSectionNumber: number;
  readonly address: {
    readonly street: string; readonly houseNumber: string; readonly houseNumberAdditional?: string;
    readonly community: string; readonly city: string; readonly postalCode: string;
  };
}
export type SoftwareSupplierRequest =
  | { readonly kind: 'slovenian'; readonly taxNumber: string }
  | { readonly kind: 'foreign'; readonly nameAndAddress: string };

export interface ErrorResponse {
  readonly error: { readonly code: string; readonly message: string; readonly correlationId: string };
}

export interface OperatorSummaryResponse {
  readonly documentsByStatus: Readonly<Record<string, number>>;
  readonly activeOutboxJobs: number;
  readonly oldestActiveOutboxAt?: string;
  readonly oldestUnconfirmedAt?: string;
  readonly workerLastSeenAt?: string;
}

export interface OperatorDocumentsResponse {
  readonly documents: readonly FiscalDocumentResponse[];
}

export interface RetryAcceptedResponse { readonly status: 'accepted'; }
export interface ReconciliationResponse { readonly queued: number; }
export interface ElectronicDeviceResponse { readonly id: string; readonly operational: boolean; }
export interface EchoResponse { readonly value: string; }
export interface LiveHealthResponse { readonly status: 'ok'; }
export type ReadyHealthResponse =
  | { readonly status: 'ready' }
  | { readonly status: 'not-ready'; readonly failed: readonly string[] };

export interface ElectronicDeviceRequest {
  readonly legalEntityId: string;
  readonly businessPremiseId: string;
  readonly operational: boolean;
}

export interface SystemInfoResponse {
  readonly environment: 'test' | 'production';
  readonly legalEntityId: string;
}
