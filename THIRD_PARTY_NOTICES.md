# Third-party software

The production dependency graph was inventoried on 12 August 2026 with
`corepack pnpm licenses list --prod`. Its declared license families are MIT,
ISC, BSD-3-Clause, and `(BSD-3-Clause OR GPL-2.0)`.

Direct runtime dependencies are:

| Dependency | Declared license |
|---|---|
| `ajv` | MIT |
| `ajv-draft-04` | MIT |
| `bwip-js` | MIT |
| `fastify` | MIT |
| `node-forge` | BSD-3-Clause OR GPL-2.0; this distribution uses the BSD-3-Clause option |
| `pg` | MIT |
| `qrcode` | MIT |

Transitive dependency license texts and attribution files remain within their
installed package directories and release SBOM. This summary does not replace
those license texts. The repository does not vendor official FURS documents or
schemas, and no reviewed implementation code was copied from the comparative
projects listed in `EXISTING_LIBRARY_AUDIT.md`.
