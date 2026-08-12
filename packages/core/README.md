# `@starfiniti/furs-core`

Pure TypeScript fiscalization domain and cryptographic kernel.

The current implementation includes the locally verifiable parts of Phases 1 and 2. Implemented requirements and external gate blockers are documented beside tests and in the repository phase-status files. This package intentionally has no database, HTTP framework, or UI dependency.

Public monetary input uses canonical decimal strings. Legal invoice time is an immutable local value in `Europe/Ljubljana`; it is never reconstructed from the host time zone.

Invoice and business-premise mappers return an opaque payload only after digest-locked official-schema validation. Real-estate and movable premise types `A`/`B`/`C` are supported; vending types `D`/`E`/`F` remain an explicit, fail-closed extension boundary pending scenario review.

Invoice and premise responses are exposed as typed results only after JWS signature/chain verification, pinned-schema validation, internal outcome validation, and request-message correlation. Decoded-but-unverified response objects are not accepted by the typed response API.
