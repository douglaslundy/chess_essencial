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
 */
export function useEntitlements() {
  const [grantedFeatures, setGrantedFeatures] = useState<Set<PlanFeatureKey> | null>(null);

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
    return () => {
      active = false;
    };
  }, []);

  function hasFeature(featureKey: PlanFeatureKey) {
    if (!grantedFeatures) return true;
    return grantedFeatures.has(featureKey);
  }

  return { hasFeature, loaded: grantedFeatures !== null };
}
