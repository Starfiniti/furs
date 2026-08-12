import { DecimalAmount } from './decimal-amount.js';
import { FursDomainError } from './domain-error.js';
import { FursJsonNumber, serializeFursJson, ValidatedFursPayload } from './furs-json.js';
import { LocalInvoiceDateTime } from './local-invoice-date-time.js';
import type { PinnedOfficialSchemaValidator } from './schema-validator.js';
import {
  FiscalInvoiceIdentity,
  FursDate,
  MessageId,
  OperatorIdentity,
  SlovenianTaxNumber,
  VatRate,
  Zoi
} from './value-types.js';

function freezeBoundedArray<T>(name: string, value: readonly T[], minimum: number, maximum: number): readonly T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new FursDomainError('FURS_ARRAY_BOUNDS', `${name} must contain ${minimum}-${maximum} items`);
  }
  return Object.freeze([...value]);
}

function assertBoundedText(name: string, value: string, minimum: number, maximum: number): string {
  const length = typeof value === 'string' ? [...value].length : -1;
  if (length < minimum || length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new FursDomainError('FURS_TEXT_BOUNDS', `${name} must contain ${minimum}-${maximum} printable characters`);
  }
  return value;
}

export class VatSummary {
  public readonly rate: VatRate;
  public readonly taxableAmount: DecimalAmount;
  public readonly taxAmount: DecimalAmount;

  public constructor(rate: VatRate, taxableAmount: DecimalAmount, taxAmount: DecimalAmount) {
    this.rate = rate;
    this.taxableAmount = taxableAmount;
    this.taxAmount = taxAmount;
    Object.freeze(this);
  }
}

export class FlatRateCompensation {
  public readonly rate: VatRate;
  public readonly taxableAmount: DecimalAmount;
  public readonly amount: DecimalAmount;

  public constructor(rate: VatRate, taxableAmount: DecimalAmount, amount: DecimalAmount) {
    this.rate = rate;
    this.taxableAmount = taxableAmount;
    this.amount = amount;
    Object.freeze(this);
  }
}

export interface SellerTaxesInput {
  readonly sellerTaxNumber?: SlovenianTaxNumber;
  readonly vat?: readonly VatSummary[];
  readonly flatRateCompensation?: readonly FlatRateCompensation[];
  readonly otherTaxesAmount?: DecimalAmount;
  readonly exemptVatTaxableAmount?: DecimalAmount;
  readonly reverseVatTaxableAmount?: DecimalAmount;
  readonly nontaxableAmount?: DecimalAmount;
  readonly specialTaxRulesAmount?: DecimalAmount;
}

export class SellerTaxes {
  public readonly sellerTaxNumber: SlovenianTaxNumber | undefined;
  public readonly vat: readonly VatSummary[] | undefined;
  public readonly flatRateCompensation: readonly FlatRateCompensation[] | undefined;
  public readonly otherTaxesAmount: DecimalAmount | undefined;
  public readonly exemptVatTaxableAmount: DecimalAmount | undefined;
  public readonly reverseVatTaxableAmount: DecimalAmount | undefined;
  public readonly nontaxableAmount: DecimalAmount | undefined;
  public readonly specialTaxRulesAmount: DecimalAmount | undefined;

  private constructor(input: SellerTaxesInput) {
    this.sellerTaxNumber = input.sellerTaxNumber;
    this.vat = input.vat === undefined ? undefined : freezeBoundedArray('VAT summaries', input.vat, 1, 1000);
    this.flatRateCompensation =
      input.flatRateCompensation === undefined
        ? undefined
        : freezeBoundedArray('Flat-rate compensation summaries', input.flatRateCompensation, 1, 1000);
    this.otherTaxesAmount = input.otherTaxesAmount;
    this.exemptVatTaxableAmount = input.exemptVatTaxableAmount;
    this.reverseVatTaxableAmount = input.reverseVatTaxableAmount;
    this.nontaxableAmount = input.nontaxableAmount;
    this.specialTaxRulesAmount = input.specialTaxRulesAmount;
    Object.freeze(this);
  }

  public static create(input: SellerTaxesInput): SellerTaxes {
    const hasFinancialCategory =
      input.vat !== undefined ||
      input.flatRateCompensation !== undefined ||
      input.otherTaxesAmount !== undefined ||
      input.exemptVatTaxableAmount !== undefined ||
      input.reverseVatTaxableAmount !== undefined ||
      input.nontaxableAmount !== undefined ||
      input.specialTaxRulesAmount !== undefined;
    if (!hasFinancialCategory) {
      throw new FursDomainError('FURS_SELLER_TAX_EMPTY', 'Seller taxes must contain at least one financial category');
    }
    return new SellerTaxes(input);
  }
}

export class InvoiceReference {
  public readonly identity: FiscalInvoiceIdentity;
  public readonly issueDateTime: LocalInvoiceDateTime;

  public constructor(identity: FiscalInvoiceIdentity, issueDateTime: LocalInvoiceDateTime) {
    this.identity = identity;
    this.issueDateTime = issueDateTime;
    Object.freeze(this);
  }
}

export class SalesBookIdentifier {
  public readonly invoiceNumber: string;
  public readonly setNumber: string;
  public readonly serialNumber: string;

  public constructor(invoiceNumber: string, setNumber: string, serialNumber: string) {
    this.invoiceNumber = assertBoundedText('Sales-book invoice number', invoiceNumber, 1, 20);
    this.setNumber = assertBoundedText('Sales-book set number', setNumber, 2, 2);
    this.serialNumber = assertBoundedText('Sales-book serial number', serialNumber, 12, 12);
    Object.freeze(this);
  }
}

export class SalesBookReference {
  public readonly identifier: SalesBookIdentifier;
  public readonly issueDate: FursDate;

  public constructor(identifier: SalesBookIdentifier, issueDate: FursDate) {
    this.identifier = identifier;
    this.issueDate = issueDate;
    Object.freeze(this);
  }
}

export type NumberingStructure = 'B' | 'C';

export interface FiscalInvoiceInput {
  readonly taxNumber: SlovenianTaxNumber;
  readonly issueDateTime: LocalInvoiceDateTime;
  readonly numberingStructure: NumberingStructure;
  readonly identity: FiscalInvoiceIdentity;
  readonly customerVatNumber?: string;
  readonly invoiceAmount: DecimalAmount;
  readonly returnsAmount?: DecimalAmount;
  readonly paymentAmount: DecimalAmount;
  readonly taxesPerSeller: readonly SellerTaxes[];
  readonly operator: OperatorIdentity;
  readonly protectedId: Zoi;
  readonly subsequentSubmit?: boolean;
  readonly referenceInvoices?: readonly InvoiceReference[];
  readonly referenceSalesBooks?: readonly SalesBookReference[];
  readonly specialNotes?: string;
}

export class FiscalInvoice {
  public readonly taxNumber: SlovenianTaxNumber;
  public readonly issueDateTime: LocalInvoiceDateTime;
  public readonly numberingStructure: NumberingStructure;
  public readonly identity: FiscalInvoiceIdentity;
  public readonly customerVatNumber: string | undefined;
  public readonly invoiceAmount: DecimalAmount;
  public readonly returnsAmount: DecimalAmount | undefined;
  public readonly paymentAmount: DecimalAmount;
  public readonly taxesPerSeller: readonly SellerTaxes[];
  public readonly operator: OperatorIdentity;
  public readonly protectedId: Zoi;
  public readonly subsequentSubmit: boolean | undefined;
  public readonly referenceInvoices: readonly InvoiceReference[] | undefined;
  public readonly referenceSalesBooks: readonly SalesBookReference[] | undefined;
  public readonly specialNotes: string | undefined;

  private constructor(input: FiscalInvoiceInput) {
    this.taxNumber = input.taxNumber;
    this.issueDateTime = input.issueDateTime;
    this.numberingStructure = input.numberingStructure;
    this.identity = input.identity;
    this.customerVatNumber =
      input.customerVatNumber === undefined
        ? undefined
        : assertBoundedText('Customer VAT number', input.customerVatNumber, 1, 20);
    this.invoiceAmount = input.invoiceAmount;
    this.returnsAmount = input.returnsAmount;
    this.paymentAmount = input.paymentAmount;
    this.taxesPerSeller = freezeBoundedArray('Taxes per seller', input.taxesPerSeller, 1, 1000);
    this.operator = input.operator;
    this.protectedId = input.protectedId;
    this.subsequentSubmit = input.subsequentSubmit;
    this.referenceInvoices =
      input.referenceInvoices === undefined
        ? undefined
        : freezeBoundedArray('Reference invoices', input.referenceInvoices, 1, 1000);
    this.referenceSalesBooks =
      input.referenceSalesBooks === undefined
        ? undefined
        : freezeBoundedArray('Reference sales-book invoices', input.referenceSalesBooks, 1, 1000);
    this.specialNotes =
      input.specialNotes === undefined ? undefined : assertBoundedText('Special notes', input.specialNotes, 0, 1000);
    Object.freeze(this);
  }

  public static create(input: FiscalInvoiceInput): FiscalInvoice {
    if (input.numberingStructure !== 'B' && input.numberingStructure !== 'C') {
      throw new FursDomainError('FURS_NUMBERING_STRUCTURE', 'Numbering structure must be B or C');
    }
    if (
      input.operator.kind === 'self-service' &&
      input.operator.taxNumber?.toString() !== input.taxNumber.toString()
    ) {
      throw new FursDomainError(
        'FURS_SELF_SERVICE_OPERATOR',
        'Self-service operator identity must use the liable person tax number'
      );
    }
    return new FiscalInvoice(input);
  }
}

export interface InvoiceRequestInput {
  readonly messageId: MessageId;
  readonly sentAt: LocalInvoiceDateTime;
  readonly invoice: FiscalInvoice;
}

function exactAmount(value: DecimalAmount): FursJsonNumber {
  return FursJsonNumber.exact(value.toJsonNumberToken());
}

function mapIdentity(identity: FiscalInvoiceIdentity) {
  return {
    BusinessPremiseID: identity.businessPremiseId.toString(),
    ElectronicDeviceID: identity.electronicDeviceId.toString(),
    InvoiceNumber: identity.invoiceSequence.toString()
  };
}

function mapSellerTaxes(taxes: SellerTaxes) {
  return {
    ...(taxes.sellerTaxNumber === undefined ? {} : { SellerTaxNumber: taxes.sellerTaxNumber.toInteger() }),
    ...(taxes.vat === undefined
      ? {}
      : {
          VAT: taxes.vat.map((line) => ({
            TaxRate: FursJsonNumber.exact(line.rate.toJsonNumberToken()),
            TaxableAmount: exactAmount(line.taxableAmount),
            TaxAmount: exactAmount(line.taxAmount)
          }))
        }),
    ...(taxes.flatRateCompensation === undefined
      ? {}
      : {
          FlatRateCompensation: taxes.flatRateCompensation.map((line) => ({
            FlatRateRate: FursJsonNumber.exact(line.rate.toJsonNumberToken()),
            FlatRateTaxableAmount: exactAmount(line.taxableAmount),
            FlatRateAmount: exactAmount(line.amount)
          }))
        }),
    ...(taxes.otherTaxesAmount === undefined ? {} : { OtherTaxesAmount: exactAmount(taxes.otherTaxesAmount) }),
    ...(taxes.exemptVatTaxableAmount === undefined
      ? {}
      : { ExemptVATTaxableAmount: exactAmount(taxes.exemptVatTaxableAmount) }),
    ...(taxes.reverseVatTaxableAmount === undefined
      ? {}
      : { ReverseVATTaxableAmount: exactAmount(taxes.reverseVatTaxableAmount) }),
    ...(taxes.nontaxableAmount === undefined ? {} : { NontaxableAmount: exactAmount(taxes.nontaxableAmount) }),
    ...(taxes.specialTaxRulesAmount === undefined
      ? {}
      : { SpecialTaxRulesAmount: exactAmount(taxes.specialTaxRulesAmount) })
  };
}

function mapOperator(operator: OperatorIdentity) {
  if (operator.kind === 'foreign') return { ForeignOperator: true };
  if (operator.taxNumber === undefined) {
    throw new FursDomainError('FURS_OPERATOR_IDENTITY', 'Slovenian and self-service operators require a tax number');
  }
  return { OperatorTaxNumber: operator.taxNumber.toInteger(), ForeignOperator: false };
}

export function createValidatedInvoiceRequest(
  input: InvoiceRequestInput,
  validator: PinnedOfficialSchemaValidator
): ValidatedFursPayload {
  const invoice = input.invoice;
  const payload = {
    InvoiceRequest: {
      Header: {
        MessageID: input.messageId.toString(),
        DateTime: input.sentAt.toPayloadDateTime()
      },
      Invoice: {
        TaxNumber: invoice.taxNumber.toInteger(),
        IssueDateTime: invoice.issueDateTime.toPayloadDateTime(),
        NumberingStructure: invoice.numberingStructure,
        InvoiceIdentifier: mapIdentity(invoice.identity),
        ...(invoice.customerVatNumber === undefined ? {} : { CustomerVATNumber: invoice.customerVatNumber }),
        InvoiceAmount: exactAmount(invoice.invoiceAmount),
        ...(invoice.returnsAmount === undefined ? {} : { ReturnsAmount: exactAmount(invoice.returnsAmount) }),
        PaymentAmount: exactAmount(invoice.paymentAmount),
        TaxesPerSeller: invoice.taxesPerSeller.map(mapSellerTaxes),
        ...mapOperator(invoice.operator),
        ProtectedID: invoice.protectedId.toString(),
        ...(invoice.subsequentSubmit === undefined ? {} : { SubsequentSubmit: invoice.subsequentSubmit }),
        ...(invoice.referenceInvoices === undefined
          ? {}
          : {
              ReferenceInvoice: invoice.referenceInvoices.map((reference) => ({
                ReferenceInvoiceIdentifier: mapIdentity(reference.identity),
                ReferenceInvoiceIssueDateTime: reference.issueDateTime.toPayloadDateTime()
              }))
            }),
        ...(invoice.referenceSalesBooks === undefined
          ? {}
          : {
              ReferenceSalesBook: invoice.referenceSalesBooks.map((reference) => ({
                ReferenceSalesBookIdentifier: {
                  InvoiceNumber: reference.identifier.invoiceNumber,
                  SetNumber: reference.identifier.setNumber,
                  SerialNumber: reference.identifier.serialNumber
                },
                ReferenceSalesBookIssueDate: reference.issueDate.toString()
              }))
            }),
        ...(invoice.specialNotes === undefined ? {} : { SpecialNotes: invoice.specialNotes })
      }
    }
  };
  return ValidatedFursPayload.fromJson(serializeFursJson(payload), validator);
}
