'use client';

export function LocationTimeoutPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
      <div className="bg-amber-400 px-5 py-3 flex items-center gap-2">
        <span className="text-white text-xl">📍</span>
        <span className="text-white font-bold text-base">Location Unavailable</span>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-700 leading-relaxed">
          We couldn&apos;t get your location. Location is <strong>required</strong> to
          complete a booking. Please ensure GPS and location services are
          enabled on your device, then try again.
        </p>
        <div className="text-xs text-gray-500 bg-white border border-amber-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-700">Quick checklist:</p>
          <p>• Enable Wi-Fi or mobile data — improves location accuracy</p>
          <p>• On Android: pull down from top → tap Location to enable</p>
          <p>• On iPhone: Settings → Privacy → Location Services → On</p>
        </div>
        <button
          onClick={onRetry}
          className="w-full py-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold rounded-xl text-sm transition-colors"
        >
          Retry Location
        </button>
      </div>
    </div>
  );
}
