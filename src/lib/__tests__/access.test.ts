import { describe, it, expect } from 'vitest';
import { hasAccess } from '../access';
import type { Profile } from '@/types/admin';

const baseProfile: Profile = {
  id: 'user-1',
  email: 'rx@example.com',
  role: 'user',
  stripe_customer_id: null,
  subscription_status: 'trialing',
  trial_ends_at: null,
  pharmacy_name: 'Main Street Pharmacy',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const profile = (patch: Partial<Profile>): Profile => ({ ...baseProfile, ...patch });

const days = (offset: number) =>
  new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString();

describe('hasAccess', () => {
  it('denies a signed-out visitor', () => {
    expect(hasAccess(null)).toBe(false);
  });

  it('always allows an admin, whatever the subscription says', () => {
    expect(hasAccess(profile({ role: 'admin', subscription_status: 'revoked' }))).toBe(true);
    expect(hasAccess(profile({ role: 'admin', subscription_status: 'cancelled' }))).toBe(true);
  });

  it('allows an active subscription', () => {
    expect(hasAccess(profile({ subscription_status: 'active' }))).toBe(true);
  });

  it('allows a trial that has not ended', () => {
    expect(hasAccess(profile({ subscription_status: 'trialing', trial_ends_at: null }))).toBe(true);
    expect(
      hasAccess(profile({ subscription_status: 'trialing', trial_ends_at: days(1) }))
    ).toBe(true);
  });

  it('denies a trial that has ended', () => {
    expect(
      hasAccess(profile({ subscription_status: 'trialing', trial_ends_at: days(-1) }))
    ).toBe(false);
  });

  it('denies every lapsed status', () => {
    expect(hasAccess(profile({ subscription_status: 'cancelled' }))).toBe(false);
    expect(hasAccess(profile({ subscription_status: 'past_due' }))).toBe(false);
    expect(hasAccess(profile({ subscription_status: 'revoked' }))).toBe(false);
    expect(hasAccess(profile({ subscription_status: 'none' }))).toBe(false);
  });
});
