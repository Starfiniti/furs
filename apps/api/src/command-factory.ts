import {
  BusinessPremiseId,
  BusinessAddress,
  BusinessPremise,
  calculateZoi,
  createValidatedInvoiceRequest,
  DecimalAmount,
  ElectronicDeviceId,
  FlatRateCompensation,
  FiscalInvoice,
  FiscalInvoiceIdentity,
  FursDate,
  IdempotencyKey,
  InvoiceReference,
  InvoiceSequence,
  LocalInvoiceDateTime,
  MessageId,
  MovablePremiseLocation,
  OperatorIdentity,
  PreparedFiscalCommand,
  PreparedBusinessPremiseCommand,
  PropertyIdentifier,
  RealEstatePremiseLocation,
  SellerTaxes,
  SoftwareSupplier,
  SlovenianTaxNumber,
  VatRate,
  VatSummary,
  Zoi,
  type FiscalSigner,
  type PinnedOfficialSchemaValidator
} from '@starfiniti/furs-core';
import { createValidatedBusinessPremiseRequest } from '@starfiniti/furs-core';
import type { BusinessPremiseRequest, FiscalInvoiceRequest, SellerTaxesRequest } from '@starfiniti/furs-service-contract';
import type { ConfirmedInvoiceReference } from '@starfiniti/furs-persistence-postgres';

export interface FiscalCommandFactory {
  create(
    request: FiscalInvoiceRequest,
    idempotencyKey: string,
    sequence: string,
    reference?: ConfirmedInvoiceReference
  ): Promise<PreparedFiscalCommand>;
}

export interface BusinessPremiseCommandFactory {
  create(request: BusinessPremiseRequest, idempotencyKey: string): PreparedBusinessPremiseCommand;
}

export interface CoreFiscalCommandFactoryOptions {
  readonly signer: FiscalSigner;
  readonly invoiceSchema: PinnedOfficialSchemaValidator;
  readonly headerLocalTime?: () => LocalInvoiceDateTime;
}

function optionalAmount(value: string | undefined): DecimalAmount | undefined {
  return value === undefined ? undefined : DecimalAmount.parse(value);
}

function taxes(input: SellerTaxesRequest): SellerTaxes {
  return SellerTaxes.create({
    ...(input.sellerTaxNumber === undefined ? {} : { sellerTaxNumber: SlovenianTaxNumber.parse(input.sellerTaxNumber) }),
    ...(input.vat === undefined ? {} : {
      vat: input.vat.map((line) => new VatSummary(
        VatRate.parse(line.rate), DecimalAmount.parse(line.taxableAmount), DecimalAmount.parse(line.taxAmount)
      ))
    }),
    ...(input.flatRateCompensation === undefined ? {} : {
      flatRateCompensation: input.flatRateCompensation.map((line) => new FlatRateCompensation(
        VatRate.parse(line.rate), DecimalAmount.parse(line.taxableAmount), DecimalAmount.parse(line.amount)
      ))
    }),
    ...(input.otherTaxesAmount === undefined ? {} : { otherTaxesAmount: DecimalAmount.parse(input.otherTaxesAmount) }),
    ...(input.exemptVatTaxableAmount === undefined ? {} : { exemptVatTaxableAmount: DecimalAmount.parse(input.exemptVatTaxableAmount) }),
    ...(input.reverseVatTaxableAmount === undefined ? {} : { reverseVatTaxableAmount: DecimalAmount.parse(input.reverseVatTaxableAmount) }),
    ...(input.nontaxableAmount === undefined ? {} : { nontaxableAmount: DecimalAmount.parse(input.nontaxableAmount) }),
    ...(input.specialTaxRulesAmount === undefined ? {} : { specialTaxRulesAmount: DecimalAmount.parse(input.specialTaxRulesAmount) })
  });
}

function operator(input: FiscalInvoiceRequest['operator']): OperatorIdentity {
  if (input.kind === 'foreign') return OperatorIdentity.foreign();
  const number = SlovenianTaxNumber.parse(input.taxNumber);
  return input.kind === 'self-service' ? OperatorIdentity.selfService(number) : OperatorIdentity.slovenian(number);
}

export class CoreFiscalCommandFactory implements FiscalCommandFactory {
  readonly #options: CoreFiscalCommandFactoryOptions;

  public constructor(options: CoreFiscalCommandFactoryOptions) {
    this.#options = options;
  }

  public async create(
    request: FiscalInvoiceRequest,
    idempotencyKey: string,
    sequence: string,
    reference?: ConfirmedInvoiceReference
  ): Promise<PreparedFiscalCommand> {
    if ((request.kind === 'STANDARD') !== (reference === undefined)) {
      throw new Error('Correction/cancellation protocol reference is inconsistent');
    }
    const taxNumber = SlovenianTaxNumber.parse(request.taxNumber);
    const issueTime = LocalInvoiceDateTime.parse(request.issueLocalTime);
    const identity = new FiscalInvoiceIdentity(
      BusinessPremiseId.parse(request.businessPremiseId),
      ElectronicDeviceId.parse(request.electronicDeviceId),
      InvoiceSequence.parse(sequence)
    );
    const invoiceAmount = DecimalAmount.parse(request.invoiceAmount);
    const zoi = Zoi.parse(await calculateZoi({
      taxNumber: taxNumber.toString(), issueDateTime: issueTime,
      invoiceNumber: sequence, businessPremiseId: request.businessPremiseId,
      electronicDeviceId: request.electronicDeviceId, invoiceAmount
    }, this.#options.signer));
    const invoice = FiscalInvoice.create({
      taxNumber,
      issueDateTime: issueTime,
      numberingStructure: request.numberingStructure,
      identity,
      ...(request.customerVatNumber === undefined ? {} : { customerVatNumber: request.customerVatNumber }),
      invoiceAmount,
      ...(request.returnsAmount === undefined ? {} : { returnsAmount: optionalAmount(request.returnsAmount) as DecimalAmount }),
      paymentAmount: DecimalAmount.parse(request.paymentAmount),
      taxesPerSeller: request.taxesPerSeller.map(taxes),
      operator: operator(request.operator),
      protectedId: zoi,
      ...(reference === undefined ? {} : {
        referenceInvoices: [new InvoiceReference(
          new FiscalInvoiceIdentity(
            BusinessPremiseId.parse(reference.businessPremiseId),
            ElectronicDeviceId.parse(reference.electronicDeviceId),
            InvoiceSequence.parse(reference.invoiceSequence)
          ),
          LocalInvoiceDateTime.parse(reference.issueLocalTime)
        )]
      }),
      ...(request.subsequentSubmit === undefined ? {} : { subsequentSubmit: request.subsequentSubmit }),
      ...(request.specialNotes === undefined ? {} : { specialNotes: request.specialNotes })
    });
    const messageId = MessageId.parse(request.messageId);
    const payload = createValidatedInvoiceRequest({
      messageId,
      sentAt: this.#options.headerLocalTime?.() ?? issueTime,
      invoice
    }, this.#options.invoiceSchema);
    return PreparedFiscalCommand.create({
      legalEntityId: request.legalEntityId,
      idempotencyKey: IdempotencyKey.parse(idempotencyKey),
      kind: request.kind,
      ...(request.correctionOfDocumentId === undefined ? {} : { correctionOfOperationId: request.correctionOfDocumentId }),
      identity,
      messageId,
      payload,
      zoi,
      issueDateTime: issueTime.toString(),
      issuedWithoutEor: request.subsequentSubmit === true
    });
  }
}

export class CoreBusinessPremiseCommandFactory implements BusinessPremiseCommandFactory {
  readonly #schema: PinnedOfficialSchemaValidator;

  public constructor(schema: PinnedOfficialSchemaValidator) { this.#schema = schema; }

  public create(request: BusinessPremiseRequest, idempotencyKey: string): PreparedBusinessPremiseCommand {
    const location = request.location.kind === 'movable'
      ? new MovablePremiseLocation(request.location.premiseType)
      : new RealEstatePremiseLocation(
          new PropertyIdentifier(
            request.location.cadastralNumber,
            request.location.buildingNumber,
            request.location.buildingSectionNumber
          ),
          new BusinessAddress(request.location.address)
        );
    const premise = BusinessPremise.create({
      taxNumber: SlovenianTaxNumber.parse(request.taxNumber),
      businessPremiseId: BusinessPremiseId.parse(request.businessPremiseId),
      location,
      validityDate: FursDate.parse(request.validityDate),
      closing: request.lifecycleStatus === 'CLOSED',
      softwareSuppliers: request.softwareSuppliers.map((supplier) =>
        supplier.kind === 'slovenian'
          ? SoftwareSupplier.slovenian(SlovenianTaxNumber.parse(supplier.taxNumber))
          : SoftwareSupplier.foreign(supplier.nameAndAddress)
      ),
      ...(request.specialNotes === undefined ? {} : { specialNotes: request.specialNotes })
    });
    const messageId = MessageId.parse(request.messageId);
    const sentAt = LocalInvoiceDateTime.parse(request.sentAt);
    const payload = createValidatedBusinessPremiseRequest({ messageId, sentAt, businessPremise: premise }, this.#schema);
    return PreparedBusinessPremiseCommand.create({
      legalEntityId: request.legalEntityId,
      idempotencyKey: IdempotencyKey.parse(idempotencyKey),
      businessPremiseId: premise.businessPremiseId,
      requestedStatus: request.lifecycleStatus,
      messageId,
      payload,
      sentAt: sentAt.toString()
    });
  }
}
