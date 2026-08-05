import assert from 'node:assert/strict';
import test from 'node:test';

import { compareRoutes, controllerRoutes, openApiRoutes } from './check-openapi-route-parity.mjs';

test('normalizes Nest path parameters and empty method paths', () => {
  const routes = controllerRoutes(`
    @Controller('games')
    class GamesController {
      @Get() list() {}
      @Post(':gameId/moves') move() {}
    }
  `);
  assert.deepEqual(routes, ['GET /games', 'POST /games/{gameId}/moves']);
});

test('extracts only HTTP operations from OpenAPI paths', () => {
  const routes = openApiRoutes(`
paths:
  /games/{gameId}:
    parameters: []
    get:
      responses: {}
    post:
      responses: {}
components: {}
  `);
  assert.deepEqual(routes, ['GET /games/{gameId}', 'POST /games/{gameId}']);
});

test('reports missing and stale operations independently', () => {
  assert.deepEqual(compareRoutes(['GET /real'], ['POST /stale']), {
    missing: ['GET /real'],
    stale: ['POST /stale'],
  });
});
