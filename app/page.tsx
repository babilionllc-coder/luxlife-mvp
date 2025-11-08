import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-50 via-white to-zinc-100 px-6 py-16">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 lg:flex-row lg:items-center lg:justify-between">
        <section className="max-w-xl space-y-8">
          <span className="inline-flex items-center rounded-full bg-zinc-900 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-white">
            LuxLife MVP
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-zinc-900 sm:text-5xl">
            Create cinematic luxury lifestyle videos from a single photo.
          </h1>
          <p className="text-lg leading-8 text-zinc-600">
            Upload a portrait, pick your dream scene, and let LuxLife craft a 9:16 masterpiece
            with voice-over in minutes. Start with a free credit, then unlock premium experiences
            with your first purchase.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-700"
              href="/upload"
            >
              Get started
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900"
              href="#brief"
            >
              View product brief
            </Link>
          </div>
          <ul className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
            <li className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              10–20 second cinematic clips delivered in under 10 minutes.
            </li>
            <li className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              Premium presets: Rooftop Sunset, Supercar Night Run, Tropical Infinity Pool.
            </li>
            <li className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              AI pipeline orchestrated with Replicate, D-ID, Google TTS, and FFmpeg.
            </li>
            <li className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              Credits system with Stripe Checkout, free trial on signup.
            </li>
          </ul>
        </section>

        <section id="get-started" className="w-full max-w-md">
          <AuthForm />
        </section>
      </div>
      <section
        id="brief"
        className="mx-auto mt-16 w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white p-10 shadow-sm"
      >
        <h2 className="text-2xl font-semibold text-zinc-900">MVP Snapshot</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
              Launch Goals
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600">
              <li>Activate 60% of visitors through photo uploads.</li>
              <li>Convert 15% of activated users into paid credits within 24 hours.</li>
              <li>
                Deliver 95% of videos in under 10 minutes with {'<'}5% refunds.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
              Pipeline Highlights
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600">
              <li>Replicate for cinematic backgrounds and D-ID for portrait animation.</li>
              <li>Google Cloud TTS and Vision; FFmpeg assembly in Firebase Functions.</li>
              <li>Auto asset cleanup after 7 days with privacy-first defaults.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
