import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Ban,
  Copy,
  ExternalLink,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Palette,
  QrCode,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase, useNow } from '@/src/hooks/useData';
import { Badge, Card, EmptyState, PageHeader, Segmented, StatusBadge } from '@/src/components/ui/Display';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Field';
import { ConfirmDialog, Dialog } from '@/src/components/ui/Overlay';
import { Menu } from '@/src/components/ui/Menu';
import { useToast } from '@/src/components/feedback/Toast';
import { can } from '@/src/services/access/accessControl';
import { listScoped } from '@/src/services/storage/collection';
import { errorMessage } from '@/src/services/storage/errors';
import { buildQrPayload, buildQrUrl, regenerateTableQr, revokeTableQr } from '@/src/services/qr/qrService';
import { TABLE_NEXT_ACTION, TABLE_STATUS } from '@/src/constants/status';
import type { DiningTable, TableStatus } from '@/src/types/domain';
import { cn, formatMoney, formatRelative } from '@/src/utils/format';
import { advanceTableStatus, createTable, deleteTable, updateTable, type TableInput } from './services/tableService';
import { QrPreview } from '@/src/features/qr-management/components/QrTools';
// The label studio (renderer, PDF writer, fonts) loads only when first opened.
const QrLabelStudio = lazy(() => import('@/src/features/qr-management/components/QrLabelStudio').then((m) => ({ default: m.QrLabelStudio })));

type Filter = 'all' | TableStatus;

function TableFormDialog({ open, onClose, table }: { open: boolean; onClose: () => void; table: DiningTable | null }) {
  const toast = useToast();
  const [form, setForm] = useState<TableInput>({ number: '', area: '', capacity: 4 });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setError(null);
      setForm(table ? { number: table.number, area: table.area, capacity: table.capacity } : { number: '', area: '', capacity: 4 });
    }
  }, [open, table]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (table) {
        updateTable(table.id, form);
        toast.success('Table updated');
      } else {
        const t = createTable(form);
        toast.success(`${t.label} created`, 'A unique QR code was generated.');
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={table ? `Edit ${table.label}` : 'Add table'}
      description={table ? 'Changing the number keeps the same QR code.' : 'A cryptographically unique QR token is created automatically.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="table-form">{table ? 'Save' : 'Create table'}</Button>
        </>
      }
    >
      <form id="table-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">{error}</p>}
        <Input label="Table number" required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="e.g. 09" data-autofocus />
        <Input label="Area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Terrace" />
        <Input label="Seats" type="number" min={1} max={40} required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
      </form>
    </Dialog>
  );
}

export default function TablesPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const toast = useToast();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<DiningTable | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'regen' | 'revoke' | 'delete'; table: DiningTable } | null>(null);
  // Label studio: `null` = closed, '' = opened for all tables, otherwise a table id.
  const [studioFor, setStudioFor] = useState<string | null>(null);
  const [studioLoaded, setStudioLoaded] = useState(false);
  useEffect(() => {
    if (studioFor !== null) setStudioLoaded(true);
  }, [studioFor]);

  const tables = useMemo(
    () => listScoped(db, 'tables', ctx.scope).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [db, ctx.scope]
  );
  const orders = useMemo(() => listScoped(db, 'orders', ctx.scope), [db, ctx.scope]);
  const openByTable = useMemo(() => {
    const m = new Map<string, { count: number; due: number }>();
    orders
      // "Open" = not rejected and either still in progress or not yet paid.
      .filter((o) => o.tableId && o.status !== 'rejected' && (o.paymentStatus === 'unpaid' || o.status !== 'served'))
      .forEach((o) => {
        const tableId = o.tableId as string; // takeaway orders (no table) are excluded above
        const e = m.get(tableId) ?? { count: 0, due: 0 };
        e.count += 1;
        if (o.paymentStatus === 'unpaid' && o.status !== 'pending_approval') e.due += o.total;
        m.set(tableId, e);
      });
    return m;
  }, [orders]);

  const canManage = can(ctx.user, 'tables.manage');
  const canStatus = can(ctx.user, 'tables.status');
  const canQr = can(ctx.user, 'qr.manage');

  const visible = filter === 'all' ? tables : tables.filter((t) => t.status === filter);
  const areas = [...new Set(visible.map((t) => t.area))];
  const qrTable = qrFor ? tables.find((t) => t.id === qrFor) ?? null : null;

  const advance = (t: DiningTable) => {
    try {
      const next = advanceTableStatus(t.id, t.status);
      toast.success(`${t.label} is now ${TABLE_STATUS[next.status].label.toLowerCase()}`);
    } catch (err) {
      toast.fromError(err);
    }
  };

  const runConfirm = () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'regen') {
        const t = regenerateTableQr(confirm.table.id);
        toast.success('New QR code issued', `${t.label} is now on QR v${t.qrVersion}. Reprint the table card.`);
      } else if (confirm.kind === 'revoke') {
        revokeTableQr(confirm.table.id);
        toast.success('QR code revoked', `${confirm.table.label} can’t receive QR orders until you issue a new code.`);
      } else {
        deleteTable(confirm.table.id);
        toast.success(`${confirm.table.label} deleted`);
        setQrFor(null);
      }
      setConfirm(null);
    } catch (err) {
      toast.fromError(err);
    }
  };

  const counts = {
    available: tables.filter((t) => t.status === 'available').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    cleaning: tables.filter((t) => t.status === 'cleaning').length,
  };

  return (
    <>
      <PageHeader
        title="Tables & QR codes"
        description="Every table has its own QR code. Table status only changes when your staff change it; paying never frees a table."
        actions={
          <>
            {canQr && (
              <Button variant="secondary" icon={Palette} onClick={() => setStudioFor('')} disabled={!tables.some((t) => t.qrToken)}>
                Design & print labels
              </Button>
            )}
            {canManage && <Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true); }}>Add table</Button>}
          </>
        }
      />

      <Segmented
        label="Filter tables"
        className="mb-5"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: tables.length },
          { value: 'available', label: 'Available', count: counts.available },
          { value: 'occupied', label: 'Occupied', count: counts.occupied },
          { value: 'cleaning', label: 'Cleaning', count: counts.cleaning },
        ]}
      />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={LayoutGrid}
            title={tables.length ? 'No tables with this status' : 'No tables yet'}
            description={tables.length ? undefined : 'Add your first table to generate its QR code.'}
            action={!tables.length && canManage ? <Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true); }}>Add table</Button> : undefined}
          />
        </Card>
      ) : (
        areas.map((area) => (
          <section key={area} className="mb-8">
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.09em] text-muted">{area}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visible
                .filter((t) => t.area === area)
                .map((t) => {
                  const open = openByTable.get(t.id);
                  const meta = TABLE_STATUS[t.status];
                  return (
                    <Card key={t.id} as="article" className="flex flex-col p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex size-12 items-center justify-center rounded-2xl font-display text-[18px] font-bold',
                              t.status === 'available' ? 'bg-success-soft text-success' : t.status === 'occupied' ? 'bg-brand-soft text-brand-strong' : 'bg-info-soft text-info'
                            )}
                          >
                            {t.number}
                          </span>
                          <div>
                            <p className="font-semibold text-ink">{t.label}</p>
                            <p className="flex items-center gap-1 text-[12.5px] text-muted"><Users className="size-3.5" aria-hidden /> {t.capacity} seats</p>
                          </div>
                        </div>
                        <Menu
                          trigger={(p) => <IconButton {...p} icon={MoreHorizontal} label={`Actions for ${t.label}`} size="sm" />}
                          items={[
                            { label: 'View QR code', icon: QrCode, onSelect: () => setQrFor(t.id), hidden: !t.qrToken },
                            { label: 'Edit table', icon: Pencil, onSelect: () => { setEditing(t); setFormOpen(true); }, hidden: !canManage },
                            { label: t.qrToken ? 'Regenerate QR' : 'Issue new QR', icon: RefreshCw, onSelect: () => setConfirm({ kind: 'regen', table: t }), hidden: !canQr },
                            { label: 'Revoke QR', icon: Ban, onSelect: () => setConfirm({ kind: 'revoke', table: t }), hidden: !canQr || !t.qrToken, tone: 'danger' },
                            'separator',
                            { label: 'Delete table', icon: Trash2, onSelect: () => setConfirm({ kind: 'delete', table: t }), hidden: !canManage, tone: 'danger' },
                          ]}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <StatusBadge meta={meta} />
                        {t.qrToken ? (
                          <button type="button" onClick={() => setQrFor(t.id)} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-[12px] font-semibold text-ink-2 hover:bg-surface-3">
                            <QrCode className="size-3.5" aria-hidden /> QR v{t.qrVersion}
                          </button>
                        ) : (
                          <Badge tone="danger" icon={Ban}>QR revoked</Badge>
                        )}
                      </div>
                      <p className="mt-2 text-[12px] text-muted">Since {formatRelative(t.statusChangedAt, now)}</p>

                      <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px]">
                        {open?.count ? (
                          <span className="text-ink-2">
                            <strong className="text-ink">{open.count}</strong> open order{open.count === 1 ? '' : 's'}
                            {open.due > 0 && <> · <strong className="tabular text-ink">{formatMoney(open.due)}</strong> unpaid</>}
                          </span>
                        ) : (
                          <span className="text-muted">No open orders</span>
                        )}
                      </div>

                      {canStatus && (
                        <Button variant={t.status === 'cleaning' ? 'primary' : 'secondary'} size="sm" className="mt-4" iconRight={ArrowRight} onClick={() => advance(t)}>
                          {TABLE_NEXT_ACTION[t.status]}
                        </Button>
                      )}
                    </Card>
                  );
                })}
            </div>
          </section>
        ))
      )}

      <TableFormDialog open={formOpen} onClose={() => setFormOpen(false)} table={editing} />

      <Dialog
        open={Boolean(qrTable)}
        onClose={() => setQrFor(null)}
        size="lg"
        title={qrTable ? `${qrTable.label} · QR code` : ''}
        description="Each scan opens this restaurant’s menu linked to this exact table."
      >
        {qrTable && qrTable.qrToken && (
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="mx-auto flex flex-col items-center gap-3">
              <div className="rounded-2xl border border-line bg-white p-3 shadow-sm">
                <QrPreview restaurant={ctx.restaurant} table={qrTable} size={220} />
              </div>
              <Badge tone="success" dot>Active · v{qrTable.qrVersion}</Badge>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Ordering link</p>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-1.5 pl-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2" title={buildQrUrl(ctx.restaurant, qrTable)}>{buildQrUrl(ctx.restaurant, qrTable)}</code>
                  <IconButton
                    icon={Copy}
                    size="sm"
                    label="Copy link"
                    onClick={() => {
                      navigator.clipboard?.writeText(buildQrUrl(ctx.restaurant, qrTable)).then(
                        () => toast.success('Link copied'),
                        () => toast.error('Couldn’t copy', 'Select the link and copy it manually.')
                      );
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">QR payload (resolved from registry)</p>
                <pre className="mt-1.5 overflow-x-auto rounded-xl border border-line bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
                  {JSON.stringify(buildQrPayload(qrTable), null, 2)}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={ExternalLink} onClick={() => window.open(buildQrUrl(ctx.restaurant, qrTable), '_blank', 'noopener')}>Open menu</Button>
                {canQr && (
                  <>
                    <Button icon={Palette} onClick={() => setStudioFor(qrTable.id)}>Branded label</Button>
                    <Button variant="secondary" icon={RefreshCw} onClick={() => setConfirm({ kind: 'regen', table: qrTable })}>Regenerate</Button>
                    <Button variant="outline-danger" icon={Ban} onClick={() => setConfirm({ kind: 'revoke', table: qrTable })}>Revoke</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone={confirm?.kind === 'regen' ? 'primary' : 'danger'}
        title={
          confirm?.kind === 'regen'
            ? `${confirm.table.qrToken ? 'Regenerate' : 'Issue'} QR for ${confirm.table.label}?`
            : confirm?.kind === 'revoke'
              ? `Revoke QR for ${confirm?.table.label}?`
              : `Delete ${confirm?.table.label}?`
        }
        description={
          confirm?.kind === 'regen'
            ? 'A brand-new unique token is issued. Any printed copy of the current code stops working immediately, so reprint the table card.'
            : confirm?.kind === 'revoke'
              ? 'Guests scanning this code will see that it is no longer valid. You can issue a new code at any time.'
              : 'The table and its QR code are removed permanently. Past orders stay in reports.'
        }
        confirmLabel={confirm?.kind === 'regen' ? 'Issue new code' : confirm?.kind === 'revoke' ? 'Revoke code' : 'Delete table'}
      />

      {studioLoaded && (
        <Suspense fallback={null}>
          <QrLabelStudio
            open={studioFor !== null}
            onClose={() => setStudioFor(null)}
            restaurant={ctx.restaurant}
            tables={tables}
            initialTableId={studioFor || null}
            canSaveDefault={canQr}
          />
        </Suspense>
      )}
    </>
  );
}
