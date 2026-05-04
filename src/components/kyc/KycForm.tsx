'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type FileState   = { file: File | null; previewUrl: string | null };
type SubmitStep  = 'idle' | 'compressing' | 'uploading';

const STEP_LABEL: Record<SubmitStep, string> = {
  idle:        '',
  compressing: 'Preparing photos…',
  uploading:   'Submitting…',
};

// Resize + re-encode any image (HEIC, PNG, WEBP, …) to a compact JPEG
// using Canvas. On iOS Safari, HEIC blobs decode onto Canvas natively.
// Falls back to original file only if the browser has no Canvas support.
async function compressImage(file: File, maxDim = 1400, quality = 0.82): Promise<File> {
  if (typeof document === 'undefined') return file; // SSR guard
  return new Promise(resolve => {
    const img = new Image();
    const src = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(src);
      try {
        const longest = Math.max(img.naturalWidth, img.naturalHeight, 1);
        const scale   = Math.min(maxDim / longest, 1);
        const w = Math.max(1, Math.round(img.naturalWidth  * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas  = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          blob => resolve(blob
            ? new File([blob], 'photo.jpg', { type: 'image/jpeg' })
            : file
          ),
          'image/jpeg',
          quality,
        );
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => { URL.revokeObjectURL(src); resolve(file); };
    img.src = src;
  });
}

export function KycForm({ currentStatus }: { currentStatus: string }) {
  const router = useRouter();
  const [dlNumber, setDlNumber] = useState('');
  const [dl,       setDl]       = useState<FileState>({ file: null, previewUrl: null });
  const [aadhaar,  setAadhaar]  = useState<FileState>({ file: null, previewUrl: null });
  const [selfie,   setSelfie]   = useState<FileState>({ file: null, previewUrl: null });
  const [step,     setStep]     = useState<SubmitStep>('idle');
  const [error,    setError]    = useState<string | null>(null);

  const submitting = step !== 'idle';
  const canSubmit  = dlNumber.trim().length >= 10 && !!dl.file && !!aadhaar.file && !!selfie.file && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);

    try {
      // ── 1. Compress all three images client-side ──────────────────────────
      // Canvas re-encodes to JPEG (~300 KB each) so the API payload stays
      // well under 1 MB total — no body-limit issues, no MIME surprises.
      setStep('compressing');
      const [dlJpeg, aadhaarJpeg, selfieJpeg] = await Promise.all([
        compressImage(dl.file!),
        compressImage(aadhaar.file!),
        compressImage(selfie.file!),
      ]);

      // ── 2. POST compressed files to our API route ──────────────────────────
      // The server uploads to Supabase Storage using the service-role key,
      // which bypasses every browser/CORS/RLS constraint completely.
      setStep('uploading');
      const form = new FormData();
      form.append('dl_number', dlNumber.trim());
      form.append('dl',        dlJpeg,      'dl.jpg');
      form.append('aadhaar',   aadhaarJpeg, 'aadhaar.jpg');
      form.append('selfie',    selfieJpeg,  'selfie.jpg');

      const res  = await fetch('/api/kyc/submit', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).error || 'Submission failed');

      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong — please try again.');
      setStep('idle');
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <label className="form-label">Driving License Number</label>
        <input
          value={dlNumber}
          onChange={e => setDlNumber(e.target.value.toUpperCase())}
          placeholder="e.g. TS0120230001234"
          className="input-field mt-2"
          maxLength={20}
        />
      </div>

      <UploadTile
        title="Driving License"
        hint="Clear photo of the front side"
        icon="🪪"
        state={dl}
        onChange={setDl}
      />
      <UploadTile
        title="Aadhaar Card"
        hint="Front side, all text readable"
        icon="🆔"
        state={aadhaar}
        onChange={setAadhaar}
      />
      <UploadTile
        title="Selfie with Driving License"
        hint="Take a live photo holding your DL — gallery not allowed"
        icon="🤳"
        state={selfie}
        onChange={setSelfie}
        cameraOnly
      />

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
          {error}
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="btn-accent w-full text-base py-3 disabled:bg-border disabled:text-muted disabled:cursor-not-allowed"
      >
        {submitting
          ? STEP_LABEL[step]
          : currentStatus === 'rejected'
            ? 'Re-submit for review'
            : 'Submit for review'}
      </button>

      <p className="text-[11px] text-muted leading-relaxed text-center">
        Your documents are encrypted and only accessible to our verification team.
      </p>
    </div>
  );
}

function UploadTile({
  title, hint, icon, state, onChange, cameraOnly = false,
}: {
  title: string;
  hint: string;
  icon: string;
  state: FileState;
  onChange: (s: FileState) => void;
  cameraOnly?: boolean;
}) {
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Allow up to 50 MB raw — we compress before sending, so raw size doesn't matter
    if (file.size > 50 * 1024 * 1024) {
      alert('File is too large (max 50 MB)');
      return;
    }
    onChange({ file, previewUrl: URL.createObjectURL(file) });
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-2xl">{icon}</div>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted">{hint}</div>
        </div>
      </div>

      {state.previewUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.previewUrl}
            alt="preview"
            className="w-full h-48 object-cover rounded-lg"
          />
          <button
            onClick={() => onChange({ file: null, previewUrl: null })}
            className="absolute top-2 right-2 bg-white/95 rounded-md px-2 py-1 text-xs font-semibold"
          >
            Retake
          </button>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          cameraOnly
            ? 'border-accent/40 bg-accent/3 hover:bg-accent/8'
            : 'border-border hover:border-accent/50 hover:bg-accent/5'
        }`}>
          {cameraOnly ? (
            <>
              <div className="text-2xl mb-1">📷</div>
              <div className="text-sm font-semibold text-accent">Open Camera</div>
              <div className="text-[11px] text-muted mt-0.5">Live photo only — no uploads</div>
            </>
          ) : (
            <>
              <div className="text-muted text-sm">Tap to upload photo</div>
              <div className="text-[11px] text-muted mt-1">Any format · auto-compressed</div>
            </>
          )}
          <input
            type="file"
            accept={cameraOnly ? 'image/jpeg,image/png' : 'image/*'}
            capture={cameraOnly ? 'user' : undefined}
            onChange={onFile}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
