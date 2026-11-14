import React, { useMemo, useState } from 'react';
import { Database, HardDrive, ImageMinus, QrCode, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge, Card, CardHeader, PageHeader } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/Overlay';
import { useToast } from '@/src/components/feedback/Toast';
import { useDatabase } from '@/src/hooks/useData';
import { getStorageUsage, SCHEMA_VERSION } from '@/src/services/storage/database';
import { collectOrphanImages, imageStorageUsage } from '@/src/services/images/imageStorage';
import { verifyQrIntegrity } from '@/src/services/qr/qrService';
import { formatBytes, formatDateTime } from '@/src/utils/format';
import { resetDemoData } from '../services/tenantService';

export default function SystemPage() {
  const db = useDatabase();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [tick, setTick] = useState(0);
  const usage = useMemo(() => getStorageUsage(), [db, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const images = useMemo(() => imageStorageUsage(), [db, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const qr = useMemo(() => verifyQrIntegrity(db), [db]);
  const pct = Math.min(100, Math.round((usage.totalBytes / usage.approxQuotaBytes) * 100));

  return (
    <>
      <PageHeader title="Data & system" description="Browser storage health, QR integrity verification and demo data controls." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={HardDrive} title="Browser storage" description="LocalStorage acts as the temporary database." />
          <div className="p-5">
            <div className="flex items-baseline justify-between">
              <p className="tabular font-display text-2xl font-bold text-ink">{formatBytes(usage.totalBytes)}</p>
              <p className="text-[13px] text-muted">of ~{formatBytes(usage.approxQuotaBytes)} typical limit</p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
              <div className={`h-full rounded-full ${pct > 80 ? 'bg-danger' : pct > 60 ? 'bg-warning' : 'bg-brand'}`} style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-muted">Database document</dt><dd className="tabular mt-1 font-semibold text-ink">{formatBytes(usage.dbBytes)}</dd></div>
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-muted">Uploaded images</dt><dd className="tabular mt-1 font-semibold text-ink">{images.count} · {formatBytes(images.bytes)}</dd></div>
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-muted">Schema version</dt><dd className="mt-1 font-semibold text-ink">v{SCHEMA_VERSION}</dd></div>
              <div className="rounded-xl bg-surface-2 p-3"><dt className="text-muted">Seeded</dt><dd className="mt-1 font-semibold text-ink">{formatDateTime(db.seededAt)}</dd></div>
            </dl>
            <Button
              variant="secondary"
              icon={ImageMinus}
              className="mt-5"
              onClick={() => {
                const n = collectOrphanImages(db);
                setTick((t) => t + 1);
                toast.success(n ? `Removed ${n} unused image${n === 1 ? '' : 's'}` : 'No unused images found');
              }}
            >
              Clean up unused images
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={QrCode}
            title="QR uniqueness check"
            description="Verifies every token across all restaurants."
            action={qr.ok ? <Badge tone="success" icon={ShieldCheck}>Passed</Badge> : <Badge tone="danger" icon={ShieldAlert}>Issues found</Badge>}
          />
          <dl className="grid grid-cols-2 gap-3 p-5 text-[13px]">
            {[
              ['Restaurants checked', qr.restaurants],
              ['Tables checked', qr.tablesChecked],
              ['Active QR tokens', qr.activeTokens],
              ['Tokens ever issued', qr.registryEntries],
              ['Duplicate tokens', qr.duplicateTokens.length],
              ['Unregistered table tokens', qr.tablesMissingRegistry.length],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-surface-2 p-3">
                <dt className="text-muted">{k}</dt>
                <dd className={`tabular mt-1 font-semibold ${(k === 'Duplicate tokens' || k === 'Unregistered table tokens') && Number(v) > 0 ? 'text-danger' : 'text-ink'}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="px-5 pb-5 text-[12.5px] leading-relaxed text-muted">
            {qr.sameNumberDifferentTokens} table number{qr.sameNumberDifferentTokens === 1 ? ' is' : 's are'} shared by several restaurants, each with a different token. Uniqueness is guaranteed within this browser’s dataset. A production backend must enforce it with a database unique constraint.
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon={Database} title="Demo data" description="Restore the original demo restaurants, menus, tables and orders." />
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted">
              Resetting replaces <strong className="text-ink-2">all</strong> restaurants, staff, menus, orders and logs in this browser with fresh demo data and new QR tokens. Printed QR codes from before the reset will stop working. Demo passwords are taken from your current <code className="font-mono">.env</code>.
            </p>
            <Button variant="outline-danger" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
              Reset demo data
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset all demo data?"
        description="Every change made in this browser (restaurants, menu edits, orders, payments, uploaded images) will be permanently replaced. This cannot be undone."
        confirmLabel="Reset everything"
        onConfirm={() => {
          try {
            resetDemoData();
            setConfirmReset(false);
            setTick((t) => t + 1);
            toast.success('Demo data restored', 'Fresh restaurants, tables and QR codes are ready.');
          } catch (err) {
            toast.fromError(err);
          }
        }}
      />
    </>
  );
}
