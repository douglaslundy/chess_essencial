'use client';

import type { ClassroomMember } from '@xadrez/contracts';
import type { Room } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api/client';

type Status = 'error' | 'idle' | 'joining' | 'on';

const token = () => window.localStorage.getItem('xadrez.access_token');

/**
 * Classroom audio: the teacher talks, students listen. The teacher gives or takes the floor from
 * each student; a student whose microphone is opened sees a "Falar" button. The microphone needs
 * HTTPS (localhost counts), and the whole feature stays hidden until the server has LiveKit set up.
 */
export function ClassroomVoice({
  classroomId,
  role,
}: {
  classroomId: string;
  role: 'student' | 'teacher';
}) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [micOn, setMicOn] = useState(false);
  const [mayTalk, setMayTalk] = useState(role === 'teacher');
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const room = useRef<Room | null>(null);
  const audioHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const accessToken = token();
    if (!accessToken) return;
    let live = true;
    api
      .getClassroomVoiceStatus(classroomId, accessToken)
      .then((result) => live && setEnabled(result.enabled))
      .catch(() => live && setEnabled(false));
    return () => {
      live = false;
      void room.current?.disconnect();
      room.current = null;
    };
  }, [classroomId]);

  async function join() {
    const accessToken = token();
    if (!accessToken) return;
    if (!window.isSecureContext) {
      setStatus('error');
      setMessage('O áudio só funciona em site seguro (HTTPS).');
      return;
    }
    setStatus('joining');
    setMessage('');
    try {
      const [{ Room, RoomEvent, Track }, grant] = await Promise.all([
        import('livekit-client'),
        api.createClassroomVoiceToken(classroomId, accessToken),
      ]);
      const next = new Room();
      next.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) audioHost.current?.appendChild(track.attach());
      });
      next.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      next.on(RoomEvent.ParticipantPermissionsChanged, () => {
        const allowed = next.localParticipant.permissions?.canPublish === true;
        setMayTalk(allowed);
        if (!allowed) {
          setMicOn(false);
          void next.localParticipant.setMicrophoneEnabled(false);
        }
      });
      next.on(RoomEvent.Disconnected, () => {
        setStatus('idle');
        setMicOn(false);
      });
      await next.connect(grant.url, grant.token);
      room.current = next;
      setMayTalk(grant.canSpeak);
      if (grant.canSpeak) {
        await next.localParticipant.setMicrophoneEnabled(true);
        setMicOn(true);
      }
      if (role === 'teacher') {
        setMembers((await api.getClassroom(classroomId, accessToken)).members);
      }
      setStatus('on');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível entrar no áudio.');
    }
  }

  async function leave() {
    await room.current?.disconnect();
    room.current = null;
    setStatus('idle');
    setMicOn(false);
  }

  async function toggleMic() {
    const next = !micOn;
    try {
      await room.current?.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch {
      setMessage('Não foi possível usar o microfone.');
    }
  }

  async function giveFloor(userId: string, allow: boolean) {
    const accessToken = token();
    if (!accessToken) return;
    try {
      await api.setClassroomSpeaker(classroomId, userId, allow, accessToken);
      setSpeaking((current) => {
        const copy = new Set(current);
        if (allow) copy.add(userId);
        else copy.delete(userId);
        return copy;
      });
    } catch {
      setMessage('Não foi possível alterar o microfone do aluno.');
    }
  }

  if (!enabled) return null;
  return (
    <div aria-label="Áudio da aula" className="classroomVoice" role="group">
      <div aria-hidden="true" className="classroomAudioHost" ref={audioHost} />
      {status === 'on' ? (
        <>
          {mayTalk ? (
            <button aria-pressed={micOn} onClick={() => void toggleMic()} type="button">
              {micOn ? '🎙 Silenciar' : '🎙 Falar'}
            </button>
          ) : (
            <span>🔈 Ouvindo o professor</span>
          )}
          <button onClick={() => void leave()} type="button">
            Sair do áudio
          </button>
          {role === 'teacher' ? (
            <details>
              <summary>Dar a palavra</summary>
              <ul>
                {members.map((member) => (
                  <li key={member.userId}>
                    {member.displayName}{' '}
                    <button
                      onClick={() => void giveFloor(member.userId, !speaking.has(member.userId))}
                      type="button"
                    >
                      {speaking.has(member.userId) ? 'Tirar a palavra' : 'Dar a palavra'}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : (
        <button disabled={status === 'joining'} onClick={() => void join()} type="button">
          {status === 'joining' ? 'Entrando no áudio…' : '🔈 Entrar no áudio'}
        </button>
      )}
      {message ? <span role="alert">{message}</span> : null}
    </div>
  );
}
