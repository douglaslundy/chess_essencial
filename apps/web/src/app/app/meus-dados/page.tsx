'use client';

import type {
  LearningBadge,
  LearningProgress,
  MyReferralInfo,
  PublicUser,
  UpdateMeInput,
} from '@xadrez/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';
import { usePieceTheme } from '@/lib/piece-theme';
import { speak } from '@/lib/speech';
import { useVoicePreference } from '@/lib/voice-preference';
import { listVoiceOptions, type VoiceOption } from '@/lib/voices';
import styles from '@/components/portal/portal-pages.module.css';

// Resize an image file to a square-ish JPEG (max `size` px) and return base64
// without the data: prefix, keeping the upload well under the server limit.
async function resizeToJpegBase64(file: File, size: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponível');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.split(',')[1] ?? '';
}

export default function MyDataPage() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [message, setMessage] = useState('Carregando seus dados…');
  const [referral, setReferral] = useState<MyReferralInfo | null>(null);
  const [referralLink, setReferralLink] = useState('');
  const [referralMessage, setReferralMessage] = useState('');
  const {
    error: pieceThemeError,
    isSaving: pieceThemeSaving,
    theme: pieceTheme,
    setTheme: setPieceTheme,
  } = usePieceTheme();
  const themeOptions: { value: 'classic' | 'staunton_3d' | 'wood'; label: string }[] = [
    { label: 'Clássico', value: 'classic' },
    { label: 'Staunton 3D', value: 'staunton_3d' },
    { label: 'Madeira', value: 'wood' },
  ];
  const {
    error: voicePreferenceError,
    isSaving: voicePreferenceSaving,
    voiceName,
    setVoiceName,
    reviewNarrationEnabled,
    setReviewNarrationEnabled,
  } = useVoicePreference();
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [learningProgress, setLearningProgress] = useState<LearningProgress | null>(null);
  const [badges, setBadges] = useState<LearningBadge[]>([]);

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token') ?? undefined;
    listVoiceOptions(token)
      .then(setVoiceOptions)
      .catch(() => undefined);
  }, []);

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
      api
        .getMyReferral(token)
        .then((info) => {
          setReferral(info);
          setReferralLink(`${window.location.origin}/entrar?ref=${info.code}`);
        })
        .catch(() => undefined);
      api
        .getLearningProgress(token)
        .then(setLearningProgress)
        .catch(() => undefined);
      api
        .getLearningBadges(token)
        .then(setBadges)
        .catch(() => undefined);
    });
  }, []);

  async function copyReferralLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setReferralMessage('Link copiado.');
    } catch {
      setReferralMessage(referralLink);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const data = new FormData(event.currentTarget);
    const birthDate = String(data.get('birthDate') ?? '').trim();
    const input: UpdateMeInput = {
      bio: String(data.get('bio') ?? '').trim() || null,
      birthDate: birthDate || null,
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

  async function toggleSuggestMove(enabled: boolean) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token || !user) return;
    try {
      setUser(await api.updateMe({ suggestMoveEnabled: enabled }, token));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar essa configuração.',
      );
    }
  }

  async function previewVoice(voice: VoiceOption) {
    setPreviewingVoice(voice.name);
    try {
      await speak('Olá! Esta é a voz que acompanhará o seu treinamento.', {
        interrupt: true,
        voiceName: voice.name,
      });
      setMessage(
        voice.source === 'openai'
          ? 'Prévia reproduzida com voz gerada por IA da OpenAI.'
          : 'Prévia reproduzida com a voz do sistema.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível reproduzir esta voz.');
    } finally {
      setPreviewingVoice(null);
    }
  }

  async function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setMessage('Enviando avatar…');
    try {
      const dataBase64 = await resizeToJpegBase64(file, 256);
      const updated = await api.uploadAvatar({ contentType: 'image/jpeg', dataBase64 }, token);
      setUser(updated);
      window.dispatchEvent(new Event('xadrez-auth'));
      setMessage('Avatar atualizado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o avatar.');
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
        <div className={styles.avatarRow}>
          {user.profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Avatar" className={styles.avatarPreview} src={user.profile.avatarUrl} />
          ) : (
            <span className={styles.avatarFallback} aria-hidden="true">
              {user.profile.displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <label className={styles.avatarUpload}>
            Trocar avatar
            <input accept="image/*" hidden onChange={onAvatarChange} type="file" />
          </label>
        </div>
      ) : null}
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
              Data de nascimento
              <input
                defaultValue={user.profile.birthDate ?? ''}
                max={new Date().toISOString().slice(0, 10)}
                min="1900-01-01"
                name="birthDate"
                type="date"
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
      {user ? (
        <section className={styles.formCard} aria-label="Tema do tabuleiro">
          <h2>Tema do tabuleiro e peças</h2>
          <div className="sourceFilterPreview" role="group" aria-label="Escolher tema">
            {themeOptions.map((option) => (
              <button
                aria-pressed={pieceTheme === option.value}
                disabled={pieceThemeSaving}
                key={option.value}
                onClick={() => void setPieceTheme(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {pieceThemeError ? (
            <p className={styles.status} role="alert">
              {pieceThemeError}
            </p>
          ) : null}
        </section>
      ) : null}
      {user ? (
        <section className={styles.formCard} aria-label="Treinador">
          <h2>Treinador</h2>
          <p>
            Nas partidas contra o Treinador, eu mostro o melhor lance que sugiro antes de cada uma
            das suas jogadas.
          </p>
          <label className={styles.checkbox}>
            <input
              checked={user.profile.suggestMoveEnabled}
              onChange={(event) => void toggleSuggestMove(event.target.checked)}
              type="checkbox"
            />{' '}
            Sugerir lance
          </label>
        </section>
      ) : null}
      {user ? (
        <section className={styles.formCard} aria-label="Voz do Treinador">
          <h2>Voz do Treinador</h2>
          <p>
            Escolha a voz que uso para falar com você. Clique em &quot;Ouvir&quot; para testar antes
            de escolher.
          </p>
          {voiceOptions.length === 0 ? (
            <p className={styles.status} role="status">
              Não encontrei vozes para prévia neste navegador. A narração ainda funciona com a voz
              padrão do sistema.
            </p>
          ) : (
            <div className={styles.formGrid}>
              {voiceOptions.map((voice) => (
                <label className={styles.checkbox} key={voice.name}>
                  <input
                    checked={(voiceName ?? voiceOptions[0]?.name) === voice.name}
                    disabled={voicePreferenceSaving}
                    name="voiceName"
                    onChange={() => void setVoiceName(voice.name)}
                    type="radio"
                  />{' '}
                  {voice.label}
                  {voice.source === 'openai' ? ' (voz gerada por IA)' : ''}
                  <button
                    disabled={previewingVoice === voice.name}
                    onClick={() => void previewVoice(voice)}
                    type="button"
                  >
                    {previewingVoice === voice.name ? 'Ouvindo…' : 'Ouvir'}
                  </button>
                </label>
              ))}
            </div>
          )}
          <label className={styles.checkbox}>
            <input
              checked={reviewNarrationEnabled}
              disabled={voicePreferenceSaving}
              onChange={(event) => void setReviewNarrationEnabled(event.target.checked)}
              type="checkbox"
            />{' '}
            Narrar os lances por voz no resumo/revisão pós-partida
          </label>
          {voicePreferenceError ? (
            <p className={styles.status} role="alert">
              {voicePreferenceError}
            </p>
          ) : null}
        </section>
      ) : null}
      {learningProgress ? (
        <section className={styles.formCard} aria-label="Jornada de Aprendizagem">
          <h2>Jornada de Aprendizagem</h2>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Pontos de experiência
              <input disabled value={`${learningProgress.xp} XP`} />
            </label>
            <label className={styles.field}>
              Sequência de dias
              <input
                disabled
                value={
                  learningProgress.streakDays === 1
                    ? '1 dia'
                    : `${learningProgress.streakDays} dias`
                }
              />
            </label>
          </div>
          {badges.length > 0 ? (
            <ul className={styles.formGrid} aria-label="Conquistas">
              {badges.map((badge) => (
                <li key={badge.badgeKey}>
                  🏆 {badge.label}
                  <br />
                  <small>{new Date(badge.earnedAt).toLocaleDateString('pt-BR')}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.status} role="status">
              Nenhuma conquista ainda — resolva etapas em Treinamento para ganhar as primeiras.
            </p>
          )}
        </section>
      ) : null}
      {referral ? (
        <section className={styles.formCard} aria-label="Indicações">
          <h2>Convide amigos</h2>
          <p>
            Compartilhe seu código ou link para convidar amigos. {referral.rewardedCount} de{' '}
            {referral.totalCount} indicação(ões) já confirmada(s).
          </p>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Seu código
              <input disabled value={referral.code} />
            </label>
            <label className={styles.field}>
              Link de convite
              <input disabled value={referralLink} />
            </label>
          </div>
          <button
            className={styles.primaryButton}
            onClick={() => void copyReferralLink()}
            type="button"
          >
            Copiar link
          </button>
          <p className={styles.status} role="status">
            {referralMessage}
          </p>
        </section>
      ) : null}
    </main>
  );
}
