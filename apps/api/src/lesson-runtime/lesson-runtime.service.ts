import type { LessonActionInput, StartLessonAttemptInput } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { LessonRuntimeRepository } from './lesson-runtime.repository.js';

@Injectable()
export class LessonRuntimeService {
  constructor(private readonly runtime: LessonRuntimeRepository) {}

  lesson(userId: string, lessonId: string) {
    return this.runtime.lesson(userId, lessonId);
  }

  start(userId: string, input: StartLessonAttemptInput) {
    return this.runtime.start(userId, input.lessonId);
  }

  get(userId: string, attemptId: string) {
    return this.runtime.get(userId, attemptId);
  }

  act(userId: string, attemptId: string, input: LessonActionInput) {
    return this.runtime.act(userId, attemptId, input);
  }
}
