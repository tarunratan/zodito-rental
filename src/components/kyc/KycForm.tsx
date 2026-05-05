'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

type FileState  = { file: File | null; previewUrl: string | null };
type SubmitStep = 'idle' | 'uploading';

const BLANK: FileState = { file: null, previewUrl: null };

async function compressToJpeg(file: File, maxDim = 1400, quality = 0.82): Promise<File> {
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
  const [dlNumber,     setDlNumber]     = useState('');
  const [dlFront,      setDlFront]      = useState<FileState>(BLANK);
  const [dlBack,       setDlBack]       = useState<FileState>(BLANK);
  const [aadhaarFront, setAadhaarFront] = useState<FileState>(BLANK);
  const [aadhaarBack,  setAadhaarBack]  = useState<FileState>(BLANK);
  const [selfie,       setSelfie]       = useState<FileState>(BLANK);
  const [step,         setStep]         = useState<SubmitStep>('idle');
  const [error,        setError]        = useState<string | null>(null);
  const [submitted,    setSubmitted]    = useState(false);

  const uploading = step === 'uploading';
  const canSubmit =
    dlNumber.trim().length >= 10 &&
    !!dlFront.file && !!dlBack.file &&
    !!aadhaarFront.file && !!aadhaarBack.file &&
    !!selfie.file && !uploading;

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    setStep('uploading');
    try {
      const supabase = createSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in — please refresh and try again.');

      const ts = Date.now();

      async function uploadFile(file: File, kind: string): Promise<string> {
        const path = `${user!.id}/${ts}-${kind}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('kyc-docs')
          .upload(path, file, { contentType: 'image/jpeg', upsert: true });
        if (uploadErr) throw new Error(`${kind} upload failed: ${uploadErr.message}`);
        return path;
      }

      const [dlFrontPath, dlBackPath, aadhaarFrontPath, aadhaarBackPath, selfiePath] =
        await Promise.all([
          uploadFile(dlFront.file!,      'dl_front'),
          uploadFile(dlBack.file!,       'dl_back'),
          uploadFile(aadhaarFront.file!, 'aadhaar_front'),
          uploadFile(aadhaarBack.file!,  'aadhaar_back'),
          uploadFile(selfie.file!,       'selfie'),
        ]);

      const res = await fetch('/api/kyc/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dl_number:          dlNumber.trim(),
          dl_front_path:      dlFrontPath,
          dl_back_path:       dlBackPath,
          aadhaar_front_path: aadhaarFrontPath,
          aadhaar_back_path:  aadhaarBackPath,
          selfie_path:        selfiePath,
        }),
      });

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
        {uploading
          ? 'Uploading…'
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

// ── DL / Aadhaar tile: camera (back-facing) + gallery ────────────────────────

function DocCaptureTile({
  label,
  state,
  onChange,
}: {
  label: string;
  state: FileState;
  onChange: (s: FileState) => void;
}) {
  const [processing, setProcessing] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { alert('File too large (max 50 MB)'); return; }
    setProcessing(true);
    try {
      const compressed = await compressToJpeg(file);
      onChange({ file: compressed, previewUrl: URL.createObjectURL(compressed) });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label}</p>

      {processing ? (
        <div className="w-full h-40 rounded-lg border border-border bg-bg animate-pulse flex items-center justify-center">
          <span className="text-xs text-muted">Processing…</span>
        </div>
      ) : state.previewUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.previewUrl} alt={label} className="w-full h-40 object-cover rounded-lg" />
          <button
            onClick={() => onChange(BLANK)}
            className="absolute top-2 right-2 bg-white/95 rounded-md px-2 py-1 text-xs font-semibold shadow"
          >
            Retake
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-dashed border-accent/40 bg-accent/3 rounded-lg cursor-pointer hover:bg-accent/10 transition-colors">
            <span className="text-xl mb-1">📷</span>
            <span className="text-xs font-semibold text-accent">Camera</span>
            <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
          </label>
          <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors">
            <span className="text-xl mb-1">🖼️</span>
            <span className="text-xs font-semibold text-muted">Gallery</span>
            <input type="file" accept="image/*" onChange={onFile} className="hidden" />
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
  const [processing, setProcessing] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { alert('File too large (max 50 MB)'); return; }
    setProcessing(true);
    try {
      const compressed = await compressToJpeg(file);
      onChange({ file: compressed, previewUrl: URL.createObjectURL(compressed) });
    } finally {
      setProcessing(false);
    }
  }

  if (processing) {
    return (
      <div className="w-full h-48 rounded-lg border border-border bg-bg animate-pulse flex items-center justify-center">
        <span className="text-xs text-muted">Processing…</span>
      </div>
    );
  }

  return state.previewUrl ? (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.previewUrl} alt="selfie" className="w-full h-48 object-cover rounded-lg" />
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
      <input type="file" accept="image/jpeg,image/png" capture="user" onChange={onFile} className="hidden" />
    </label>
  );
}
