'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

type FileState = { file: File | null; previewUrl: string | null };
type SubmitStep = 'idle' | 'uploading' | 'saving';

const STEP_LABEL: Record<SubmitStep, string> = {
  idle:      '',
  uploading: 'Uploading documents…',
  saving:    'Saving…',
};

export function KycForm({ currentStatus }: { currentStatus: string }) {
  const router = useRouter();
  const [dlNumber, setDlNumber] = useState('');
  const [dl,       setDl]      = useState<FileState>({ file: null, previewUrl: null });
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
      const supabase = createSupabaseBrowser();

      // Get the auth UUID — this is what Supabase RLS knows as auth.uid()
      const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authUser) throw new Error('Session expired — please sign in again');

      // ── Step 1: upload all 3 files directly to Supabase Storage ────────────
      // Uses the user's live auth session (POST + FormData = CORS simple request,
      // no preflight, works from any origin). Files never pass through Next.js.
      setStep('uploading');
      const ts  = Date.now();
      const uid = authUser.id;

      const paths = {
        dl:      `${uid}/${ts}-dl.jpg`,
        aadhaar: `${uid}/${ts}-aadhaar.jpg`,
        selfie:  `${uid}/${ts}-selfie.jpg`,
      };

      const [dlUp, aadhaarUp, selfieUp] = await Promise.all([
        supabase.storage.from('kyc-docs').upload(paths.dl,      dl.file!,      { contentType: dl.file!.type }),
        supabase.storage.from('kyc-docs').upload(paths.aadhaar, aadhaar.file!, { contentType: aadhaar.file!.type }),
        supabase.storage.from('kyc-docs').upload(paths.selfie,  selfie.file!,  { contentType: selfie.file!.type }),
      ]);

      const uploadErr = dlUp.error || aadhaarUp.error || selfieUp.error;
      if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message);

      // ── Step 2: record paths in the database ────────────────────────────────
      setStep('saving');
      const submitRes = await fetch('/api/kyc/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dl_number:    dlNumber,
          dl_path:      paths.dl,
          aadhaar_path: paths.aadhaar,
          selfie_path:  paths.selfie,
        }),
      });
      const submitData = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) throw new Error((submitData as any).error || 'Submission failed');

      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.');
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
