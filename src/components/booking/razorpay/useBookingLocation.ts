'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type LocStatus = 'pending' | 'granted' | 'denied' | 'timeout';

export function useBookingLocation() {
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>('pending');

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocStatus('timeout');
      return;
    }
    setLocStatus('pending');
    navigator.geolocation.getCurrentPosition(
      pos => {
        locationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocStatus('granted');
      },
      err => {
        setLocStatus(err.code === 1 ? 'denied' : 'timeout');
      },
      { timeout: 10000, maximumAge: 300000, enableHighAccuracy: false }
    );
  }, []);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  return { locationRef, locStatus, requestLocation };
}
