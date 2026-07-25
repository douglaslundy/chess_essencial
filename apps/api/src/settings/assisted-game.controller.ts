import { Controller, Get, UseGuards } from '@nestjs/common';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { SettingsService } from './settings.service.js';

// Unlike SettingsController (admin-only CRUD for this and other platform
// settings), any logged-in user needs to read whether "partida assistida"
// is currently enabled, to decide whether to show its button on the demo
// board. Registered from AdminModule purely to reuse its existing AuthModule
// import (see settings.module.ts for why SettingsModule itself can't import
// AuthModule) — this controller is not admin-gated.
@UseGuards(AccessTokenGuard)
@Controller('settings')
export class AssistedGameController {
  constructor(private readonly settings: SettingsService) {}

  @Get('assisted-game')
  getAssistedGame() {
    return this.settings.getAssistedGameSettings();
  }
}
