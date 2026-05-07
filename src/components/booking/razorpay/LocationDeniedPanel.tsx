'use client';

export function LocationDeniedPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50 overflow-hidden">
      <div className="bg-red-500 px-5 py-3 flex items-center gap-2">
        <span className="text-white text-xl">📍</span>
        <span className="text-white font-bold text-base">Location Access Required</span>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-700 leading-relaxed">
          Zodito requires your location to complete a booking. It is used to
          verify your pickup point and ensure your safety during the rental.
        </p>
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <p className="text-xs font-bold text-gray-800 mb-2.5">How to enable location access:</p>
          <ol className="text-xs text-gray-600 space-y-2">
            <li className="flex items-start gap-2">
              <span className="bg-red-100 text-red-600 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">1</span>
              Tap the <strong>🔒 lock icon</strong> next to the URL in your browser
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-red-100 text-red-600 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">2</span>
              Find <strong>Location</strong> → set to <strong>Allow</strong>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-red-100 text-red-600 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">3</span>
              Come back here and tap <strong>Try Again</strong>
            </li>
          </ol>
          <p className="text-[11px] text-gray-500 mt-3 pt-3 border-t border-red-100 italic">
            On iPhone: go to <strong>Settings → Safari → Location</strong> and set to Allow
          </p>
        </div>
        <button
          onClick={onRetry}
          className="w-full py-3 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors"
        >
          I&apos;ve Enabled Location — Try Again
        </button>
      </div>
    </div>
  );
}
