'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { AuthForm } from '@/components/AuthForm';
import {
  firebaseAuth,
  firestore,
} from '@/lib/firebase/client';

interface OrderItem {
  id: string;
  status: string;
  scene?: string | null;
  sceneId?: string | null;
  tagline?: string | null;
  sourcePath?: string | null;
  videoPath?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  pipeline?: Record<string, unknown>;
  fallback?: {
    used: boolean;
    reasonCode: string | null;
    reason: string | null;
    strategy: string | null;
  };
  replicateStatus?: string | null;
}

function mapOrderSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): OrderItem {
  const data = snapshot.data();
  const toDate = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      try {
        return (value as FirebaseFirestore.Timestamp).toDate();
      } catch {
        return null;
      }
    }
    return null;
  };

  const pipeline = data.pipeline as Record<string, unknown> | undefined;
  const generation =
    pipeline && typeof pipeline === 'object'
      ? ((pipeline as Record<string, unknown>).generation as Record<string, unknown> | undefined)
      : undefined;
  const fallbackRaw =
    generation && typeof generation === 'object'
      ? (generation.fallback as Record<string, unknown> | undefined)
      : undefined;
  const replicateRaw =
    generation && typeof generation === 'object'
      ? (generation.replicate as Record<string, unknown> | undefined)
      : undefined;

  const fallback =
    fallbackRaw && typeof fallbackRaw === 'object'
      ? (() => {
          const fallbackData = fallbackRaw as Record<string, unknown>;
          return {
            used: Boolean(fallbackData.used),
            reasonCode:
              typeof fallbackData.reasonCode === 'string'
                ? (fallbackData.reasonCode as string)
                : null,
            reason:
              typeof fallbackData.reason === 'string'
                ? (fallbackData.reason as string)
                : null,
            strategy:
              typeof fallbackData.strategy === 'string'
                ? (fallbackData.strategy as string)
                : null,
          };
        })()
      : undefined;

  const replicateStatus =
    replicateRaw && typeof replicateRaw === 'object'
      ? (() => {
          const replicateData = replicateRaw as Record<string, unknown>;
          return typeof replicateData.status === 'string'
            ? (replicateData.status as string)
            : null;
        })()
      : null;

  return {
    id: snapshot.id,
    status: (data.status as string | undefined) ?? 'unknown',
    scene: data.scene as string | undefined,
    sceneId: data.sceneId as string | undefined,
    tagline: data.tagline as string | undefined,
    sourcePath: data.sourcePath as string | undefined,
    videoPath: data.videoPath as string | undefined,
    errorCode: data.errorCode as string | undefined,
    errorMessage: data.errorMessage as string | undefined,
    pipeline,
    fallback,
    replicateStatus,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleString();
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(firebaseAuth.currentUser);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(() => !!firebaseAuth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setOrders([]);
        setLoading(false);
      } else {
        setLoading(true);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    const ordersRef = collection(firestore, 'orders');
    const ordersQuery = query(
      ordersRef,
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(snapshot.docs.map(mapOrderSnapshot));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to stream orders', error);
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [user]);

  const hasOrders = orders.length > 0;

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16">
        <div className="w-full max-w-lg space-y-8 rounded-3xl bg-white p-10 shadow-xl">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-semibold text-zinc-900">Sign in to view your LuxLife orders</h1>
            <p className="text-sm text-zinc-600">
              Track generation progress, download completed clips, and manage your upcoming scenes.
            </p>
          </div>
          <AuthForm />
          <p className="text-center text-sm text-zinc-500">
            Need to start a new order?{' '}
            <Link href="/upload" className="text-zinc-900 underline">
              Upload a portrait.
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-50 via-white to-zinc-100 px-6 py-14">
      <div className="mx-auto w-full max-w-5xl space-y-10">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Order Dashboard
          </p>
          <h1 className="text-4xl font-semibold text-zinc-900">
            Welcome back, {user.displayName ?? user.email ?? 'LuxLife Creator'}.
          </h1>
          <p className="text-base leading-7 text-zinc-600">
            Keep tabs on your cinematic clips. Each order shows the current pipeline status, scene details,
            and download link when ready.
          </p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-6 shadow-md">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Ready for a new video?</h2>
            <p className="text-sm text-zinc-600">
              Upload a new portrait and choose your next luxury scene in minutes.
            </p>
          </div>
          <Link
            href="/upload"
            className="rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Create new order
          </Link>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow">
            <p className="text-sm text-zinc-600">Loading your orders…</p>
          </div>
        ) : hasOrders ? (
          <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-600">
                    Order
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-600">
                    Scene
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-600">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-600">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-600">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                      <span className="font-mono text-xs text-zinc-500">{order.id}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-700">
                      <div className="flex flex-col">
                        <span>{order.scene ?? '—'}</span>
                        {order.tagline && (
                          <span className="text-xs text-zinc-500">“{order.tagline}”</span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <StatusBadge status={order.status} />
                      {order.errorCode && (
                        <p className="mt-1 text-xs text-red-600">
                          {order.errorCode}: {order.errorMessage ?? 'See logs for details.'}
                        </p>
                      )}
                      {!order.errorCode && order.replicateStatus === 'failed' && (
                        <p className="mt-1 text-xs text-amber-600">
                          Background generator unavailable. Delivered fallback animation.
                        </p>
                      )}
                      {order.fallback?.used && (
                        <p className="mt-1 text-xs text-amber-600">
                          Fallback: {order.fallback.reason ?? 'Delivered animation without background.'}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                      {formatDate(order.updatedAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <OrderActions order={order} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-12 text-center shadow">
            <h2 className="text-xl font-semibold text-zinc-900">No orders yet—let’s change that.</h2>
            <p className="mt-3 text-sm text-zinc-600">
              Upload your first portrait and choose a scene to generate your LuxLife moment.
            </p>
            <Link
              href="/upload"
              className="mt-6 inline-flex rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Start your first order
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { label, className } = useMemo(() => {
    switch (status) {
      case 'queued_validation':
        return { label: 'Queued for validation', className: 'bg-amber-100 text-amber-700' };
      case 'queued_generation':
        return { label: 'Queued for generation', className: 'bg-amber-100 text-amber-700' };
      case 'generating_background':
        return { label: 'Generating background', className: 'bg-blue-100 text-blue-700' };
      case 'processing':
        return { label: 'Processing', className: 'bg-blue-100 text-blue-700' };
      case 'complete':
        return { label: 'Complete', className: 'bg-emerald-100 text-emerald-700' };
      case 'failed':
        return { label: 'Failed', className: 'bg-red-100 text-red-700' };
      default:
        return { label: status ?? 'Unknown', className: 'bg-zinc-100 text-zinc-600' };
    }
  }, [status]);

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function OrderActions({ order }: { order: OrderItem }) {
  const disabled = !order.videoPath;
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/upload"
        className="rounded-full border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900"
      >
        Reorder scene
      </Link>
      <a
        href={order.videoPath ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={disabled}
        className={`rounded-full px-3 py-2 text-xs font-medium transition ${
          disabled
            ? 'cursor-not-allowed border border-zinc-200 bg-zinc-200 text-zinc-400'
            : 'border border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white'
        }`}
      >
        Download
      </a>
    </div>
  );
}

