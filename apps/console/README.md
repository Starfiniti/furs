# Starfiniti FURS operator console

Minimal same-origin operator UI for backlog, manual-review and retry status.
Register it on the API Fastify instance with `registerOperatorConsole(app)`.
The bearer token remains only in page memory and is never written to browser
storage, URLs, logs or HTML.
