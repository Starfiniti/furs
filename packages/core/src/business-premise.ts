import { FursDomainError } from './domain-error.js';
import { serializeFursJson, ValidatedFursPayload } from './furs-json.js';
import { LocalInvoiceDateTime } from './local-invoice-date-time.js';
import type { PinnedOfficialSchemaValidator } from './schema-validator.js';
import {
  BusinessPremiseId,
  FursDate,
  MessageId,
  SlovenianTaxNumber
} from './value-types.js';

function boundedText(name: string, value: string, minimum: number, maximum: number): string {
  const length = typeof value === 'string' ? [...value].length : -1;
  if (length < minimum || length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new FursDomainError('FURS_PREMISE_TEXT', `${name} must contain ${minimum}-${maximum} printable characters`);
  }
  return value;
}

function boundedInteger(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new FursDomainError('FURS_PREMISE_NUMBER', `${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

export interface BusinessAddressInput {
  readonly street: string;
  readonly houseNumber: string;
  readonly houseNumberAdditional?: string;
  readonly community: string;
  readonly city: string;
  readonly postalCode: string;
}

export class BusinessAddress {
  public readonly street: string;
  public readonly houseNumber: string;
  public readonly houseNumberAdditional: string | undefined;
  public readonly community: string;
  public readonly city: string;
  public readonly postalCode: string;

  public constructor(input: BusinessAddressInput) {
    this.street = boundedText('Street', input.street, 1, 100);
    this.houseNumber = boundedText('House number', input.houseNumber, 1, 10);
    this.houseNumberAdditional =
      input.houseNumberAdditional === undefined
        ? undefined
        : boundedText('House-number addition', input.houseNumberAdditional, 1, 10);
    this.community = boundedText('Community', input.community, 1, 100);
    this.city = boundedText('Post office', input.city, 1, 40);
    if (!/^\d{4}$/.test(input.postalCode)) {
      throw new FursDomainError('FURS_POSTAL_CODE', 'Slovenian postal code must contain exactly four digits');
    }
    this.postalCode = input.postalCode;
    Object.freeze(this);
  }
}

export class PropertyIdentifier {
  public readonly cadastralNumber: number;
  public readonly buildingNumber: number;
  public readonly buildingSectionNumber: number;

  public constructor(cadastralNumber: number, buildingNumber: number, buildingSectionNumber: number) {
    this.cadastralNumber = boundedInteger('Cadastral number', cadastralNumber, 0, 9999);
    this.buildingNumber = boundedInteger('Building number', buildingNumber, 0, 99999);
    this.buildingSectionNumber = boundedInteger('Building-section number', buildingSectionNumber, 0, 9999);
    Object.freeze(this);
  }
}

export class RealEstatePremiseLocation {
  public readonly kind = 'real-estate';
  public readonly propertyIdentifier: PropertyIdentifier;
  public readonly address: BusinessAddress;

  public constructor(propertyIdentifier: PropertyIdentifier, address: BusinessAddress) {
    this.propertyIdentifier = propertyIdentifier;
    this.address = address;
    Object.freeze(this);
  }
}

export type MovablePremiseType = 'A' | 'B' | 'C';

export class MovablePremiseLocation {
  public readonly kind = 'movable';
  public readonly premiseType: MovablePremiseType;

  public constructor(premiseType: MovablePremiseType) {
    if (premiseType !== 'A' && premiseType !== 'B' && premiseType !== 'C') {
      throw new FursDomainError('FURS_MOVABLE_PREMISE', 'Movable premise type must be A, B, or C');
    }
    this.premiseType = premiseType;
    Object.freeze(this);
  }
}

export type SupportedBusinessPremiseLocation = RealEstatePremiseLocation | MovablePremiseLocation;
export type ReservedVendingPremiseType = 'D' | 'E' | 'F';

export function rejectUnsupportedVendingPremise(type: ReservedVendingPremiseType): never {
  throw new FursDomainError(
    'FURS_VENDING_UNSUPPORTED',
    `Vending-premise type ${type} is reserved by the current schema but outside the reviewed v1 scope`
  );
}

export class SoftwareSupplier {
  public readonly kind: 'slovenian' | 'foreign';
  public readonly taxNumber: SlovenianTaxNumber | undefined;
  public readonly foreignNameAndAddress: string | undefined;

  private constructor(
    kind: 'slovenian' | 'foreign',
    taxNumber: SlovenianTaxNumber | undefined,
    foreignNameAndAddress: string | undefined
  ) {
    this.kind = kind;
    this.taxNumber = taxNumber;
    this.foreignNameAndAddress = foreignNameAndAddress;
    Object.freeze(this);
  }

  public static slovenian(taxNumber: SlovenianTaxNumber): SoftwareSupplier {
    return new SoftwareSupplier('slovenian', taxNumber, undefined);
  }

  public static foreign(nameAndAddress: string): SoftwareSupplier {
    return new SoftwareSupplier('foreign', undefined, boundedText('Foreign supplier name and address', nameAndAddress, 1, 1000));
  }
}

export interface BusinessPremiseInput {
  readonly taxNumber: SlovenianTaxNumber;
  readonly businessPremiseId: BusinessPremiseId;
  readonly location: SupportedBusinessPremiseLocation;
  readonly validityDate: FursDate;
  readonly closing: boolean;
  readonly softwareSuppliers: readonly SoftwareSupplier[];
  readonly specialNotes?: string;
}

export class BusinessPremise {
  public readonly taxNumber: SlovenianTaxNumber;
  public readonly businessPremiseId: BusinessPremiseId;
  public readonly location: SupportedBusinessPremiseLocation;
  public readonly validityDate: FursDate;
  public readonly closing: boolean;
  public readonly softwareSuppliers: readonly SoftwareSupplier[];
  public readonly specialNotes: string | undefined;

  private constructor(input: BusinessPremiseInput) {
    this.taxNumber = input.taxNumber;
    this.businessPremiseId = input.businessPremiseId;
    this.location = input.location;
    this.validityDate = input.validityDate;
    this.closing = input.closing;
    if (!Array.isArray(input.softwareSuppliers) || input.softwareSuppliers.length < 1 || input.softwareSuppliers.length > 1000) {
      throw new FursDomainError('FURS_SOFTWARE_SUPPLIER', 'At least one and at most 1000 software suppliers are required');
    }
    this.softwareSuppliers = Object.freeze([...input.softwareSuppliers]);
    this.specialNotes =
      input.specialNotes === undefined
        ? undefined
        : boundedText('Business-premise special notes', input.specialNotes, 1, 1000);
    Object.freeze(this);
  }

  public static create(input: BusinessPremiseInput): BusinessPremise {
    return new BusinessPremise(input);
  }
}

export interface BusinessPremiseRequestInput {
  readonly messageId: MessageId;
  readonly sentAt: LocalInvoiceDateTime;
  readonly businessPremise: BusinessPremise;
}

function mapAddress(address: BusinessAddress) {
  return {
    Street: address.street,
    HouseNumber: address.houseNumber,
    ...(address.houseNumberAdditional === undefined
      ? {}
      : { HouseNumberAdditional: address.houseNumberAdditional }),
    Community: address.community,
    City: address.city,
    PostalCode: address.postalCode
  };
}

function mapLocation(location: SupportedBusinessPremiseLocation) {
  if (location.kind === 'movable') return { PremiseType: location.premiseType };
  return {
    RealEstateBP: {
      PropertyID: {
        CadastralNumber: location.propertyIdentifier.cadastralNumber,
        BuildingNumber: location.propertyIdentifier.buildingNumber,
        BuildingSectionNumber: location.propertyIdentifier.buildingSectionNumber
      },
      Address: mapAddress(location.address)
    }
  };
}

function mapSupplier(supplier: SoftwareSupplier) {
  if (supplier.kind === 'slovenian') {
    if (supplier.taxNumber === undefined) {
      throw new FursDomainError('FURS_SOFTWARE_SUPPLIER', 'Slovenian software supplier requires a tax number');
    }
    return { TaxNumber: supplier.taxNumber.toInteger() };
  }
  if (supplier.foreignNameAndAddress === undefined) {
    throw new FursDomainError('FURS_SOFTWARE_SUPPLIER', 'Foreign software supplier requires its name and address');
  }
  return { NameForeign: supplier.foreignNameAndAddress };
}

export function createValidatedBusinessPremiseRequest(
  input: BusinessPremiseRequestInput,
  validator: PinnedOfficialSchemaValidator
): ValidatedFursPayload {
  const premise = input.businessPremise;
  const payload = {
    BusinessPremiseRequest: {
      Header: {
        MessageID: input.messageId.toString(),
        DateTime: input.sentAt.toPayloadDateTime()
      },
      BusinessPremise: {
        TaxNumber: premise.taxNumber.toInteger(),
        BusinessPremiseID: premise.businessPremiseId.toString(),
        BPIdentifier: mapLocation(premise.location),
        ValidityDate: premise.validityDate.toString(),
        ...(premise.closing ? { ClosingTag: 'Z' } : {}),
        SoftwareSupplier: premise.softwareSuppliers.map(mapSupplier),
        ...(premise.specialNotes === undefined ? {} : { SpecialNotes: premise.specialNotes })
      }
    }
  };
  return ValidatedFursPayload.fromJson(serializeFursJson(payload), validator);
}
