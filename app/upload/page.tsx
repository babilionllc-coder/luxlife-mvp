'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
} from 'firebase/storage';
import { AuthForm } from '@/components/AuthForm';
import {
  firebaseAuth,
  firestore,
  firebaseStorage,
} from '@/lib/firebase/client';

type UploadStatus =
  | { state: 'idle' }
  | { state: 'uploading' }
  | { state: 'success'; orderId: string }
  | { state: 'error'; message: string };

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

const SCENES = [
  { id: 'rooftop-sunset', label: 'Rooftop Sunset' },
  { id: 'supercar-night', label: 'Supercar Night Run' },
  { id: 'tropical-infinity', label: 'Tropical Infinity Pool' },
];

export default function UploadPage() {
  const [user, setUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sceneId, setSceneId] = useState<string>(SCENES[0]?.id ?? '');
  const [tagline, setTagline] = useState('');
  const [status, setStatus] = useState<UploadStatus>({ state: 'idle' });
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, setUser);
    return unsubscribe;
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const candidate = event.target.files?.[0] ?? null;
    if (!candidate) {
      setFile(null);
      setValidationMessage(null);
      return;
    }

    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      setFile(null);
      setValidationMessage('Please choose a JPG or PNG portrait.');
      return;
    }

    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setValidationMessage('File must be smaller than 10 MB.');
      return;
    }

    setValidationMessage(null);
    setFile(candidate);
  }, []);

  const selectedSceneLabel = useMemo(
    () => SCENES.find((scene) => scene.id === sceneId)?.label ?? 'Custom Scene',
    [sceneId],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!user) {
        setStatus({ state: 'error', message: 'Please sign in before uploading.' });
        return;
      }

      if (!file) {
        setStatus({ state: 'error', message: 'Choose a portrait image to continue.' });
        return;
      }

      setStatus({ state: 'uploading' });

      try {
        const orderId = crypto.randomUUID();
        const orderRef = doc(firestore, 'orders', orderId);

        const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const storagePath = `uploads/${user.uid}/${orderId}/source.${extension}`;
        const storageRef = ref(firebaseStorage, storagePath);

        await uploadBytes(storageRef, file, {
          contentType: file.type,
        });

        await setDoc(orderRef, {
          uid: user.uid,
          email: user.email ?? null,
          status: 'pending',
          scene: selectedSceneLabel,
          sceneId,
          tagline: tagline.trim() || null,
          sourcePath: storagePath,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setStatus({ state: 'success', orderId });
        setFile(null);
        setTagline('');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected upload error. Please retry.';
        setStatus({ state: 'error', message });
      }
    },
    [file, sceneId, selectedSceneLabel, tagline, user],
  );

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16">
        <div className="w-full max-w-lg space-y-8 rounded-3xl bg-white p-10 shadow-xl">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-semibold text-zinc-900">Sign in to start your LuxLife video</h1>
            <p className="text-sm text-zinc-600">
              Upload requires an account so we can reserve your credits and deliver the finished clip.
            </p>
          </div>
          <AuthForm />
          <p className="text-center text-sm text-zinc-500">
            Need inspiration?{' '}
            <Link href="/" className="text-zinc-900 underline">
              Return to the home page.
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-50 via-white to-zinc-100 px-6 py-14">
      <div className="mx-auto w-full max-w-4xl space-y-12">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Upload &amp; Scene Selection
          </p>
          <h1 className="text-4xl font-semibold text-zinc-900">
            Drop your portrait and claim your LuxLife moment.
          </h1>
          <p className="text-base leading-7 text-zinc-600">
            Select a preset scene, add an optional tagline, and upload a clear front-facing photo.
            Our studio will handle the rest and deliver a cinematic 9:16 clip back to you.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-10 rounded-3xl border border-zinc-200 bg-white p-10 shadow-xl"
        >
          <section className="space-y-3">
            <label className="block text-sm font-semibold text-zinc-800" htmlFor="scene">
              Scene
            </label>
            <select
              id="scene"
              value={sceneId}
              onChange={(event) => setSceneId(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              {SCENES.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.label}
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-zinc-800" htmlFor="tagline">
              Optional tagline
            </label>
            <textarea
              id="tagline"
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              rows={3}
              maxLength={120}
              placeholder="Example: Living my best life between boardrooms and sunsets."
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
            <p className="text-xs text-zinc-500">
              We’ll use this to personalize the voiceover script (120 characters max).
            </p>
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-zinc-800" htmlFor="portrait">
              Portrait upload (JPG or PNG, max 10&nbsp;MB)
            </label>
            <input
              id="portrait"
              name="portrait"
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={handleFileChange}
              className="w-full cursor-pointer rounded-xl border border-dashed border-zinc-400 px-4 py-10 text-sm text-zinc-600 transition hover:border-zinc-600"
            />
            {file && (
              <p className="text-sm text-emerald-600">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}&nbsp;MB)
              </p>
            )}
            {validationMessage && (
              <p className="text-sm text-red-600">{validationMessage}</p>
            )}
          </section>

          <button
            type="submit"
            disabled={status.state === 'uploading'}
            className="w-full rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {status.state === 'uploading' ? 'Uploading assets…' : 'Submit order'}
          </button>

          {status.state === 'success' && (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Upload received! Order <span className="font-mono">{status.orderId}</span> is queued.
              We’ll email you as soon as the video is ready.
            </div>
          )}
          {status.state === 'error' && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {status.message}
            </div>
          )}
        </form>

        <footer className="flex flex-wrap items-center justify-between gap-4 text-sm text-zinc-500">
          <p>
            Questions? Email{' '}
            <a className="text-zinc-900 underline" href="mailto:support@luxlife.ai">
              support@luxlife.ai
            </a>
          </p>
          <Link href="/" className="text-zinc-900 underline">
            Back to home →
          </Link>
        </footer>
      </div>
    </main>
  );
}

