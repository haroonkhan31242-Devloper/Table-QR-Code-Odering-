import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { deleteImage, isLocalImage, saveImage } from '@/src/services/images/imageStorage';
import { errorMessage } from '@/src/services/storage/errors';
import { cn } from '@/src/utils/format';
import { FoodImage } from './Brand';

/**
 * Picks an image from the device gallery, compresses it and stores it through
 * the image-storage abstraction. Newly uploaded images that are discarded
 * before saving are cleaned up by the parent via `onDiscard`.
 */
export function ImageUploader({
  value,
  onChange,
  label,
  hint = 'JPG, PNG or WebP. Compressed automatically before saving.',
  aspect = 'aspect-[4/3]',
  className,
  onUploaded,
}: {
  value: string;
  onChange: (ref: string) => void;
  label: string;
  hint?: string;
  aspect?: string;
  className?: string;
  /** Called with refs created during this editing session (for rollback). */
  onUploaded?: (ref: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const ref = await saveImage(file);
      onUploaded?.(ref);
      onChange(ref);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <div
        className={cn(
          'group relative overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface-2',
          aspect,
          error && 'border-danger'
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pick(e.dataTransfer.files?.[0]);
        }}
      >
        {value ? (
          <FoodImage src={value} alt={`${label} preview`} className="size-full" />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-2 text-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-surface shadow-sm">
              <ImagePlus className="size-5" aria-hidden />
            </span>
            <span className="text-[13px] font-medium">Choose from gallery</span>
            <span className="text-[11.5px]">or drop an image here</span>
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/80 text-[13px] font-medium text-ink backdrop-blur-sm">
            <Loader2 className="size-4 animate-spin text-brand" aria-hidden /> Optimising image…
          </div>
        )}
        {value && !busy && (
          <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-black/60 px-2.5 text-[12px] font-semibold text-white backdrop-blur hover:bg-black/75"
            >
              <RefreshCw className="size-3.5" aria-hidden /> Replace
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label={`Remove ${label.toLowerCase()}`}
              className="inline-flex size-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-red-600"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void pick(e.target.files?.[0])} aria-label={`Upload ${label}`} />
      {error ? <p role="alert" className="text-[12.5px] font-medium text-danger">{error}</p> : <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/** Helper for forms: remember images uploaded in this session; discard unsaved ones on cancel. */
export function useUploadSession() {
  const created = useRef<string[]>([]);
  return {
    track: (ref: string) => created.current.push(ref),
    /** Delete uploads that were not kept in the final value. */
    discardExcept: (...keep: string[]) => {
      created.current.filter((r) => !keep.includes(r) && isLocalImage(r)).forEach(deleteImage);
      created.current = [];
    },
    reset: () => {
      created.current = [];
    },
  };
}
