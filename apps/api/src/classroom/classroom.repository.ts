import type { ClassroomGameView, ClassroomMember, ClassroomSummary } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

interface ClassroomRow {
  id: string;
  name: string;
  teacher_id: string;
  teacher_name: string;
  student_count: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ClassroomRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(teacherId: string, name: string): Promise<string> {
    const [row] = await this.database.client<Array<{ id: string }>>`
      INSERT INTO classrooms (teacher_id, name) VALUES (${teacherId}, ${name}) RETURNING id
    `;
    return row!.id;
  }

  /** Rooms the user teaches or attends. */
  async listFor(userId: string): Promise<ClassroomSummary[]> {
    const rows = await this.database.client<Array<ClassroomRow & { is_teacher: boolean }>>`
      SELECT c.id, c.name, c.teacher_id, p.display_name AS teacher_name,
             (c.teacher_id = ${userId}) AS is_teacher,
             (SELECT count(*)::int FROM classroom_members m WHERE m.classroom_id = c.id) AS student_count
        FROM classrooms c
        JOIN user_profiles p ON p.user_id = c.teacher_id
       WHERE c.teacher_id = ${userId}
          OR EXISTS (SELECT 1 FROM classroom_members m WHERE m.classroom_id = c.id AND m.user_id = ${userId})
       ORDER BY c.created_at DESC
    `;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.is_teacher ? 'teacher' : 'student',
      teacherName: row.teacher_name,
      studentCount: row.student_count,
    }));
  }

  async find(classroomId: string): Promise<ClassroomRow | null> {
    if (!UUID.test(classroomId)) return null;
    const [row] = await this.database.client<ClassroomRow[]>`
      SELECT c.id, c.name, c.teacher_id, p.display_name AS teacher_name,
             (SELECT count(*)::int FROM classroom_members m WHERE m.classroom_id = c.id) AS student_count
        FROM classrooms c JOIN user_profiles p ON p.user_id = c.teacher_id
       WHERE c.id = ${classroomId}
    `;
    return row ?? null;
  }

  async isMember(classroomId: string, userId: string): Promise<boolean> {
    const rows = await this.database.client`
      SELECT 1 FROM classroom_members WHERE classroom_id = ${classroomId} AND user_id = ${userId}
    `;
    return rows.length > 0;
  }

  async members(classroomId: string): Promise<ClassroomMember[]> {
    const rows = await this.database.client<
      Array<{ user_id: string; username: string; display_name: string }>
    >`
      SELECT u.id AS user_id, u.username::text, p.display_name
        FROM classroom_members m
        JOIN users u ON u.id = m.user_id
        JOIN user_profiles p ON p.user_id = u.id
       WHERE m.classroom_id = ${classroomId}
       ORDER BY p.display_name
    `;
    return rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
    }));
  }

  /** Looks a student up by id, username or e-mail (active accounts only). */
  async findStudent(identifier: string): Promise<string | null> {
    const asId = UUID.test(identifier) ? identifier : null;
    const [row] = await this.database.client<Array<{ id: string }>>`
      SELECT id FROM users
       WHERE status = 'active'
         AND (username = ${identifier} OR email = ${identifier} OR id = ${asId}::uuid)
       LIMIT 1
    `;
    return row?.id ?? null;
  }

  async addMember(classroomId: string, userId: string): Promise<void> {
    await this.database.client`
      INSERT INTO classroom_members (classroom_id, user_id) VALUES (${classroomId}, ${userId})
      ON CONFLICT DO NOTHING
    `;
  }

  async removeMember(classroomId: string, userId: string): Promise<void> {
    await this.database.client`
      DELETE FROM classroom_members WHERE classroom_id = ${classroomId} AND user_id = ${userId}
    `;
  }

  async remove(classroomId: string): Promise<void> {
    await this.database.client`DELETE FROM classrooms WHERE id = ${classroomId}`;
  }

  /** The teacher's game as a spectator sees it; null unless the teacher is one of its players. */
  async spectateGame(teacherId: string, gameId: string): Promise<ClassroomGameView | null> {
    const sql = this.database.client;
    const [game] = await sql<
      Array<{
        current_fen: string;
        result: ClassroomGameView['result'];
        side_to_move: 'black' | 'white';
        status: string;
      }>
    >`
      SELECT g.current_fen, g.result::text AS result, g.side_to_move::text AS side_to_move,
             g.status::text AS status
        FROM games g
        JOIN game_players mine ON mine.game_id = g.id AND mine.user_id = ${teacherId}
       WHERE g.id = ${gameId}
    `;
    if (!game) return null;
    const names = await sql<Array<{ color: 'black' | 'white'; display_name: string }>>`
      SELECT gp.color::text AS color, p.display_name
        FROM game_players gp JOIN user_profiles p ON p.user_id = gp.user_id
       WHERE gp.game_id = ${gameId}
    `;
    const moves = await sql<
      Array<{ from_square: string; ply: number; san: string; to_square: string }>
    >`
      SELECT ply, san, from_square, to_square FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
    `;
    return {
      black: names.find((row) => row.color === 'black')?.display_name ?? 'Pretas',
      fen: game.current_fen,
      moves: moves.map((move) => ({
        from: move.from_square,
        ply: Number(move.ply),
        san: move.san,
        to: move.to_square,
      })),
      result: game.result,
      sideToMove: game.side_to_move,
      status: game.status,
      white: names.find((row) => row.color === 'white')?.display_name ?? 'Brancas',
    };
  }

  async publish(classroomId: string, path: string): Promise<void> {
    await this.database.client`
      UPDATE classrooms SET live_path = ${path}, live_seq = live_seq + 1 WHERE id = ${classroomId}
    `;
  }

  async live(classroomId: string): Promise<{ path: string; seq: number }> {
    const [row] = await this.database.client<Array<{ live_path: string; live_seq: string }>>`
      SELECT live_path, live_seq FROM classrooms WHERE id = ${classroomId}
    `;
    return { path: row!.live_path, seq: Number(row!.live_seq) };
  }
}
