import { useState } from 'react';
import {
  Shield,
  Users,
  DollarSign,
  Activity,
  FileText,
  BarChart3,
} from 'lucide-react';
import SectionMarker from '@/components/SectionMarker';
import { UsersTab } from '@/components/admin/UsersTab';
import { PricingTab } from '@/components/admin/PricingTab';
import { HealthTab } from '@/components/admin/HealthTab';
import { AuditTab } from '@/components/admin/AuditTab';
import { FeaturesTab } from '@/components/admin/FeaturesTab';

type Tab = 'users' | 'pricing' | 'health' | 'audit' | 'features';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('users');

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'pricing', label: 'Pricing Settings', icon: DollarSign },
    { id: 'health', label: 'System Health', icon: Activity },
    { id: 'audit', label: 'Audit Log', icon: FileText },
    { id: 'features', label: 'Feature Toggles', icon: BarChart3 },
  ];

  return (
    <div>
      <div className="mb-6">
        <SectionMarker index="01" label="Administration" />
        <div className="mt-4 flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary-600" />
          <h1 className="font-display text-3xl text-neutral-900">Admin Dashboard</h1>
        </div>
        <p className="mt-1 text-sm text-neutral-500">Manage users, pricing, and system health</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-neutral-100 bg-surface p-1 shadow-card">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                tab === t.id
                  ? 'bg-primary-600 text-white shadow-soft'
                  : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'pricing' && <PricingTab />}
      {tab === 'health' && <HealthTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'features' && <FeaturesTab />}
    </div>
  );
}
