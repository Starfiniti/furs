# Checklist for Slovenian accountant/tax/legal review

Project: Starfiniti FURS Kit
Version/commit: ____________________
Reviewer: ____________________
Date: ____________________

## Scope confirmation

- [ ] The reviewed product boundary is a fiscalization engine, not a complete accounting system.
- [ ] The legal entity/entities and business models in scope are listed.
- [ ] The supported sales channels and countries are listed.
- [ ] The reviewer used current law/regulation and official guidance.

## Payment and timing scenarios

For every active scenario, confirm whether fiscalization is required and exactly when the invoice must be issued/submitted:

- [ ] cash
- [ ] POS card
- [ ] online card
- [ ] Stripe
- [ ] PayPal
- [ ] cash on delivery
- [ ] bank transfer/UPN
- [ ] store credit/gift card
- [ ] deposit/partial payment
- [ ] subscription/recurring payment
- [ ] marketplace/merchant-of-record
- [ ] mixed payment

Attach a completed scenario table with references and assumptions.

## Invoice and operator rules

- [ ] Correct premise/device/sequence policy is defined.
- [ ] Physical Slovenian operator identification is defined.
- [ ] Foreign operator flow is defined.
- [ ] Self-service/no-physical-operator flow is defined.
- [ ] Required visible receipt/invoice fields and customer notice are confirmed.
- [ ] Internal act and business-premise registration responsibilities are assigned.

## Corrections and exceptional flows

- [ ] Cancellation before fiscalization.
- [ ] Full and partial refund after confirmation.
- [ ] Credit note/correction reference to original document.
- [ ] Duplicate payment/order event.
- [ ] FURS/network outage and later submission.
- [ ] Rejected submission requiring corrected data.
- [ ] Certificate expiry/revocation incident.
- [ ] Record retention and audit obligations.

## Tax structures actually supported

- [ ] Standard Slovenian VAT.
- [ ] Reduced VAT rates used by customers.
- [ ] Exempt/non-taxable scenarios.
- [ ] Reverse charge or other special treatment.
- [ ] Negative amounts in corrections.
- [ ] Rounding policy and source-of-truth totals.

## Signoff

Supported scenarios approved for production: ______________________________

Unsupported scenarios requiring blocking/manual handling: _________________

Open legal/accounting questions: _________________________________________

Reviewer signature/approval reference: ___________________________________
