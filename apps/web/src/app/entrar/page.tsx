'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api/client';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const router = useRouter();
  const verificationStarted = useRef(false);
  const [mode, setMode] = useState<Mode>('login');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('verify');
    if (!token || verificationStarted.current) return;
    verificationStarted.current = true;
    setBusy(true);
    api
      .verifyEmail(token)
      .then(() => setMessage('E-mail confirmado. Agora você já pode entrar.'))
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Não foi possível confirmar o e-mail.'),
      )
      .finally(() => setBusy(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      if (mode === 'register') {
        const result = await api.register({
          displayName: String(data.get('displayName') ?? ''),
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
          username: String(data.get('username') ?? ''),
        });
        if (result.verificationToken) await api.verifyEmail(result.verificationToken);
        setMode('login');
        setMessage(
          result.verificationToken
            ? 'Conta confirmada no ambiente local. Faça login.'
            : 'Cadastro criado. Confira seu e-mail para confirmar a conta.',
        );
      } else {
        const result = await api.login({
          identifier: String(data.get('identifier') ?? ''),
          password: String(data.get('password') ?? ''),
        });
        window.localStorage.setItem('xadrez.access_token', result.tokens.accessToken);
        window.localStorage.setItem('xadrez.refresh_token', result.tokens.refreshToken);
        window.localStorage.setItem('xadrez.user_id', result.user.id);
        window.localStorage.setItem('xadrez.username', result.user.username);
        window.dispatchEvent(new Event('xadrez-auth'));
        router.push('/app');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  }

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      await api.resendVerification({ email: String(data.get('resendEmail') ?? '') });
      setMessage('Se a conta estiver pendente, um novo e-mail foi enviado.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível reenviar a verificação.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authPage">
      <section className="authCard" aria-labelledby="auth-title">
        <p className="eyebrow">Xadrez Essencial</p>
        <h1 id="auth-title">{mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta'}</h1>
        <div className="authTabs" role="tablist" aria-label="Acesso">
          <button
            aria-selected={mode === 'login'}
            onClick={() => setMode('login')}
            role="tab"
            type="button"
          >
            Entrar
          </button>
          <button
            aria-selected={mode === 'register'}
            onClick={() => setMode('register')}
            role="tab"
            type="button"
          >
            Cadastrar
          </button>
        </div>
        <form onSubmit={submit}>
          {mode === 'register' ? (
            <>
              <label>
                Nome de exibição
                <input autoComplete="name" name="displayName" required />
              </label>
              <label>
                Nome de usuário
                <input
                  autoComplete="username"
                  minLength={3}
                  name="username"
                  pattern="[A-Za-z0-9_]+"
                  required
                />
              </label>
              <label>
                E-mail
                <input autoComplete="email" name="email" required type="email" />
              </label>
            </>
          ) : (
            <label>
              E-mail ou nome de usuário
              <input autoComplete="username" name="identifier" required />
            </label>
          )}
          <label>
            Senha
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 12 : 1}
              name="password"
              required
              type="password"
            />
          </label>
          <button className="primaryButton" disabled={busy} type="submit">
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        <details className="resendVerification">
          <summary>Não recebeu o e-mail de verificação?</summary>
          <form onSubmit={resend}>
            <label>
              E-mail cadastrado
              <input autoComplete="email" name="resendEmail" required type="email" />
            </label>
            <button className="secondaryButton" disabled={busy} type="submit">
              Reenviar verificação
            </button>
          </form>
        </details>
        <p className="authMessage" role="status">
          {message}
        </p>
      </section>
    </main>
  );
}
