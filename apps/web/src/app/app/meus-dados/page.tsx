'use client';

import type { PublicUser, UpdateMeInput } from '@xadrez/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

export default function MyDataPage() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [message, setMessage] = useState('Carregando seus dados…');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre na sua conta para alterar seus dados.');
        return;
      }
      api
        .getMe(token)
        .then(setUser)
        .then(() => setMessage(''))
        .catch((error: unknown) =>
          setMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar seus dados.',
          ),
        );
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const data = new FormData(event.currentTarget);
    const birthYear = String(data.get('birthYear') ?? '').trim();
    const input: UpdateMeInput = {
      bio: String(data.get('bio') ?? '').trim() || null,
      birthYear: birthYear ? Number(birthYear) : null,
      countryCode:
        String(data.get('countryCode') ?? '')
          .trim()
          .toUpperCase() || null,
      displayName: String(data.get('displayName') ?? '').trim(),
      isProfilePublic: data.get('isProfilePublic') === 'on',
      locale: String(data.get('locale') ?? '').trim(),
      timezone: String(data.get('timezone') ?? '').trim(),
    };
    setMessage('Salvando…');
    try {
      setUser(await api.updateMe(input, token));
      setMessage('Dados atualizados com sucesso.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar seus dados.');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Conta</span>
        <h1>Meus dados</h1>
        <p>Atualize as informações exibidas no seu perfil.</p>
      </header>
      <p className={styles.status} role="status">
        {message}
      </p>
      {user ? (
        <form className={styles.formCard} onSubmit={save}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              E-mail
              <input disabled value={user.email} />
            </label>
            <label className={styles.field}>
              Usuário
              <input disabled value={user.username} />
            </label>
            <label className={styles.field}>
              Nome de exibição
              <input
                defaultValue={user.profile.displayName}
                maxLength={80}
                name="displayName"
                required
              />
            </label>
            <label className={styles.field}>
              País
              <input
                defaultValue={user.profile.countryCode ?? ''}
                maxLength={2}
                name="countryCode"
                placeholder="BR"
              />
            </label>
            <label className={styles.field}>
              Fuso horário
              <input defaultValue={user.profile.timezone} name="timezone" required />
            </label>
            <label className={styles.field}>
              Idioma
              <input defaultValue={user.profile.locale} name="locale" required />
            </label>
            <label className={styles.field}>
              Ano de nascimento
              <input
                defaultValue={user.profile.birthYear ?? ''}
                min="1900"
                name="birthYear"
                type="number"
              />
            </label>
          </div>
          <label className={styles.field}>
            Biografia
            <textarea defaultValue={user.profile.bio ?? ''} maxLength={500} name="bio" rows={5} />
          </label>
          <label className={styles.checkbox}>
            <input
              defaultChecked={user.profile.isProfilePublic}
              name="isProfilePublic"
              type="checkbox"
            />{' '}
            Perfil público
          </label>
          <button className={styles.primaryButton} type="submit">
            Salvar alterações
          </button>
        </form>
      ) : null}
    </main>
  );
}
