'use client';

import type { Post } from '@xadrez/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { api } from '@/lib/api/client';

// Resize an image file to a JPEG (max `size` px on the longer side) and
// return base64 without the data: prefix, keeping the upload well under the
// server limit.
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

function formatPostDate(createdAt: string) {
  return new Date(createdAt).toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [body, setBody] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('Carregando feed…');
  const [busy, setBusy] = useState(false);

  function token() {
    return window.localStorage.getItem('xadrez.access_token');
  }

  const load = useCallback(async () => {
    const accessToken = token();
    if (!accessToken) {
      setMessage('Entre na sua conta para ver o feed.');
      return;
    }
    try {
      setPosts(await api.listFeed(accessToken));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar o feed.');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  function onPhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPhotoPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = token();
    if (!accessToken) return;
    const trimmedBody = body.trim();
    if (!trimmedBody && !photoFile) return;
    setBusy(true);
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        const dataBase64 = await resizeToJpegBase64(photoFile, 1024);
        const uploaded = await api.uploadPostPhoto(
          { contentType: 'image/jpeg', dataBase64 },
          accessToken,
        );
        photoUrl = uploaded.photoUrl;
      }
      await api.createPost({ body: trimmedBody || undefined, photoUrl }, accessToken);
      setBody('');
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível publicar.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike(post: Post) {
    const accessToken = token();
    if (!accessToken) return;
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
              ...item,
              likeCount: item.likeCount + (item.likedByMe ? -1 : 1),
              likedByMe: !item.likedByMe,
            }
          : item,
      ),
    );
    try {
      if (post.likedByMe) await api.unlikePost(post.id, accessToken);
      else await api.likePost(post.id, accessToken);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível curtir.');
      await load();
    }
  }

  async function removePost(postId: string) {
    const accessToken = token();
    if (!accessToken) return;
    setBusy(true);
    try {
      await api.deletePost(postId, accessToken);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível apagar o post.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Feed</h1>
        <p>Veja o que seus amigos estão jogando e compartilhe suas próprias novidades.</p>
      </header>

      <form className="postComposer" onSubmit={submitPost}>
        <textarea
          disabled={busy}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Compartilhe algo com seus amigos…"
          value={body}
        />
        {photoPreviewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-selected local blob preview
          <img alt="Pré-visualização da foto" className="postPhotoPreview" src={photoPreviewUrl} />
        ) : null}
        <div className="postComposerActions">
          <input accept="image/*" disabled={busy} onChange={onPhotoChange} type="file" />
          <button disabled={busy || (!body.trim() && !photoFile)} type="submit">
            Publicar
          </button>
        </div>
      </form>

      <p role="status">{message}</p>

      <section aria-label="Publicações" className="postList">
        {posts.map((post) => (
          <article className="postCard" key={post.id}>
            <div className="postCardHeader">
              <div className="postCardAuthor">
                <Avatar avatarUrl={post.authorAvatarUrl} name={post.authorDisplayName} />
                <strong>{post.authorDisplayName}</strong>
              </div>
              <time dateTime={post.createdAt}>{formatPostDate(post.createdAt)}</time>
            </div>
            {post.body ? <p className="postBody">{post.body}</p> : null}
            {post.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote MinIO-hosted photo
              <img alt="" className="postPhotoPreview" src={post.photoUrl} />
            ) : null}
            <div className="postActions">
              <button
                aria-pressed={post.likedByMe}
                className="likeButton"
                onClick={() => void toggleLike(post)}
                type="button"
              >
                {post.likedByMe ? '♥' : '♡'} {post.likeCount}
              </button>
              {post.mine ? (
                <button
                  className="dangerAction"
                  disabled={busy}
                  onClick={() => void removePost(post.id)}
                  type="button"
                >
                  Apagar
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
