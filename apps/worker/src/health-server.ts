import { createServer } from 'node:http';

export function createHealthServer() {
  return createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(
      JSON.stringify({
        service: 'worker',
        status: 'ok',
        timestamp: new Date().toISOString(),
      }),
    );
  });
}
