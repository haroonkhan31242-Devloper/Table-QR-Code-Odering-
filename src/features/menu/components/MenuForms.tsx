import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Category, Product } from '@/src/types/domain';
import { Dialog } from '@/src/components/ui/Overlay';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/src/components/ui/Field';
import { ImageUploader, useUploadSession } from '@/src/components/shared/ImageUploader';
import { useToast } from '@/src/components/feedback/Toast';
import { errorMessage } from '@/src/services/storage/errors';
import { formatMoney } from '@/src/utils/format';
import { createCategory, createProduct, updateCategory, updateProduct, type CategoryInput, type ProductInput } from '../services/menuService';

type OptionRow = { id?: string; name: string; price: number | string };

function OptionsEditor({
  title,
  hint,
  rows,
  onChange,
  pricePrefix,
}: {
  title: string;
  hint: string;
  rows: OptionRow[];
  onChange: (rows: OptionRow[]) => void;
  pricePrefix: string;
}) {
  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1 text-[13px] font-semibold text-ink-2">{title}</legend>
      <p className="mb-3 text-[12.5px] text-muted">{hint}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={row.id ?? `new-${i}`} className="flex items-center gap-2">
            <input
              aria-label={`${title} name ${i + 1}`}
              value={row.name}
              onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
              placeholder="Name"
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <div className="relative w-32 shrink-0">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted">{pricePrefix}</span>
              <input
                aria-label={`${title} price ${i + 1}`}
                type="number"
                min={0}
                value={row.price}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))}
                className="tabular h-10 w-full rounded-xl border border-line bg-surface pl-12 pr-2 text-[14px] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
            </div>
            <IconButton icon={Trash2} tone="danger" size="sm" label={`Remove ${row.name || 'option'}`} onClick={() => onChange(rows.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" icon={Plus} className="mt-2" onClick={() => onChange([...rows, { name: '', price: 0 }])}>
        Add {title.toLowerCase().replace(/s$/, '')}
      </Button>
    </fieldset>
  );
}

export function ProductFormDialog({
  open,
  onClose,
  product,
  categories,
  defaultCategoryId,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  categories: Category[];
  defaultCategoryId?: string;
}) {
  const toast = useToast();
  const uploads = useUploadSession();
  const [form, setForm] = useState<Omit<ProductInput, 'variants' | 'addons'>>({
    categoryId: '',
    title: '',
    description: '',
    price: 0,
    image: '',
    isAvailable: true,
    isPopular: false,
    prepMinutes: 10,
  });
  const [variants, setVariants] = useState<OptionRow[]>([]);
  const [addons, setAddons] = useState<OptionRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    uploads.reset();
    setErrors({});
    setFormError(null);
    setBusy(false);
    if (product) {
      setForm({
        categoryId: product.categoryId,
        title: product.title,
        description: product.description,
        price: product.price,
        image: product.image,
        isAvailable: product.isAvailable,
        isPopular: product.isPopular,
        prepMinutes: product.prepMinutes,
      });
      setVariants(product.variants.map((v) => ({ ...v })));
      setAddons(product.addons.map((a) => ({ ...a })));
    } else {
      setForm({ categoryId: defaultCategoryId || categories[0]?.id || '', title: '', description: '', price: 0, image: '', isAvailable: true, isPopular: false, prepMinutes: 10 });
      setVariants([]);
      setAddons([]);
    }
  }, [open, product]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    uploads.discardExcept(product?.image ?? '');
    onClose();
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Give the product a title.';
    if (!(Number(form.price) > 0)) e.price = 'Enter a price greater than 0.';
    if (!form.categoryId) e.categoryId = 'Choose a category.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    const input: ProductInput = {
      ...form,
      price: Number(form.price),
      prepMinutes: Number(form.prepMinutes),
      variants: variants.map((v) => ({ id: v.id, name: v.name, price: Number(v.price) })),
      addons: addons.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) })),
    };
    try {
      if (product) {
        updateProduct(product.id, input);
        toast.success('Product saved', 'The customer menu is already showing your changes.');
      } else {
        createProduct(input);
        toast.success('Product added', `${input.title} is now on the menu.`);
      }
      uploads.discardExcept(form.image);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="xl"
      dismissible={false}
      title={product ? `Edit ${product.title}` : 'New product'}
      description="Changes go live on the QR menu as soon as you save."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" form="product-form" loading={busy}>{product ? 'Save product' : 'Add product'}</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} noValidate className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-4">
          <ImageUploader label="Product photo" value={form.image} onChange={(image) => setForm({ ...form, image })} onUploaded={uploads.track} />
          <div className="flex flex-col gap-4 rounded-2xl border border-line p-4">
            <Switch label="Available to order" description="Turn off to mark as sold out." checked={form.isAvailable} onChange={(v) => setForm({ ...form, isAvailable: v })} />
            <Switch label="Popular" description="Shows a badge on the menu." checked={form.isPopular} onChange={(v) => setForm({ ...form, isPopular: v })} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {formError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">{formError}</p>}
          <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} maxLength={80} data-autofocus />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={300} hint={`${form.description.length}/300`} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Category"
              required
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              error={errors.categoryId}
              options={[{ value: '', label: 'Choose…', disabled: true }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Input
              label="Price"
              required
              type="number"
              min={1}
              inputMode="numeric"
              prefix="PKR"
              value={form.price || ''}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              error={errors.price}
              hint={product && Number(form.price) !== product.price ? `Was ${formatMoney(product.price)}` : undefined}
            />
            <Input label="Prep time" type="number" min={1} suffix="min" value={form.prepMinutes} onChange={(e) => setForm({ ...form, prepMinutes: Number(e.target.value) })} />
          </div>
          <OptionsEditor title="Variants" hint="Customer picks one. The price is added to the base price, so use 0 for no change." rows={variants} onChange={setVariants} pricePrefix="+PKR" />
          <OptionsEditor title="Add-ons" hint="Optional extras. Customers can pick several." rows={addons} onChange={setAddons} pricePrefix="PKR" />
        </div>
      </form>
    </Dialog>
  );
}

export function CategoryFormDialog({ open, onClose, category }: { open: boolean; onClose: () => void; category: Category | null }) {
  const toast = useToast();
  const uploads = useUploadSession();
  const [form, setForm] = useState<CategoryInput>({ name: '', description: '', image: '', isActive: true });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    uploads.reset();
    setError(null);
    setForm(category ? { name: category.name, description: category.description, image: category.image, isActive: category.isActive } : { name: '', description: '', image: '', isActive: true });
  }, [open, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    uploads.discardExcept(category?.image ?? '');
    onClose();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (category) updateCategory(category.id, form);
      else createCategory(form);
      toast.success(category ? 'Category saved' : 'Category created', form.name);
      uploads.discardExcept(form.image);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="md"
      dismissible={false}
      title={category ? `Edit ${category.name}` : 'New category'}
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" form="category-form">{category ? 'Save' : 'Create category'}</Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">{error}</p>}
        <ImageUploader label="Category image" value={form.image} onChange={(image) => setForm({ ...form, image })} onUploaded={uploads.track} aspect="aspect-[16/7]" />
        <Input label="Name" required maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-autofocus />
        <Textarea label="Short description" rows={2} maxLength={120} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Switch label="Show on customer menu" description="Hidden categories and their products don’t appear to guests." checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
      </form>
    </Dialog>
  );
}
