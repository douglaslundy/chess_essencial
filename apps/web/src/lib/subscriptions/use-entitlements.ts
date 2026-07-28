'use client';

import { useEffect, useState } from 'react';

import type { PlanFeatureKey } from '@xadrez/contracts';

import { api } from '@/lib/api/client';

/**
 * Reads the current user's plan features once and exposes a synchronous
 * `hasFeature` check for hiding/disabling UI the backend would reject
 * anyway. Defaults to `true` (don't hide) until the plan has actually
 * loaded, so logged-out/loading states never flash a false "no access".
 * The server remains the real gate (`checkEntitlement`) — this only
 * avoids showing controls that would fail after the click.
 *
 * Site admins bypass every plan limit on the backend (checkEntitlement),
 * so `hasFeature` mirrors that here too — otherwise an admin would still
 * see gated UI hidden/disabled even though the click would actually
 * succeed. There's no `roles` field on GET /me, so admin status is
 * probed the same way app-chrome.tsx already does: call an admin-only
 * endpoint and see if it succeeds.
 */
export function useEntitlements() {
  const [grantedFeatures, setGrantedFeatures] = useState<Set<PlanFeatureKey> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    let active = true;
    api
      .getMySubscription(token)
      .then((subscription) => {
        if (!active) return;
        const keys = (subscription.plan?.limits ?? []).map((limit) => limit.featureKey);
        setGrantedFeatures(new Set(keys));
      })
      .catch(() => {
        if (active) setGrantedFeatures(null);
      });
    api
      .adminListUsers(new URLSearchParams({ limit: '1' }), token)
      .then(() => {
        if (active) setIsAdmin(true);
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function hasFeature(featureKey: PlanFeatureKey) {
    if (isAdmin) return true;
    if (!grantedFeatures) return true;
    return grantedFeatures.has(featureKey);
  }

  return { hasFeature, isAdmin, loaded: grantedFeatures !== null };
}
