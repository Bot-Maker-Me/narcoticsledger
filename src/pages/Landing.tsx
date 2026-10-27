import { Link } from 'react-router-dom';
import { Pill, Shield, ArrowRight, Scale, CheckCircle2, TrendingUp, Clock } from 'lucide-react';
import SectionMarker from '@/components/SectionMarker';
import Stamp from '@/components/Stamp';

const mockRows = [
  { code: '245', name: 'DIAZEPAM 5MG', din: 'DIN: 00456456', variance: '+2', tone: 'text-success-700' },
  { code: '892', name: 'OXYCODONE 10MG', din: 'DIN: 00892134', variance: '0', tone: 'text-ink-900/50' },
  { code: '156', name: 'MORPHINE 30MG', din: 'DIN: 00321567', variance: '-1', tone: 'text-warning-700' },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 shadow-glow">
                <Pill className="h-5 w-5 text-white" />
              </div>
              <span className="font-display text-lg text-neutral-900">Narcotics Ledger</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900"
              >
                Log in
              </Link>
              <Link to="/signup" className="btn-primary inline-flex items-center gap-2">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-primary-500">
                Narcotics Ledger
              </p>
              <SectionMarker index="01" label="Compliance" className="mt-6" />
              <h1 className="mt-6 font-display text-4xl leading-[1.06] text-neutral-900 sm:text-5xl lg:text-6xl">
                Modern pharmacy
                <br />
                <span className="uppercase text-primary-500">Reconciliation</span>
                <br />
                made simple.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-500">
                Streamline your narcotic tracking, inventory management, and reconciliation with an
                intuitive platform built for Canadian pharmacies.
              </p>
              <div className="mt-7 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-neutral-600">
                <Shield className="h-3.5 w-3.5 text-primary-500" />
                Compliant with Canadian Pharmacy Regulations
              </div>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  to="/signup"
                  className="btn-primary inline-flex items-center justify-center gap-2 px-8 py-3 text-base"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="relative">
              {/* Cream product card, styled after the Employee Portal register card */}
              <div className="card-cream relative -rotate-1 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/[0.12]">
                      <Scale className="h-5 w-5 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-900/[0.45]">
                        Reconciliation · Live
                      </p>
                      <h3 className="mt-0.5 font-display text-lg text-ink-900">
                        Cycle #245 · December 2024
                      </h3>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success-300/50 bg-success-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-success-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Complete
                  </span>
                </div>

                <div className="mt-6 space-y-3">
                  {mockRows.map((row) => (
                    <div
                      key={row.code}
                      className="flex items-center justify-between border-b border-ink-900/[0.08] pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-ink-900/[0.06] text-[11px] font-semibold text-ink-900/60">
                          {row.code}
                        </div>
                        <div>
                          <p className="font-display text-sm text-ink-900">{row.name}</p>
                          <p className="text-[11px] text-ink-900/[0.45]">{row.din}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${row.tone}`}>{row.variance}</p>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-900/[0.35]">
                          Variance
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-ink-900/5 p-3 text-center">
                    <p className="font-display text-lg text-ink-900">245</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink-900/[0.45]">Drugs</p>
                  </div>
                  <div className="rounded-lg bg-success-500/[0.12] p-3 text-center">
                    <p className="font-display text-lg text-success-700">98%</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink-900/[0.45]">Match</p>
                  </div>
                  <div className="rounded-lg bg-warning-500/[0.14] p-3 text-center">
                    <p className="font-display text-lg text-warning-700">3</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink-900/[0.45]">Flags</p>
                  </div>
                </div>

                {/* Dark pill inside the cream card, echoing the Employee Portal register card */}
                <div className="mt-5 flex items-center gap-2 rounded-full bg-ink-950/[0.85] px-4 py-2">
                  <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary-500" />
                  <p className="text-[11px] text-cream-50/75">
                    Auto-synced from McKesson · 2 min ago
                  </p>
                </div>
              </div>

              <Stamp
                ring="SECURE · AUDIT ·"
                center="Verified"
                className="absolute -top-6 right-2 rotate-[8deg]"
              />

              {/* Floating product cards */}
              <div className="card absolute -bottom-5 -left-5 flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500/[0.12]">
                  <TrendingUp className="h-5 w-5 text-primary-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-800">Time Saved</p>
                  <p className="text-xs text-neutral-500">4.5 hours this month</p>
                </div>
              </div>

              <div className="card absolute -right-5 top-1/3 hidden items-center gap-3 p-4 sm:flex">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-500/[0.15]">
                  <CheckCircle2 className="h-5 w-5 text-success-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-800">Report Generated</p>
                  <p className="text-xs text-neutral-500">Ready for inspection</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-20 pt-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="card relative overflow-hidden px-8 py-14 text-center">
            <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-primary-500/10 blur-3xl" />
            <SectionMarker index="02" label="Get Started" className="justify-center" />
            <h2 className="mt-6 font-display text-3xl text-neutral-900 sm:text-4xl">
              Ready to modernize your <span className="text-primary-500">pharmacy</span>?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-neutral-500">
              Join hundreds of Canadian pharmacies using Narcotics Ledger to streamline compliance and
              improve efficiency.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                to="/signup"
                className="btn-primary inline-flex items-center justify-center gap-2 px-8 py-3 text-base"
              >
                Start Your Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
                <Pill className="h-4 w-4 text-white" />
              </div>
              <span className="font-display text-lg text-neutral-900">Narcotics Ledger</span>
            </div>
            <p className="text-center text-[11px] uppercase tracking-[0.2em] text-neutral-400 md:text-right">
              © 2026 · Encrypted · Role-based access · Every action logged
            </p>
          </div>
          <div className="mt-6 flex flex-col items-center gap-2 border-t border-white/5 pt-6 text-center md:flex-row md:justify-between md:text-left">
            <p className="flex items-center gap-2 text-xs text-neutral-400">
              <Clock className="h-3.5 w-3.5" />
              Built for Canadian pharmacies.
            </p>
            <Link
              to="/terms"
              className="text-xs text-neutral-400 transition-colors hover:text-neutral-700"
            >
              Terms &amp; Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
