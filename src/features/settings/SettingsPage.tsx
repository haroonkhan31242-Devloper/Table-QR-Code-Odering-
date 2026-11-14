import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Palette, Save, ShoppingBag, Store } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase } from '@/src/hooks/useData';
import { Card, CardHeader, PageHeader } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { Input, Switch, Textarea } from '@/src/components/ui/Field';
import { ImageUploader, useUploadSession } from '@/src/components/shared/ImageUploader';
import { useToast } from '@/src/components/feedback/Toast';
import { can } from '@/src/services/access/accessControl';
import { approversFor } from '@/src/features/orders/services/orderService';
import { updateOrderingSettings, updateRestaurantProfile, type OrderingInput, type ProfileInput } from './services/settingsService';

export default function SettingsPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const toast = useToast();
  const uploads = useUploadSession();
  const editable = can(ctx.user, 'settings.edit');
  const r = ctx.restaurant;

  const initialProfile = useMemo<ProfileInput>(
    () => ({
      name: r.name,
      tagline: r.tagline,
      description: r.description,
      cuisine: r.cuisine,
      phone: r.phone,
      address: r.address,
      city: r.city,
      logoImage: r.logoImage,
      coverImage: r.coverImage,
      accentColor: r.accentColor,
    }),
    [r]
  );
  const initialOrdering = useMemo<OrderingInput>(
    () => ({
      requireWaiterApproval: r.settings.requireWaiterApproval,
      serviceChargePercent: r.settings.serviceChargePercent,
      showSoldOutItems: r.settings.showSoldOutItems,
      receiptFooter: r.settings.receiptFooter,
    }),
    [r]
  );
  const [profile, setProfile] = useState(initialProfile);
  const [ordering, setOrdering] = useState(initialOrdering);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => setOrdering(initialOrdering), [initialOrdering]);
  useEffect(() => () => uploads.discardExcept(r.logoImage, r.coverImage), []); // eslint-disable-line react-hooks/exhaustive-deps

  const approvers = useMemo(() => approversFor(db, r), [db, r]);
  const profileDirty = JSON.stringify(profile) !== JSON.stringify(initialProfile);
  const orderingDirty = JSON.stringify(ordering) !== JSON.stringify(initialOrdering);

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      updateRestaurantProfile(profile);
      uploads.discardExcept(profile.logoImage, profile.coverImage);
      toast.success('Profile saved', 'Your QR menu shows the updated details.');
    } catch (err) {
      toast.fromError(err, 'Profile not saved');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveOrdering = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      updateOrderingSettings(ordering);
      toast.success('Ordering settings saved');
    } catch (err) {
      toast.fromError(err, 'Settings not saved');
      setOrdering(initialOrdering);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description={editable ? 'Restaurant profile, branding and how QR orders flow.' : 'You have view-only access to settings.'} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card as="section">
          <CardHeader icon={Store} title="Profile & branding" description="Shown at the top of your guest menu and on receipts." />
          <form onSubmit={saveProfile} className="flex flex-col gap-5 p-5">
            <fieldset disabled={!editable} className="contents">
              <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                <ImageUploader label="Logo" aspect="aspect-square" value={profile.logoImage} onChange={(logoImage) => setProfile({ ...profile, logoImage })} onUploaded={uploads.track} hint="Square works best." />
                <ImageUploader label="Cover photo" aspect="aspect-[16/9]" value={profile.coverImage} onChange={(coverImage) => setProfile({ ...profile, coverImage })} onUploaded={uploads.track} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Restaurant name" required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                <Input label="Tagline" value={profile.tagline} maxLength={60} onChange={(e) => setProfile({ ...profile, tagline: e.target.value })} />
                <Input label="Cuisine" value={profile.cuisine} onChange={(e) => setProfile({ ...profile, cuisine: e.target.value })} />
                <Input label="Phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                <Input label="Address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
                <Input label="City" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
              </div>
              <Textarea label="Description" rows={3} maxLength={300} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
              <div className="flex items-center gap-4">
                <Palette className="size-5 text-muted" aria-hidden />
                <label htmlFor="brand-color" className="text-[13px] font-medium text-ink-2">Menu accent colour</label>
                <input id="brand-color" type="color" value={profile.accentColor} onChange={(e) => setProfile({ ...profile, accentColor: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1" />
                <span className="font-mono text-[12.5px] text-muted">{profile.accentColor}</span>
              </div>
            </fieldset>
            {editable && (
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" disabled={!profileDirty} onClick={() => setProfile(initialProfile)}>Discard</Button>
                <Button type="submit" icon={Save} loading={savingProfile} disabled={!profileDirty}>Save profile</Button>
              </div>
            )}
          </form>
        </Card>

        <Card as="section" className="h-fit">
          <CardHeader icon={ShoppingBag} title="Ordering" description="How QR orders reach the kitchen." />
          <form onSubmit={saveOrdering} className="flex flex-col gap-5 p-5">
            <Switch
              label="Require waiter approval"
              description="When on, QR orders wait for an authorised waiter before reaching the kitchen. When off, they go straight to the kitchen."
              checked={ordering.requireWaiterApproval}
              disabled={!editable}
              onChange={(v) => setOrdering({ ...ordering, requireWaiterApproval: v })}
            />
            {ordering.requireWaiterApproval && approvers.length === 0 && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-3 text-[13px] text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                No active waiter has the “Approve / reject orders” permission. Assign one in Staff & access first, or approval can’t be switched on.
              </p>
            )}
            {approvers.length > 0 && <p className="text-[12.5px] text-muted">Authorised approvers: {approvers.map((a) => a.name).join(', ')}</p>}
            <div className="border-t border-line pt-5">
              <Switch
                label="Show sold-out items"
                description="Sold-out items stay visible on the guest menu but can’t be ordered."
                checked={ordering.showSoldOutItems}
                disabled={!editable}
                onChange={(v) => setOrdering({ ...ordering, showSoldOutItems: v })}
              />
            </div>
            <Input label="Service charge" type="number" min={0} max={25} step={0.5} suffix="%" disabled={!editable} value={ordering.serviceChargePercent} onChange={(e) => setOrdering({ ...ordering, serviceChargePercent: Number(e.target.value) })} hint="Added to each new order. Taxes are not configured (PRD OD-07)." />
            <Input label="Receipt footer" maxLength={120} disabled={!editable} value={ordering.receiptFooter} onChange={(e) => setOrdering({ ...ordering, receiptFooter: e.target.value })} />
            {editable && (
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" disabled={!orderingDirty} onClick={() => setOrdering(initialOrdering)}>Discard</Button>
                <Button type="submit" icon={Save} disabled={!orderingDirty}>Save ordering</Button>
              </div>
            )}
          </form>
        </Card>
      </div>
    </>
  );
}
