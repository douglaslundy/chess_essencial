import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'xadrez-api',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
  });
  sdk.start();

  const shutdown = () => {
    void sdk.shutdown().catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify({
          event: 'telemetry.shutdown_failed',
          error: error instanceof Error ? error.message : 'unknown',
        })}\n`,
      );
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
