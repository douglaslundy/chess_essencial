import type {
  CourseDetail,
  CourseSummary,
  InteractiveLesson,
  SaveLessonInput,
} from '@xadrez/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TransactionSql } from 'postgres';
import { DatabaseService } from '../database/database.service.js';
import { jsonValue } from '../database/json-value.js';

interface CourseRow {
  description: string;
  id: string;
  moduleCount: number;
  slug: string;
  status: CourseSummary['status'];
  title: string;
  version: number;
}
interface ModuleRow {
  description: string | null;
  id: string;
  position: number;
  sourceVolume: number | null;
  title: string;
}
interface LessonRow {
  estimatedMinutes: number;
  id: string;
  moduleId: string;
  position: number;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  title: string;
  version: number;
}
interface PageRow {
  lessonId: string;
  page: number;
}

@Injectable()
export class CoursesRepository {
  constructor(private readonly database: DatabaseService) {}

  listPublished(): Promise<CourseSummary[]> {
    return this.database.client<CourseRow[]>`
      SELECT courses.id, courses.slug::text AS slug, courses.title, courses.description,
        courses.status, courses.version, count(course_modules.id)::integer AS "moduleCount"
      FROM courses LEFT JOIN course_modules ON course_modules.course_id = courses.id
      WHERE courses.status = 'published' GROUP BY courses.id ORDER BY courses.title
    `;
  }

  async getCourse(identifier: string, publishedOnly: boolean): Promise<CourseDetail> {
    const [course] = await this.database.client<CourseRow[]>`
      SELECT courses.id, courses.slug::text AS slug, courses.title, courses.description,
        courses.status, courses.version, count(course_modules.id)::integer AS "moduleCount"
      FROM courses LEFT JOIN course_modules ON course_modules.course_id = courses.id
      WHERE (${publishedOnly}::boolean = false OR courses.status = 'published')
        AND (courses.slug::text = ${identifier} OR courses.id::text = ${identifier})
      GROUP BY courses.id
    `;
    if (!course) throw new NotFoundException('Curso não encontrado');
    const modules = await this.database.client<ModuleRow[]>`
      SELECT id, position, title, description, source_volume AS "sourceVolume"
      FROM course_modules WHERE course_id = ${course.id} ORDER BY position
    `;
    const lessons = await this.database.client<LessonRow[]>`
      SELECT lessons.id, lessons.module_id AS "moduleId", lessons.slug::text AS slug,
        lessons.position, lessons.title, lessons.estimated_minutes AS "estimatedMinutes",
        lessons.status, lessons.version
      FROM lessons JOIN course_modules ON course_modules.id = lessons.module_id
      WHERE course_modules.course_id = ${course.id}
        AND (${publishedOnly}::boolean = false OR lessons.status = 'published')
      ORDER BY course_modules.position, lessons.position
    `;
    const pages = lessons.length
      ? await this.database.client<PageRow[]>`
      SELECT lesson_id AS "lessonId", page FROM lesson_source_pages
      WHERE lesson_id IN ${this.database.client(lessons.map((lesson) => lesson.id))} ORDER BY page
    `
      : [];
    return {
      ...course,
      modules: modules.map((module) => ({
        description: module.description,
        id: module.id,
        lessons: lessons
          .filter((lesson) => lesson.moduleId === module.id)
          .map((lesson) => ({
            estimatedMinutes: lesson.estimatedMinutes,
            id: lesson.id,
            position: lesson.position,
            slug: lesson.slug,
            sourcePages: pages
              .filter((page) => page.lessonId === lesson.id)
              .map((page) => page.page),
            status: lesson.status,
            title: lesson.title,
            version: lesson.version,
          })),
        position: module.position,
        sourceVolume: module.sourceVolume ?? module.position,
        title: module.title,
      })),
    };
  }

  async getEditor(courseId: string, userId: string) {
    await this.assertEditor(userId);
    return this.getCourse(courseId, false);
  }

  async saveLesson(courseId: string, slug: string, userId: string, input: SaveLessonInput) {
    await this.assertEditor(userId);
    if (slug !== input.lesson.slug) throw new BadRequestException('Slug divergente');
    return this.database.client.begin(async (tx) => {
      const [module] = await tx<{ id: string }[]>`
        SELECT id FROM course_modules WHERE course_id = ${courseId}
          AND source_volume = ${input.lesson.module} FOR UPDATE
      `;
      if (!module) throw new NotFoundException('Módulo não encontrado');
      const [existing] = await tx<LessonRow[]>`
        SELECT id, module_id AS "moduleId", slug::text AS slug, position, title,
          estimated_minutes AS "estimatedMinutes", status, version
        FROM lessons WHERE module_id = ${module.id} AND slug::text = ${slug} FOR UPDATE
      `;
      if ((existing?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException('Versão desatualizada');
      const version = (existing?.version ?? 0) + 1;
      const lessonId =
        existing?.id ?? (await this.insertLesson(tx, module.id, input.lesson, version));
      if (existing)
        await tx`
        UPDATE lessons SET title = ${input.lesson.title}, estimated_minutes = ${input.lesson.estimatedMinutes},
          version = ${version} WHERE id = ${lessonId}
      `;
      await tx`DELETE FROM lesson_steps WHERE lesson_id = ${lessonId}`;
      await tx`DELETE FROM lesson_source_pages WHERE lesson_id = ${lessonId}`;
      await tx`DELETE FROM lesson_prerequisites WHERE lesson_id = ${lessonId}`;
      for (const [index, step] of input.lesson.steps.entries())
        await tx`
        INSERT INTO lesson_steps (lesson_id, step_key, position, step_type, title, body_md, initial_fen,
          orientation, expected_actions, feedback, next_step_rules)
        VALUES (${lessonId}, ${step.stepKey}, ${index + 1}, ${step.stepType}, ${step.title ?? null},
          ${step.bodyMd}, ${step.initialFen ?? null}, ${step.orientation ?? null},
          ${tx.json(jsonValue(step.expectedActions))}, ${tx.json(jsonValue(step.feedback))},
          ${tx.json(jsonValue(step.nextStepRules))})
      `;
      for (const page of [...new Set(input.lesson.sourcePages)])
        await tx`
        INSERT INTO lesson_source_pages (lesson_id, page) VALUES (${lessonId}, ${page})
      `;
      for (const prerequisiteSlug of input.lesson.prerequisites) {
        const [prerequisite] = await tx<{ id: string }[]>`
          SELECT lessons.id FROM lessons JOIN course_modules ON course_modules.id = lessons.module_id
          WHERE course_modules.course_id = ${courseId} AND lessons.slug::text = ${prerequisiteSlug}
        `;
        if (!prerequisite) throw new BadRequestException('Pré-requisito inexistente');
        await tx`INSERT INTO lesson_prerequisites VALUES (${lessonId}, ${prerequisite.id})`;
      }
      await tx`INSERT INTO lesson_versions (lesson_id, version, content, created_by_user_id)
        VALUES (${lessonId}, ${version}, ${tx.json(jsonValue(input.lesson))}, ${userId})`;
      const [saved] = await tx<{ createdAt: Date | string }[]>`
        SELECT created_at AS "createdAt" FROM lesson_versions WHERE lesson_id = ${lessonId} AND version = ${version}
      `;
      return {
        content: input.lesson,
        createdAt: new Date(saved!.createdAt).toISOString(),
        createdByUserId: userId,
        lessonId,
        version,
      };
    });
  }

  async publish(courseId: string, userId: string) {
    await this.assertEditor(userId);
    return this.database.client.begin(async (tx) => {
      const [ready] = await tx<
        { invalidLessons: number; moduleCount: number; modulesWithoutLessons: number }[]
      >`
        SELECT count(DISTINCT course_modules.id)::integer AS "moduleCount",
          count(DISTINCT course_modules.id) FILTER (WHERE lessons.id IS NULL)::integer AS "modulesWithoutLessons",
          count(DISTINCT lessons.id) FILTER (WHERE lessons.id IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM lesson_source_pages WHERE lesson_source_pages.lesson_id = lessons.id))::integer AS "invalidLessons"
        FROM course_modules LEFT JOIN lessons ON lessons.module_id = course_modules.id
        WHERE course_modules.course_id = ${courseId}
      `;
      if (!ready || ready.moduleCount !== 10)
        throw new BadRequestException('O curso deve possuir 10 módulos');
      if (ready.modulesWithoutLessons || ready.invalidLessons)
        throw new BadRequestException('Conteúdo e páginas-fonte obrigatórios');
      await tx`UPDATE lessons SET status = 'published' WHERE module_id IN
        (SELECT id FROM course_modules WHERE course_id = ${courseId})`;
      const [course] = await tx<CourseRow[]>`UPDATE courses SET status = 'published',
        version = version + 1, updated_at = now() WHERE id = ${courseId}
        RETURNING id, slug::text AS slug, title, description, status, version, 10::integer AS "moduleCount"`;
      if (!course) throw new NotFoundException('Curso não encontrado');
      return course;
    });
  }

  private async assertEditor(userId: string) {
    const [role] = await this.database.client<{ allowed: boolean }[]>`
      SELECT true AS allowed FROM user_roles WHERE user_id = ${userId}
        AND role IN ('admin', 'content_editor')
    `;
    if (!role) throw new ForbiddenException('Permissão editorial obrigatória');
  }

  private async insertLesson(
    tx: TransactionSql<Record<string, never>>,
    moduleId: string,
    lesson: InteractiveLesson,
    version: number,
  ) {
    const [position] = await tx<
      { next: number }[]
    >`SELECT coalesce(max(position), 0)::integer + 1 AS next
      FROM lessons WHERE module_id = ${moduleId}`;
    const [created] = await tx<{ id: string }[]>`INSERT INTO lessons
      (module_id, slug, position, title, estimated_minutes, version)
      VALUES (${moduleId}, ${lesson.slug}, ${position!.next}, ${lesson.title},
        ${lesson.estimatedMinutes}, ${version}) RETURNING id`;
    return created!.id;
  }
}
