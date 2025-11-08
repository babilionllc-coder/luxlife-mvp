'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebaseAuth, firestore } from '@/lib/firebase/client';

type FormMode = 'signin' | 'signup';

type StatusState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'success'; message: string };

const initialStatus: StatusState = { type: 'idle' };

export function AuthForm() {
  const [mode, setMode] = useState<FormMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<StatusState>(initialStatus);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, setUser);
    return unsubscribe;
  }, []);

  const isDisabled = useMemo(
    () => status.type === 'loading' || !email || password.length < 6,
    [email, password.length, status.type],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ type: 'loading' });

    try {
      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(
          firebaseAuth,
          email,
          password,
        );

        await setDoc(
          doc(firestore, 'users', credential.user.uid),
          {
            email: credential.user.email ?? '',
            credits: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        setStatus({ type: 'success', message: 'Account created. Welcome to LuxLife!' });
      } else {
        const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
        await setDoc(
          doc(firestore, 'users', credential.user.uid),
          {
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        setStatus({ type: 'success', message: 'Signed in successfully.' });
      }

      setEmail('');
      setPassword('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected error. Please try again.';
      setStatus({ type: 'error', message });
    }
  };

  const handleSignOut = async () => {
    setStatus({ type: 'loading' });
    try {
      await signOut(firebaseAuth);
      setStatus({ type: 'success', message: 'Signed out.' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to sign out. Try again.';
      setStatus({ type: 'error', message });
    }
  };

  if (user) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg">
        <h2 className="text-2xl font-semibold text-zinc-900">Welcome back!</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Signed in as <span className="font-medium">{user.email ?? 'LuxLife creator'}</span>
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 w-full rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700"
        >
          Sign out
        </button>
        {status.type === 'error' && (
          <p className="mt-4 text-sm text-red-600">{status.message}</p>
        )}
        {status.type === 'success' && (
          <p className="mt-4 text-sm text-emerald-600">{status.message}</p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg"
    >
      <div className="flex justify-between">
        <button
          type="button"
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            mode === 'signin'
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          }`}
          onClick={() => {
            setMode('signin');
            setStatus(initialStatus);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            mode === 'signup'
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          }`}
          onClick={() => {
            setMode('signup');
            setStatus(initialStatus);
          }}
        >
          Create account
        </button>
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="you@luxlife.com"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Minimum 6 characters"
          required
        />
      </div>

      <button
        type="submit"
        disabled={isDisabled}
        className="w-full rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>

      {status.type === 'error' && (
        <p className="text-sm text-red-600">{status.message}</p>
      )}
      {status.type === 'success' && (
        <p className="text-sm text-emerald-600">{status.message}</p>
      )}
    </form>
  );
}

