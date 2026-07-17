import './telemetry.js';
import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';

import { createApp } from './bootstrap.js';

const app = await createApp();
const config = app.get(ConfigService);
const port = config.get<number>('API_PORT', 4000);

await app.listen({ host: '0.0.0.0', port });
