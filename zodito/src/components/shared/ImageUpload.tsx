'use client';

import { useRef, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

interface Props {
  label?: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  onRemoved?: () => void;
}

export function ImageUpload({ label, currentUrl, onUploaded, onRemoved }: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const supabase = createSupabaseBrowser();
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage.from('bikes').upload(path, file, { upsert: false });
    if (error || !data) {
      alert('Upload failed: ' + (error?.message ?? 'unknown'));
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('bikes').getPublicUrl(data.path);
    setPreview(publicUrl);
    onUploaded(publicUrl);
    setUploading(false);
    e.target.value = '';
  }

  function remove() {
    setPreview(null);
    onRemoved?.();
  }

  return (
    <div>
      {label && <p className="text-xs font-medium text-muted mb-1">{label}</p>}
      <div
        className="relative border-2 border-dashed border-border rounded-lg overflow-hidden cursor-pointer hover:border-accent/50 transition-colors"
        style={{ height: 96 }}
        onClick={() => !preview && inputRef.current?.click()}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={e => { e.stopPropagation(); remove(); }}
              className="absolute top-1 right-1 bg-black/60 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center leading-none"
            >
              ✕
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted text-xs gap-1 select-none">
            {uploading ? (
              <span>Uploading…</span>
            ) : (
              <>
                <span className="text-xl">📷</span>
                <span>Click to upload</span>
              </>
            )}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-xs font-medium">Uploading…</span>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}
