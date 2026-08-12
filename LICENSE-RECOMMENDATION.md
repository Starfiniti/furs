# License decision

Starfiniti d.o.o. selected Apache License 2.0 for the repository, core SDK,
self-hosted service and current standalone adapters on 12 August 2026. The full
canonical license text, copyright notice, third-party inventory and contribution
policy are now included.

The current WooCommerce component communicates through HTTP/event contracts and
contains no WordPress/WooCommerce dependency or embedded plugin code, so it is
covered by Apache-2.0 with the rest of this work. A future in-process WordPress
plugin requires a fresh GPL compatibility decision.

Contributions use DCO 1.1 sign-off rather than a CLA. Production dependencies
were inventoried as permissive MIT, ISC, BSD-3-Clause, or the BSD-3-Clause
option of node-forge's dual license. Preserve dependency license/attribution
files and SBOMs. Do not copy AGPL or otherwise incompatible code into this work.
This engineering record does not replace legal advice for future distribution
models or newly added platform code.
