import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { signLiveKitToken } from './livekit-token.js';

const TOKEN_TTL_SECONDS = 6 * 60 * 60;

/** LiveKit voice for the classroom. Off (503) unless LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are set. */
@Injectable()
export class ClassroomVoiceService {
  private config() {
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    return url && apiKey && apiSecret ? { apiKey, apiSecret, url } : null;
  }

  get enabled(): boolean {
    return this.config() !== null;
  }

  /** Joins the classroom's voice room; only the teacher starts with the microphone allowed. */
  joinToken(classroomId: string, userId: string, isTeacher: boolean) {
    const config = this.config();
    if (!config) throw new ServiceUnavailableException('O áudio da aula não está ativado.');
    return {
      canSpeak: isTeacher,
      token: signLiveKitToken(config.apiKey, config.apiSecret, userId, classroomId, {
        canPublish: isTeacher,
        ttlSeconds: TOKEN_TTL_SECONDS,
      }),
      url: config.url,
    };
  }

  /** Teacher opens or closes a student's microphone in the running room. */
  async setSpeaking(classroomId: string, userId: string, speaking: boolean): Promise<void> {
    const config = this.config();
    if (!config) throw new ServiceUnavailableException('O áudio da aula não está ativado.');
    const admin = signLiveKitToken(config.apiKey, config.apiSecret, 'api', classroomId, {
      admin: true,
      ttlSeconds: 60,
    });
    const base = config.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
    const response = await fetch(`${base}/twirp/livekit.RoomService/UpdateParticipant`, {
      body: JSON.stringify({
        identity: userId,
        permission: { canPublish: speaking, canPublishData: false, canSubscribe: true },
        room: classroomId,
      }),
      headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' },
      method: 'POST',
    });
    // 404: the student has not joined the audio yet; the token they get next is listen-only anyway.
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException('Não foi possível alterar o microfone agora.');
    }
  }
}
