import { Link } from 'react-router-dom';
import { Pill, Shield, ArrowRight, Scale, FileText, CheckCircle2, TrendingUp, Clock } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      {/* Navigation */}
      <nav className="border-b border-neutral-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
                <Pill className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-neutral-900">Narcotics Ledger</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="btn-primary inline-flex items-center gap-2"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700 mb-6">
                <Shield className="h-4 w-4" />
                Compliant with Canadian Pharmacy Regulations
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 leading-tight mb-6">
                Modern Pharmacy
                <span className="text-primary-600"> Reconciliation</span>
                Made Simple
              </h1>
              <p className="text-lg text-neutral-600 mb-8 max-w-xl">
                Streamline your narcotic tracking, inventory management, and reconciliation with an intuitive platform built for Canadian pharmacies.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
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
              <div className="relative bg-white rounded-2xl shadow-2xl p-6 border border-neutral-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                      <Scale className="h-5 w-5 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900">Reconciliation Dashboard</h3>
                      <p className="text-xs text-neutral-500">Cycle #245 · December 2024</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Complete
                    </span>
                  </div>
                </div>

                {/* Mock reconciliation table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-primary-100 flex items-center justify-center text-xs font-semibold text-primary-700">245</div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900">DIAZEPAM 5MG</p>
                        <p className="text-xs text-neutral-500">DIN: 00456456</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-success-600">+2</p>
                      <p className="text-xs text-neutral-400">Variance</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-primary-100 flex items-center justify-center text-xs font-semibold text-primary-700">892</div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900">OXYCODONE 10MG</p>
                        <p className="text-xs text-neutral-500">DIN: 00892134</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-neutral-600">0</p>
                      <p className="text-xs text-neutral-400">Variance</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-primary-100 flex items-center justify-center text-xs font-semibold text-primary-700">156</div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900">MORPHINE 30MG</p>
                        <p className="text-xs text-neutral-500">DIN: 00321567</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-warning-600">-1</p>
                      <p className="text-xs text-neutral-400">Variance</p>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-primary-50 p-3 text-center">
                    <p className="text-lg font-bold text-primary-600">245</p>
                    <p className="text-xs text-neutral-600">Drugs</p>
                  </div>
                  <div className="rounded-lg bg-success-50 p-3 text-center">
                    <p className="text-lg font-bold text-success-600">98%</p>
                    <p className="text-xs text-neutral-600">Match</p>
                  </div>
                  <div className="rounded-lg bg-warning-50 p-3 text-center">
                    <p className="text-lg font-bold text-warning-600">3</p>
                    <p className="text-xs text-neutral-600">Flags</p>
                  </div>
                </div>

                {/* Activity indicator */}
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                  <div className="h-2 w-2 rounded-full bg-success-500 animate-pulse" />
                  <p className="text-xs text-neutral-600">Auto-synced from McKesson · 2 min ago</p>
                </div>
              </div>

              {/* Floating elements */}
              <div className="absolute -top-4 -right-4 bg-white rounded-xl shadow-lg p-4 border border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-100">
                    <CheckCircle2 className="h-5 w-5 text-success-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Report Generated</p>
                    <p className="text-xs text-neutral-500">Ready for inspection</p>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-lg p-4 border border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                    <TrendingUp className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Time Saved</p>
                    <p className="text-xs text-neutral-500">4.5 hours this month</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary-600">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Modernize Your Pharmacy?
          </h2>
          <p className="text-lg text-primary-100 mb-8 max-w-2xl mx-auto">
            Join hundreds of Canadian pharmacies using Narcotics Ledger to streamline compliance and improve efficiency.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center justify-center gap-2 bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-primary-50 transition-colors"
          >
            Start Your Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-900 text-neutral-400 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2.5 mb-4 md:mb-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
                <Pill className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold text-white">Narcotics Ledger</span>
            </div>
            <p className="text-sm">
              © 2026 Narcotics Ledger. Built for Canadian pharmacies.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}