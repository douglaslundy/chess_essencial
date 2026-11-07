'use client';

import type { ClassroomSummary } from '@xadrez/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';

export default function ClassroomsPage() {
  const [rooms, setRooms] = useState<ClassroomSummary[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('Carregando salas…');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setMessage('Entre na sua conta para ver as salas de aula.');
      return;
    }
    try {
      const list = await api.listClassrooms(token);
      setRooms(list);
      setMessage(list.length ? '' : 'Você ainda não tem salas. Crie a primeira abaixo.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as salas.');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setBusy(true);
    try {
      await api.createClassroom(name.trim(), token);
      setName('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível criar a sala.');
    } finally {
      setBusy(false);
    }
  }

  const attending = rooms.filter((room) => room.role === 'student');
  const teaching = rooms.filter((room) => room.role === 'teacher');

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Sala de aula</h1>
        <p>Dê aula ao vivo: o que você abre na plataforma aparece na tela dos seus alunos.</p>
      </header>

      {attending.length > 0 ? (
        <section aria-label="Aulas em que você é aluno">
          <h2>Minhas aulas</h2>
          {attending.map((room) => (
            <Link className="classroomEnter" href={`/app/sala/${room.id}`} key={room.id}>
              Entrar na aula: {room.name} (professor {room.teacherName})
            </Link>
          ))}
        </section>
      ) : null}

      <section aria-label="Salas que você ensina">
        <h2>Salas que eu ensino</h2>
        <div className="adminUserTable" role="table">
          {teaching.map((room) => (
            <div className="adminUserRow" key={room.id} role="row">
              <div>
                <strong>{room.name}</strong> <span>{room.studentCount} alunos</span>
              </div>
              <div className="adminUserActions">
                <Link href={`/app/sala/${room.id}`}>Abrir</Link>
              </div>
            </div>
          ))}
        </div>
        <form className="adminSearch" onSubmit={create}>
          <input
            disabled={busy}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome da nova sala"
            value={name}
          />
          <button disabled={busy || !name.trim()} type="submit">
            Criar sala de aula
          </button>
        </form>
      </section>
      <p role="status">{message}</p>
    </main>
  );
}
