import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, FileDown, Layers, Loader2, Printer, Save } from 'lucide-react';
import type { DiningTable, Restaurant } from '@/src/types/domain';
import { Dialog } from '@/src/components/ui/Overlay';
import { Button } from '@/src/components/ui/Button';
import { Input, Select, Switch } from '@/src/components/ui/Field';
import { Segmented } from '@/src/components/ui/Display';
import { useToast } from '@/src/components/feedback/Toast';
import { cn } from '@/src/utils/format';
import {
  DEFAULT_INSTRUCTION,
  FORMATS,
  HEADINGS,
  LABEL_TEMPLATES,
  normalizePreferences,
  type LabelFormat,
  type LabelHeading,
  type LabelPreferences,
} from '../labels/templates';
import {
  downloadBlob,
  drawLabel,
  exportLabelPng,
  exportLabelsPdf,
  exportSheetPdf,
  labelFileName,
  loadLabelAssets,
  sheetLayout,
  type LabelAssets,
  type LabelSpec,
} from '../labels/renderLabel';
import { saveLabelPreferences } from '../services/labelPreferences';

/** Renders a label with the exact same routine used for export. */
function LabelCanvas({ spec, resolution, className, label }: { spec: LabelSpec; resolution: number; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { widthMm, heightMm } = FORMATS[spec.prefs.format];
    canvas.width = resolution;
    canvas.height = Math.round((resolution * heightMm) / widthMm);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    try {
      drawLabel(ctx, spec, 0, 0, canvas.width);
    } catch {
      /* drawing errors surface on export */
    }
  }, [spec, resolution]);
  return <canvas ref={ref} role="img" aria-label={label} className={className} />;
}

export function QrLabelStudio({
  open,
  onClose,
  restaurant,
  tables,
  initialTableId,
  canSaveDefault,
}: {
  open: boolean;
  onClose: () => void;
  restaurant: Restaurant;
  tables: DiningTable[];
  initialTableId?: string | null;
  canSaveDefault: boolean;
}) {
  const toast = useToast();
  const active = useMemo(() => tables.filter((t) => t.qrToken), [tables]);
  const saved = useMemo(() => normalizePreferences(restaurant.settings.qrLabel as Partial<LabelPreferences> | undefined), [restaurant.settings.qrLabel]);
  const [prefs, setPrefs] = useState<LabelPreferences>(saved);
  const [tableId, setTableId] = useState<string>('');
  const [assets, setAssets] = useState<LabelAssets | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPrefs(saved);
    setTableId(initialTableId && active.some((t) => t.id === initialTableId) ? initialTableId : active[0]?.id ?? '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setAssets(null);
    loadLabelAssets(restaurant).then((a) => alive && setAssets(a));
    return () => {
      alive = false;
    };
  }, [open, restaurant]);

  const table = active.find((t) => t.id === tableId) ?? active[0];
  const spec: LabelSpec | null = assets && table ? { prefs, restaurant, table, assets } : null;
  const isDirty = JSON.stringify(prefs) !== JSON.stringify(saved);
  const size = FORMATS[prefs.format];
  const sheet = sheetLayout(prefs.format);
  const set = <K extends keyof LabelPreferences>(k: K, v: LabelPreferences[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.fromError(err, 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const downloadPng = () =>
    run('png', async () => {
      if (!spec) return;
      downloadBlob(await exportLabelPng(spec), labelFileName(spec, 'png'));
      toast.success('PNG downloaded', `${table!.label} · ${size.hint} at 300 DPI`);
    });

  const downloadPdf = () =>
    run('pdf', async () => {
      if (!spec) return;
      downloadBlob(await exportLabelsPdf([spec], `${restaurant.name} ${table!.label}`), labelFileName(spec, 'pdf'));
      toast.success('PDF downloaded', `${table!.label} · printed at true size (${size.hint})`);
    });

  const downloadSheet = () =>
    run('sheet', async () => {
      if (!assets) return;
      const specs = active.map((t) => ({ prefs, restaurant, table: t, assets }));
      const blob = await exportSheetPdf(specs, `${restaurant.name} table QR labels`);
      downloadBlob(blob, `${restaurant.slug}-qr-labels-${prefs.template}-${prefs.format}-a4.pdf`);
      toast.success('A4 sheets downloaded', `${specs.length} labels · ${Math.ceil(specs.length / sheet.perPage)} page${specs.length > sheet.perPage ? 's' : ''} with cut marks`);
    });

  const print = () => {
    // Open the window synchronously (avoids pop-up blockers), then load the PDF into it.
    const win = window.open('', '_blank');
    void run('print', async () => {
      if (!spec) return;
      const blob = await exportLabelsPdf([spec], `${restaurant.name} ${table!.label}`);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else downloadBlob(blob, labelFileName(spec, 'pdf'));
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  };

  const saveDefault = () => {
    try {
      saveLabelPreferences(prefs);
      toast.success('Default design saved', 'All future labels for this restaurant start from this design.');
    } catch (err) {
      toast.fromError(err);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="QR label studio"
      description={`Branded, print-ready table labels for ${restaurant.name}. The preview is drawn exactly like the download.`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          {canSaveDefault && (
            <Button variant="ghost" size="sm" icon={Save} onClick={saveDefault} disabled={!isDirty} className="col-span-2 sm:mr-auto sm:h-10">
              Save as default
            </Button>
          )}
          <Button variant="secondary" icon={Layers} loading={busy === 'sheet'} disabled={!assets || !active.length || Boolean(busy)} onClick={downloadSheet}>
            <span className="sm:hidden">A4 sheet</span>
            <span className="hidden sm:inline">All tables · A4 PDF</span>
          </Button>
          <Button variant="secondary" icon={Printer} loading={busy === 'print'} disabled={!spec || Boolean(busy)} onClick={print}>
            Print
          </Button>
          <Button variant="secondary" icon={Download} loading={busy === 'png'} disabled={!spec || Boolean(busy)} onClick={downloadPng}>
            PNG
          </Button>
          <Button icon={FileDown} loading={busy === 'pdf'} disabled={!spec || Boolean(busy)} onClick={downloadPdf}>
            Download PDF
          </Button>
        </div>
      }
    >
      {!active.length ? (
        <p className="py-10 text-center text-[14px] text-muted">There are no tables with an active QR code. Issue a QR code for a table first.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Preview */}
          <section aria-label="Label preview" className="flex min-w-0 flex-col gap-3">
            <div className="grain relative flex min-h-[320px] items-center justify-center rounded-2xl border border-line bg-surface-2 p-4 sm:p-8">
              {spec ? (
                <LabelCanvas
                  spec={spec}
                  resolution={900}
                  label={`${prefs.template} label preview for ${table?.label}`}
                  className="h-auto max-h-[58vh] w-auto max-w-full rounded-[6px] shadow-lg ring-1 ring-black/5"
                />
              ) : (
                <span className="inline-flex items-center gap-2 text-[14px] text-muted">
                  <Loader2 className="size-4 animate-spin text-brand" aria-hidden /> Preparing fonts and branding…
                </span>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-[12.5px] leading-relaxed text-muted">
                {size.label} · {size.hint} · 300 DPI · scan-safe QR (error correction Q, 4-module quiet zone)
              </p>
              {active.length > 1 && (
                <Select
                  aria-label="Preview table"
                  value={table?.id ?? ''}
                  onChange={(e) => setTableId(e.target.value)}
                  options={active.map((t) => ({ value: t.id, label: t.label }))}
                  wrapperClassName="shrink-0 sm:w-40"
                  className="h-10"
                />
              )}
            </div>
          </section>

          {/* Controls */}
          <section aria-label="Label options" className="flex min-w-0 flex-col gap-5">
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-ink">Design</legend>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2">
                {LABEL_TEMPLATES.map((t) => {
                  const selected = prefs.template === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => set('template', t.id)}
                      title={t.description}
                      className={cn(
                        'group relative flex flex-col gap-2 rounded-xl border p-2 text-left transition-all',
                        selected ? 'border-brand bg-brand-soft ring-2 ring-brand/30' : 'border-line bg-surface hover:border-line-strong'
                      )}
                    >
                      <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                        {spec ? (
                          <LabelCanvas
                            spec={{ ...spec, prefs: { ...prefs, template: t.id } }}
                            resolution={260}
                            label={`${t.name} thumbnail`}
                            className="h-full w-auto"
                          />
                        ) : (
                          <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
                        )}
                      </div>
                      <span className="flex items-center justify-between gap-1 px-0.5 text-[12.5px] font-semibold text-ink">
                        {t.name}
                        {selected && <Check className="size-3.5 shrink-0 text-brand-strong" aria-hidden />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink">Layout</p>
              <Segmented<LabelFormat>
                label="Label layout"
                value={prefs.format}
                onChange={(v) => set('format', v)}
                options={(Object.keys(FORMATS) as LabelFormat[]).map((f) => ({ value: f, label: FORMATS[f].label }))}
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
              />
              <p className="mt-1.5 text-[12px] text-muted">
                {prefs.format === 'table-card'
                  ? 'Stand-up card for table holders. The A4 sheet fits 4 per page.'
                  : 'Square sticker for tabletops. The A4 sheet fits 6 per page at true size.'}
              </p>
            </div>

            <Select
              label="Headline"
              value={prefs.heading}
              onChange={(e) => set('heading', e.target.value as LabelHeading)}
              options={(Object.keys(HEADINGS) as LabelHeading[]).map((h) => ({ value: h, label: HEADINGS[h] }))}
            />

            {prefs.format === 'table-card' && (
              <Input
                label="Guest instruction"
                value={prefs.instruction}
                maxLength={80}
                onChange={(e) => set('instruction', e.target.value)}
                hint={`${prefs.instruction.length}/80 · leave empty to hide`}
                trailingLabel={
                  prefs.instruction !== DEFAULT_INSTRUCTION ? (
                    <button type="button" onClick={() => set('instruction', DEFAULT_INSTRUCTION)} className="text-[12px] font-semibold text-brand-strong hover:underline">
                      Reset
                    </button>
                  ) : undefined
                }
              />
            )}

            <div className="rounded-xl border border-line p-4">
              <Switch label="Show table number" description="Prints the table identifier on each label." checked={prefs.showTable} onChange={(v) => set('showTable', v)} />
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}
