# Phase 1 cryptographic and transport spike

This CLI is the Gate P1 integration harness. It loads a FURS test PKCS#12 certificate, compiles the pinned official schema, derives canonical date/amount values, generates a ZOI, creates an outbound RS256 JWS, and calls the official FURS test echo endpoint over strict mutual TLS.

It emits only allowlisted, redacted evidence. It never prints the P12 path/password, private key, tax number, canonical ZOI input, ZOI, JWS token, or response token.

Required environment variables:

```text
FURS_TEST_P12_PATH
FURS_TEST_P12_PASSWORD_FILE
FURS_TEST_SERVER_CA_PATH
FURS_OFFICIAL_SCHEMA_PATH
FURS_TEST_TAX_NUMBER
FURS_INVOICE_LOCAL_TIME
FURS_INVOICE_NUMBER
FURS_BUSINESS_PREMISE_ID
FURS_ELECTRONIC_DEVICE_ID
FURS_INVOICE_AMOUNT
```

Optional signed-response fixture verification:

```text
FURS_SIGNED_RESPONSE_TOKEN_PATH
FURS_RESPONSE_TRUST_CA_PATH
```

Build and run:

```bash
corepack pnpm build
corepack pnpm --filter @starfiniti/furs-crypto-spike start
```

Only FURS test credentials and test endpoints are supported by this spike.
