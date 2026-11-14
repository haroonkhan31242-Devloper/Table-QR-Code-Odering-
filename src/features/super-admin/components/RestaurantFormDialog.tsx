import React, { useEffect, useState } from 'react';
import { Dialog } from '@/src/components/ui/Overlay';
import { Button } from '@/src/components/ui/Button';
import { Input, Textarea } from '@/src/components/ui/Field';
import { useToast } from '@/src/components/feedback/Toast';
import type { Restaurant } from '@/src/types/domain';
import { errorMessage } from '@/src/services/storage/errors';
import { createRestaurant, updateRestaurant, type OwnerInput, type TenantInput } from '../services/tenantService';

const EMPTY: TenantInput = {
  name: '',
  cuisine: '',
  city: '',
  address: '',
  phone: '',
  description: '',
  accentColor: '#E0552B',
  planLabel: 'One-time licence',
  creditBalance: 0,
  dueDate: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
};

export function RestaurantFormDialog({ open, onClose, restaurant }: { open: boolean; onClose: () => void; restaurant?: Restaurant | null }) {
  const toast = useToast();
  const editing = Boolean(restaurant);
  const [form, setForm] = useState<TenantInput>(EMPTY);
  const [owner, setOwner] = useState<OwnerInput>({ name: '', username: '', email: '', password: '' });
  const [tables, setTables] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    if (restaurant) {
      setForm({
        name: restaurant.name,
        cuisine: restaurant.cuisine,
        city: restaurant.city,
        address: restaurant.address,
        phone: restaurant.phone,
        description: restaurant.description,
        accentColor: restaurant.accentColor,
        planLabel: restaurant.commercial.planLabel,
        creditBalance: restaurant.commercial.creditBalance,
        dueDate: restaurant.commercial.dueDate,
      });
    } else {
      setForm(EMPTY);
      setOwner({ name: '', username: '', email: '', password: '' });
      setTables(6);
    }
  }, [open, restaurant]);

  const set = <K extends keyof TenantInput>(k: K, v: TenantInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (restaurant) {
        updateRestaurant(restaurant.id, form);
        toast.success('Restaurant updated', form.name);
      } else {
        const r = createRestaurant(form, owner, tables);
        toast.success('Restaurant created', `${r.name} is live with ${tables} table QR code${tables === 1 ? '' : 's'}.`);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      dismissible={false}
      title={editing ? `Edit ${restaurant?.name}` : 'New restaurant'}
      description={editing ? 'Platform record and commercial details.' : 'Creates an isolated tenant, its owner account and starter tables with unique QR codes.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="restaurant-form" loading={busy}>{editing ? 'Save changes' : 'Create restaurant'}</Button>
        </>
      }
    >
      <form id="restaurant-form" onSubmit={submit} noValidate className="flex flex-col gap-6">
        {error && <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] font-medium text-danger">{error}</div>}
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">Restaurant</legend>
          <Input label="Restaurant name" required value={form.name} onChange={(e) => set('name', e.target.value)} data-autofocus />
          <Input label="Cuisine" value={form.cuisine} onChange={(e) => set('cuisine', e.target.value)} placeholder="e.g. Burgers & Grill" />
          <Input label="City" required value={form.city} onChange={(e) => set('city', e.target.value)} />
          <Input label="Phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Address" wrapperClassName="sm:col-span-2" value={form.address} onChange={(e) => set('address', e.target.value)} />
          <div className="sm:col-span-2">
            <Textarea label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="accent" className="text-[13px] font-medium text-ink-2">Brand colour</label>
            <div className="flex items-center gap-3">
              <input id="accent" type="color" value={form.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-surface p-1" />
              <span className="font-mono text-[13px] text-muted">{form.accentColor}</span>
            </div>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">Commercial (proposed model)</legend>
          <Input label="Plan" value={form.planLabel} onChange={(e) => set('planLabel', e.target.value)} />
          <Input label="Credit balance" type="number" min={0} prefix="PKR" value={form.creditBalance} onChange={(e) => set('creditBalance', Number(e.target.value))} />
          <Input label="Due date" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </fieldset>

        {!editing && (
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">Owner account</legend>
            <Input label="Owner name" required value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} />
            <Input label="Owner email" type="email" required value={owner.email} onChange={(e) => setOwner({ ...owner, email: e.target.value })} />
            <Input label="Username" required autoComplete="off" value={owner.username} onChange={(e) => setOwner({ ...owner, username: e.target.value })} hint="Used to sign in to the restaurant portal." />
            <Input label="Initial password" type="password" required autoComplete="new-password" value={owner.password} onChange={(e) => setOwner({ ...owner, password: e.target.value })} hint="8+ characters with a letter and a number." />
            <Input label="Starter tables" type="number" min={0} max={60} value={tables} onChange={(e) => setTables(Number(e.target.value))} hint="Each gets its own unique QR token." />
          </fieldset>
        )}
      </form>
    </Dialog>
  );
}
