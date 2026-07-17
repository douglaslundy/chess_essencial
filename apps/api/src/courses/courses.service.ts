import type { SaveLessonInput } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { CoursesRepository } from './courses.repository.js';

@Injectable()
export class CoursesService {
  constructor(private readonly courses: CoursesRepository) {}

  listPublished() {
    return this.courses.listPublished();
  }

  getPublished(slug: string) {
    return this.courses.getCourse(slug, true);
  }

  getEditor(courseId: string, userId: string) {
    return this.courses.getEditor(courseId, userId);
  }

  saveLesson(courseId: string, slug: string, userId: string, input: SaveLessonInput) {
    return this.courses.saveLesson(courseId, slug, userId, input);
  }

  publish(courseId: string, userId: string) {
    return this.courses.publish(courseId, userId);
  }
}
