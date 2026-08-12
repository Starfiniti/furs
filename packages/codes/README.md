# @starfiniti/furs-codes

Exact 60-digit FURS receipt-code data construction and optional QR rendering.
The builder is independent of rendering so receipt layouts can preserve the
same verified data across QR, PDF417 and segmented Code 128 implementations.

The final digit is the sum of the preceding 59 digits modulo 10, as specified
by FURS Technical Documentation v3.2, page 123.
