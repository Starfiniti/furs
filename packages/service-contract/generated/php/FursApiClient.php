<?php
declare(strict_types=1);

namespace Starfiniti\Furs;

final class FursApiException extends \RuntimeException
{
    public function __construct(
        public readonly int $statusCode,
        public readonly string $errorCode,
        public readonly ?string $correlationId,
        string $message
    ) {
        parent::__construct($message);
    }
}

final class FursApiClient
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly string $bearerToken,
        private readonly int $timeoutSeconds = 20
    ) {
        $scheme = parse_url($baseUrl, PHP_URL_SCHEME);
        $host = parse_url($baseUrl, PHP_URL_HOST);
        $loopback = in_array($host, ['localhost', '127.0.0.1', '::1'], true);
        if ($scheme !== 'https' && !($scheme === 'http' && $loopback)) {
            throw new \InvalidArgumentException('FURS API URL must use HTTPS outside localhost');
        }
        if (strlen($bearerToken) < 32) {
            throw new \InvalidArgumentException('FURS API bearer token must contain at least 32 characters');
        }
    }

    public function createFiscalInvoice(array $command, string $idempotencyKey): array
    {
        return $this->request('POST', '/v1/fiscal-invoices', $command, ['Idempotency-Key: '.$idempotencyKey]);
    }

    public function getFiscalInvoice(string $id): array
    {
        return $this->request('GET', '/v1/fiscal-invoices/'.rawurlencode($id));
    }

    public function retryFiscalInvoice(string $id): array
    {
        return $this->request('POST', '/v1/fiscal-invoices/'.rawurlencode($id).'/retry');
    }

    public function upsertBusinessPremise(array $command, string $idempotencyKey): array
    {
        return $this->request('POST', '/v1/business-premises', $command, ['Idempotency-Key: '.$idempotencyKey]);
    }

    public function updateBusinessPremise(string $id, array $command, string $idempotencyKey): array
    {
        return $this->request('PATCH', '/v1/business-premises/'.rawurlencode($id), $command, ['Idempotency-Key: '.$idempotencyKey]);
    }

    public function configureElectronicDevice(string $id, array $configuration): array
    {
        return $this->request('PUT', '/v1/electronic-devices/'.rawurlencode($id), $configuration);
    }

    public function getOperatorSummary(): array
    {
        return $this->request('GET', '/v1/operator/summary');
    }

    public function listOperatorDocuments(?string $status = null, int $limit = 100): array
    {
        $query = http_build_query(array_filter(['status' => $status, 'limit' => $limit], static fn ($value): bool => $value !== null));
        return $this->request('GET', '/v1/operator/documents?'.$query);
    }

    public function runReconciliation(): array
    {
        return $this->request('POST', '/v1/reconciliation/run');
    }

    public function getSystemInfo(): array
    {
        return $this->request('GET', '/v1/system/info');
    }

    public function fursEcho(string $value): array
    {
        return $this->request('POST', '/v1/furs/echo', ['value' => $value]);
    }

    public function getLiveHealth(): array
    {
        return $this->request('GET', '/health/live');
    }

    public function getReadyHealth(): array
    {
        return $this->request('GET', '/health/ready');
    }

    private function request(string $method, string $path, ?array $body = null, array $extraHeaders = []): array
    {
        $handle = curl_init(rtrim($this->baseUrl, '/').$path);
        if ($handle === false) {
            throw new \RuntimeException('Unable to initialize HTTP client');
        }
        $headers = array_merge([
            'Accept: application/json',
            'Authorization: Bearer '.$this->bearerToken,
        ], $extraHeaders);
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
        ];
        if ($body !== null) {
            $encoded = json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
            $headers[] = 'Content-Type: application/json';
            $options[CURLOPT_HTTPHEADER] = $headers;
            $options[CURLOPT_POSTFIELDS] = $encoded;
        }
        curl_setopt_array($handle, $options);
        $raw = curl_exec($handle);
        if ($raw === false) {
            $message = curl_error($handle);
            curl_close($handle);
            throw new \RuntimeException('FURS API transport failure: '.$message);
        }
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);
        $decoded = json_decode($raw, true, flags: JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) {
            throw new \RuntimeException('FURS API returned a non-object response');
        }
        if ($status < 200 || $status >= 300) {
            $error = is_array($decoded['error'] ?? null) ? $decoded['error'] : [];
            throw new FursApiException(
                $status,
                is_string($error['code'] ?? null) ? $error['code'] : 'FURS_CLIENT_HTTP_ERROR',
                is_string($error['correlationId'] ?? null) ? $error['correlationId'] : null,
                is_string($error['message'] ?? null) ? $error['message'] : 'FURS API request failed'
            );
        }
        return $decoded;
    }
}
