'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type FileState  = { file: File | null; previewUrl: string | null };
type SubmitStep = 'idle' | 'compressing' | 'uploading';

const BLANK: FileState = { file: null, previewUrl: null };

const STEP_LABEL: Record<SubmitStep, string> = {
  idle:        '',
  compressing: 'Preparing photos…',
  uploading:   'Submitting…',
};

async function compressImage(file: File, maxDim = 1400, quality = 0.82): Promise<File> {
  if (typeof document === 'undefined') return file;
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
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          blob => resolve(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file),
          'image/jpeg', quality,
        );
      } catch { resolve(file); }
    };
    img.onerror = () => { URL.revokeObjectURL(src); resolve(file); };
    img.src = src;
  });
}

export function KycForm({ currentStatus }: { currentStatus: string }) {
  const router = useRouter();
  const [dlNumber,      setDlNumber]      = useState('');
  const [dlFront,       setDlFront]       = useState<FileState>(BLANK);
  const [dlBack,        setDlBack]        = useState<FileState>(BLANK);
  const [aadhaarFront,  setAadhaarFront]  = useState<FileState>(BLANK);
  const [aadhaarBack,   setAadhaarBack]   = useState<FileState>(BLANK);
  const [selfie,        setSelfie]        = useState<FileState>(BLANK);
  const [step,          setStep]          = useState<SubmitStep>('idle');
  const [error,         setError]         = useState<string | null>(null);
  const [submitted,     setSubmitted]     = useState(false);

  const submitting = step !== 'idle';
  const canSubmit  =
    dlNumber.trim().length >= 10 &&
    !!dlFront.file && !!dlBack.file &&
    !!aadhaarFront.file && !!aadhaarBack.file &&
    !!selfie.file && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      setStep('compressing');
      const [dlFrontJpeg, dlBackJpeg, aadhaarFrontJpeg, aadhaarBackJpeg, selfieJpeg] =
        await Promise.all([
          compressImage(dlFront.file!),
          compressImage(dlBack.file!),
          compressImage(aadhaarFront.file!),
          compressImage(aadhaarBack.file!),
          compressImage(selfie.file!),
        ]);

      setStep('uploading');
      const form = new FormData();
      form.append('dl_number',     dlNumber.trim());
      form.append('dl_front',      dlFrontJpeg,     'dl_front.jpg');
      form.append('dl_back',       dlBackJpeg,      'dl_back.jpg');
      form.append('aadhaar_front', aadhaarFrontJpeg, 'aadhaar_front.jpg');
      form.append('aadhaar_back',  aadhaarBackJpeg,  'aadhaar_back.jpg');
      form.append('selfie',        selfieJpeg,      'selfie.jpg');

      const res  = await fetch('/api/kyc/submit', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).error || 'Submission failed');

      setSubmitted(true);
      setStep('idle');
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong — please try again.');
      setStep('idle');
    }
  }

  if (submitted) {
    return (
      <div className="card p-8 flex flex-col items-center text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h3 className="font-semibold text-lg">Documents Submitted!</h3>
        <p className="text-sm text-muted max-w-xs">
          Your KYC documents are under review. We'll notify you once verified — usually within 24 hours.
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-yellow-100 text-yellow-700">
          ⏱ Status: Under Review
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* DL Number */}
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

      {/* Driving License — front + back */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🪪</div>
          <div>
            <div className="font-semibold">Driving License</div>
            <div className="text-xs text-muted">Upload or photograph both sides</div>
          </div>
        </div>
        <DocCaptureTile label="Front side" state={dlFront} onChange={setDlFront} />
        <DocCaptureTile label="Back side"  state={dlBack}  onChange={setDlBack} />
      </div>

      {/* Aadhaar — front + back */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🆔</div>
          <div>
            <div className="font-semibold">Aadhaar Card</div>
            <div className="text-xs text-muted">Upload or photograph both sides</div>
          </div>
        </div>
        <DocCaptureTile label="Front side" state={aadhaarFront} onChange={setAadhaarFront} />
        <DocCaptureTile label="Back side"  state={aadhaarBack}  onChange={setAadhaarBack} />
      </div>

      {/* Selfie — camera only */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-2xl">🤳</div>
          <div>
            <div className="font-semibold">Selfie with Driving License</div>
            <div className="text-xs text-muted">Take a live photo holding your DL — gallery not allowed</div>
          </div>
        </div>
        <SelfieCaptureTile state={selfie} onChange={setSelfie} />
      </div>

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

// ── DL / Aadhaar tile: both camera (back-facing) and gallery ──────────────────

function DocCaptureTile({
  label,
  state,
  onChange,
}: {
  label: string;
  state: FileState;
  onChange: (s: FileState) => void;
}) {
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { alert('File too large (max 50 MB)'); return; }
    onChange({ file, previewUrl: URL.createObjectURL(file) });
    // Reset input so the same file can be re-selected after retake
    e.target.value = '';
  }

  return (
    <div>
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label}</p>
      {state.previewUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.previewUrl}
            alt={label}
            className="w-full h-40 object-cover rounded-lg"
          />
          <button
            onClick={() => onChange(BLANK)}
            className="absolute top-2 right-2 bg-white/95 rounded-md px-2 py-1 text-xs font-semibold shadow"
          >
            Retake
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          {/* Camera option — opens device camera (back-facing) */}
          <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-dashed border-accent/40 bg-accent/3 rounded-lg cursor-pointer hover:bg-accent/10 transition-colors">
            <span className="text-xl mb-1">📷</span>
            <span className="text-xs font-semibold text-accent">Camera</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/*"
              capture="environment"
              onChange={onFile}
              className="hidden"
            />
          </label>

          {/* Gallery option — opens file picker */}
          <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors">
            <span className="text-xl mb-1">🖼️</span>
            <span className="text-xs font-semibold text-muted">Gallery</span>
            <input
              type="file"
              accept="image/*"
              onChange={onFile}
              className="hidden"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Selfie tile: front camera only ───────────────────────────────────────────

function SelfieCaptureTile({
  state,
  onChange,
}: {
  state: FileState;
  onChange: (s: FileState) => void;
}) {
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { alert('File too large (max 50 MB)'); return; }
    onChange({ file, previewUrl: URL.createObjectURL(file) });
    e.target.value = '';
  }

  return state.previewUrl ? (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={state.previewUrl}
        alt="selfie"
        className="w-full h-48 object-cover rounded-lg"
      />
      <button
        onClick={() => onChange(BLANK)}
        className="absolute top-2 right-2 bg-white/95 rounded-md px-2 py-1 text-xs font-semibold shadow"
      >
        Retake
      </button>
    </div>
  ) : (
    <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-accent/40 bg-accent/3 rounded-lg cursor-pointer hover:bg-accent/10 transition-colors">
      <span className="text-2xl mb-1">📷</span>
      <span className="text-sm font-semibold text-accent">Open Camera</span>
      <span className="text-[11px] text-muted mt-0.5">Live photo only — no uploads</span>
      <input
        type="file"
        accept="image/jpeg,image/png"
        capture="user"
        onChange={onFile}
        className="hidden"
      />
    </label>
  );
}
