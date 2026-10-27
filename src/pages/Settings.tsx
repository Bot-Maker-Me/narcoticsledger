import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { User, Mail, Bell, Shield, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import SectionMarker from '@/components/SectionMarker';

export default function Settings() {
  const { user, signOut } = useAuth();
  const [notifications, setNotifications] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [prescriptionAlerts, setPrescriptionAlerts] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  const toggles = [
    { label: 'Email notifications', desc: 'Receive general email notifications', value: notifications, setter: setNotifications },
    { label: 'Low stock alerts', desc: 'Get notified when items are running low', value: lowStockAlerts, setter: setLowStockAlerts },
    { label: 'Prescription alerts', desc: 'Get notified when new prescriptions arrive', value: prescriptionAlerts, setter: setPrescriptionAlerts },
  ];

  return (
    <div>
      <div className="mb-6">
        <SectionMarker index="01" label="Settings" />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Manage your account and preferences</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Profile */}
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Profile</h2>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Email address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="email"
                  value={user?.email ?? ''}
                  disabled
                  className="input-field cursor-not-allowed border-white/10 bg-white/5 pl-10 text-neutral-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Display name</label>
              <input
                type="text"
                placeholder="Enter your name"
                className="input-field"
              />
            </div>
            <button className="btn-primary" onClick={() => toast.success('Profile updated')}>
              Save changes
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Notifications</h2>
          </div>
          <div className="mt-4 space-y-1">
            {toggles.map((toggle) => (
              <div key={toggle.label} className="flex items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-neutral-50">
                <div>
                  <p className="text-sm font-medium text-neutral-800">{toggle.label}</p>
                  <p className="text-xs text-neutral-400">{toggle.desc}</p>
                </div>
                <button
                  onClick={() => toggle.setter(!toggle.value)}
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                    toggle.value ? 'bg-primary-600' : 'bg-neutral-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform duration-200 ${
                      toggle.value ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Security</h2>
          </div>
          <div className="mt-4">
            <button className="btn-secondary" onClick={() => toast.success('Password reset link sent to your email')}>
              Change password
            </button>
          </div>
        </div>

        {/* Sign out */}
        <div className="card border-error-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Sign out</h2>
              <p className="mt-1 text-sm text-neutral-500">Sign out of your account on this device</p>
            </div>
            <button onClick={handleSignOut} className="inline-flex items-center gap-2 rounded-lg bg-error-50 px-4 py-2.5 text-sm font-medium text-error-600 transition-colors hover:bg-error-100">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
