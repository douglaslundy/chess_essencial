'use client';

import type { ClassroomDetail, Friend } from '@xadrez/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';
import {
  CLASSROOM_AREAS,
  readClassroomSession,
  writeClassroomSession,
} from '@/lib/classroom-session';

export default function ClassroomPage() {
  const router = useRouter();
  const classroomId = String(useParams<{ classroomId: string }>().classroomId);
  const [room, setRoom] = useState<ClassroomDetail | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState('Carregando a sala…');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setMessage('Entre na sua conta para ver a sala.');
      return;
    }
    try {
      setRoom(await api.getClassroom(classroomId, token));
      setMessage('');
      // Friends are optional (social plan): the picker just stays empty if the list is denied.
      setFriends(await api.listFriends(token).catch(() => []));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a sala.');
    }
  }, [classroomId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function enter(role: 'teacher' | 'student', href?: string) {
    if (!room) return;
    writeClassroomSession({ id: room.id, name: room.name, role });
    if (href) router.push(href);
  }

  async function run(action: (token: string) => Promise<void>, failure: string) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setBusy(true);
    try {
      await action(token);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  }

  function addStudent(event: FormEvent) {
    event.preventDefault();
    void run(async (token) => {
      await api.addClassroomMember(classroomId, identifier.trim(), token);
      setIdentifier('');
    }, 'Não foi possível adicionar o aluno.');
  }

  if (!room)
    return (
      <main className="dashboardPage">
        <p role="status">{message}</p>
      </main>
    );

  const isTeacher = room.role === 'teacher';
  const active = readClassroomSession()?.id === room.id;

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>{room.name}</h1>
        <p>
          Professor: {room.teacherName} · {room.studentCount} alunos
        </p>
      </header>

      {isTeacher ? (
        <>
          <section aria-label="Aula ao vivo">
            <h2>Aula ao vivo</h2>
            <p>
              Ao começar, tudo o que você abrir é mostrado aos alunos que entrarem na aula. Use os
              botões de área para navegar.
            </p>
            <div className="classroomAreas">
              {CLASSROOM_AREAS.map((area) => (
                <button key={area.href} onClick={() => enter('teacher', area.href)} type="button">
                  {area.label}
                </button>
              ))}
            </div>
            {active ? (
              <p>Aula em andamento. Use “Encerrar aula” na faixa do topo para terminar.</p>
            ) : null}
          </section>

          <section aria-label="Alunos">
            <h2>Alunos</h2>
            <form className="adminSearch" onSubmit={addStudent}>
              <input
                disabled={busy}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Usuário, e-mail ou ID do aluno"
                value={identifier}
              />
              <button disabled={busy || !identifier.trim()} type="submit">
                Adicionar aluno
              </button>
            </form>
            {friends
              .filter((friend) => !room.members.some((m) => m.userId === friend.userId))
              .map((friend) => (
                <button
                  disabled={busy}
                  key={friend.userId}
                  onClick={() =>
                    void run(
                      (token) => api.addClassroomMember(classroomId, friend.userId, token),
                      'Não foi possível adicionar o aluno.',
                    )
                  }
                  type="button"
                >
                  Adicionar amigo {friend.displayName}
                </button>
              ))}
            <div className="adminUserTable" role="table">
              {room.members.map((member) => (
                <div className="adminUserRow" key={member.userId} role="row">
                  <div>
                    <strong>{member.displayName}</strong> <span>@{member.username}</span>
                  </div>
                  <div className="adminUserActions">
                    <button
                      className="dangerAction"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          (token) => api.removeClassroomMember(classroomId, member.userId, token),
                          'Não foi possível remover o aluno.',
                        )
                      }
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <button
            className="dangerAction"
            disabled={busy}
            onClick={() => {
              if (readClassroomSession()?.id === room.id) writeClassroomSession(null);
              void run(async (token) => {
                await api.deleteClassroom(classroomId, token);
                router.push('/app/sala');
              }, 'Não foi possível apagar a sala.');
            }}
            type="button"
          >
            Apagar sala
          </button>
        </>
      ) : (
        <section aria-label="Entrar na aula">
          <button className="classroomEnter" onClick={() => enter('student', '/app')} type="button">
            {active ? 'Você está na aula, acompanhando o professor' : 'Entrar na aula'}
          </button>
        </section>
      )}
      <p role="status">{message}</p>
    </main>
  );
}
