'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type FileState = { file: File | null; previewUrl: string | null };

export function KycForm({ currentStatus }: { currentStatus: string }) {
  const router = useRouter();
  const [dlNumber, setDlNumber] = useState('');
  const [dl, setDl] = useState<FileState>({ file: null, previewUrl: null });
  const [aadhaar, setAadhaar] = useState<FileState>({ file: null, previewUrl: null });
  const [selfie, setSelfie] = useState<FileState>({ file: null, previewUrl: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = dlNumber.trim().length >= 10 && dl.file && aadhaar.file && selfie.file && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('dl_number', dlNumber);
      form.append('dl', dl.file!);
      form.append('aadhaar', aadhaar.file!);
      form.append('selfie', selfie.file!);
      const res = await fetch('/api/kyc/submit', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
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
        {submitting ? 'Uploading…' : currentStatus === 'rejected' ? 'Re-submit for review' : 'Submit for review'}
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
    if (file.size > 8 * 1024 * 1024) {
      alert('File too large (max 8 MB)');
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
              <div className="text-[11px] text-muted mt-1">JPG / PNG up to 8 MB</div>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            className="hidden"
            {...(cameraOnly ? { capture: 'user' } : {})}
          />
        </label>
      )}
    </div>
  );
}
