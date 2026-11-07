import {
  addClassroomMemberInputSchema,
  classroomLiveInputSchema,
  createClassroomInputSchema,
  type ClassroomDetail,
  type ClassroomLive,
  type ClassroomSummary,
} from '@xadrez/contracts';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { ClassroomRepository } from './classroom.repository.js';

@UseGuards(AccessTokenGuard)
@Controller('classrooms')
export class ClassroomController {
  constructor(private readonly classrooms: ClassroomRepository) {}

  /** Loads the room and the caller's role; 404 for strangers so rooms stay private. */
  private async access(classroomId: string, userId: string) {
    const room = await this.classrooms.find(classroomId);
    if (!room) throw new NotFoundException('Sala não encontrada.');
    const isTeacher = room.teacher_id === userId;
    if (!isTeacher && !(await this.classrooms.isMember(classroomId, userId))) {
      throw new NotFoundException('Sala não encontrada.');
    }
    return { room, isTeacher };
  }

  private async teacherOnly(classroomId: string, userId: string) {
    const { room, isTeacher } = await this.access(classroomId, userId);
    if (!isTeacher) throw new ForbiddenException('Somente o professor pode fazer isso.');
    return room;
  }

  @Get()
  list(@Req() request: AuthenticatedRequest): Promise<ClassroomSummary[]> {
    return this.classrooms.listFor(request.auth.userId);
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ClassroomSummary> {
    const input = parseInput(createClassroomInputSchema, body);
    const id = await this.classrooms.create(request.auth.userId, input.name);
    const rooms = await this.classrooms.listFor(request.auth.userId);
    return rooms.find((room) => room.id === id)!;
  }

  @Get(':classroomId')
  async detail(
    @Req() request: AuthenticatedRequest,
    @Param('classroomId') id: string,
  ): Promise<ClassroomDetail> {
    const { room, isTeacher } = await this.access(id, request.auth.userId);
    return {
      id: room.id,
      name: room.name,
      role: isTeacher ? 'teacher' : 'student',
      teacherName: room.teacher_name,
      studentCount: room.student_count,
      members: await this.classrooms.members(room.id),
    };
  }

  @Delete(':classroomId')
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedRequest, @Param('classroomId') id: string) {
    const room = await this.teacherOnly(id, request.auth.userId);
    await this.classrooms.remove(room.id);
  }

  @Post(':classroomId/members')
  @HttpCode(204)
  async addMember(
    @Req() request: AuthenticatedRequest,
    @Param('classroomId') id: string,
    @Body() body: unknown,
  ) {
    const room = await this.teacherOnly(id, request.auth.userId);
    const input = parseInput(addClassroomMemberInputSchema, body);
    const studentId = await this.classrooms.findStudent(input.identifier);
    if (!studentId) throw new UnprocessableEntityException('Aluno não encontrado.');
    if (studentId === room.teacher_id) {
      throw new UnprocessableEntityException('O professor já faz parte da sala.');
    }
    await this.classrooms.addMember(room.id, studentId);
  }

  @Delete(':classroomId/members/:userId')
  @HttpCode(204)
  async removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('classroomId') id: string,
    @Param('userId') userId: string,
  ) {
    const room = await this.teacherOnly(id, request.auth.userId);
    await this.classrooms.removeMember(room.id, userId);
  }

  /** The teacher's current page; students poll GET :id/live and follow it. */
  @Put(':classroomId/live')
  @HttpCode(204)
  async publish(
    @Req() request: AuthenticatedRequest,
    @Param('classroomId') id: string,
    @Body() body: unknown,
  ) {
    const room = await this.teacherOnly(id, request.auth.userId);
    await this.classrooms.publish(room.id, parseInput(classroomLiveInputSchema, body).path);
  }

  @Get(':classroomId/live')
  async live(
    @Req() request: AuthenticatedRequest,
    @Param('classroomId') id: string,
  ): Promise<ClassroomLive> {
    const { room } = await this.access(id, request.auth.userId);
    return this.classrooms.live(room.id);
  }
}
