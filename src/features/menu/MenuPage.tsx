import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, EyeOff, FolderOpen, Layers, MoreHorizontal, Pencil, Plus, Star, Trash2, UtensilsCrossed } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase, useDebounced } from '@/src/hooks/useData';
import { Badge, Card, EmptyState, PageHeader, Segmented } from '@/src/components/ui/Display';
import { Button, IconButton } from '@/src/components/ui/Button';
import { SearchInput, Switch } from '@/src/components/ui/Field';
import { ConfirmDialog } from '@/src/components/ui/Overlay';
import { Menu } from '@/src/components/ui/Menu';
import { FoodImage } from '@/src/components/shared/Brand';
import { useToast } from '@/src/components/feedback/Toast';
import { can } from '@/src/services/access/accessControl';
import { filterRecords, listScoped, searchRecords } from '@/src/services/storage/collection';
import { buildQrUrl } from '@/src/services/qr/qrService';
import type { Category, Product } from '@/src/types/domain';
import { cn, formatMoney } from '@/src/utils/format';
import { deleteCategory, deleteProduct, moveCategory, setProductAvailability } from './services/menuService';
import { CategoryFormDialog, ProductFormDialog } from './components/MenuForms';

type Tab = 'products' | 'categories';
type Availability = 'all' | 'available' | 'soldout';

export default function MenuPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('products');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [availability, setAvailability] = useState<Availability>('all');
  const [productDialog, setProductDialog] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category: Category | null }>({ open: false, category: null });
  const [deleting, setDeleting] = useState<{ kind: 'product'; item: Product } | { kind: 'category'; item: Category } | null>(null);
  const q = useDebounced(query);

  const categories = useMemo(() => listScoped(db, 'categories', ctx.scope).sort((a, b) => a.sortOrder - b.sortOrder), [db, ctx.scope]);
  const products = useMemo(() => listScoped(db, 'products', ctx.scope), [db, ctx.scope]);
  const previewTable = useMemo(() => listScoped(db, 'tables', ctx.scope).find((t) => t.qrToken), [db, ctx.scope]);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const canProducts = can(ctx.user, 'menu.products');
  const canCategories = can(ctx.user, 'menu.categories');
  const canAvailability = can(ctx.user, 'menu.availability');

  const visible = useMemo(
    () =>
      filterRecords(searchRecords(products, q, [(p) => p.title, (p) => p.description, (p) => catName.get(p.categoryId)]), [
        category !== 'all' && ((p) => p.categoryId === category),
        availability === 'available' && ((p) => p.isAvailable),
        availability === 'soldout' && ((p) => !p.isAvailable),
      ]).sort((a, b) => (categories.findIndex((c) => c.id === a.categoryId) - categories.findIndex((c) => c.id === b.categoryId)) || a.title.localeCompare(b.title)),
    [products, q, category, availability, catName, categories]
  );

  const toggle = (p: Product, v: boolean) => {
    try {
      setProductAvailability(p.id, v);
      toast.success(v ? 'Back on the menu' : 'Marked sold out', p.title);
    } catch (err) {
      toast.fromError(err);
    }
  };

  const confirmDelete = () => {
    if (!deleting) return;
    try {
      if (deleting.kind === 'product') deleteProduct(deleting.item.id);
      else deleteCategory(deleting.item.id);
      toast.success(`${deleting.kind === 'product' ? deleting.item.title : deleting.item.name} deleted`);
      setDeleting(null);
    } catch (err) {
      toast.fromError(err, 'Couldn’t delete');
      setDeleting(null);
    }
  };

  const reorder = (id: string, dir: -1 | 1) => {
    try {
      moveCategory(id, dir);
    } catch (err) {
      toast.fromError(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Menu"
        description="Everything here is what guests see when they scan a table QR. Edits are live instantly."
        actions={
          <>
            {previewTable && (
              <Button variant="secondary" icon={ExternalLink} onClick={() => window.open(buildQrUrl(ctx.restaurant, previewTable), '_blank', 'noopener')}>
                Preview guest menu
              </Button>
            )}
            {tab === 'products' && canProducts && (
              <Button icon={Plus} disabled={!categories.length} title={!categories.length ? 'Create a category first' : undefined} onClick={() => setProductDialog({ open: true, product: null })}>
                New product
              </Button>
            )}
            {tab === 'categories' && canCategories && <Button icon={Plus} onClick={() => setCategoryDialog({ open: true, category: null })}>New category</Button>}
          </>
        }
      />

      <Segmented
        label="Menu sections"
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'products', label: 'Products', count: products.length, icon: UtensilsCrossed },
          { value: 'categories', label: 'Categories', count: categories.length, icon: Layers },
        ]}
      />

      {tab === 'products' ? (
        <>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput value={query} onChange={setQuery} placeholder="Search products" className="lg:w-72" />
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 lg:flex-1">
              {[{ id: 'all', name: 'All' }, ...categories].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    'h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                    category === c.id ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <Segmented
              size="sm"
              label="Availability"
              value={availability}
              onChange={setAvailability}
              options={[
                { value: 'all', label: 'All' },
                { value: 'available', label: 'Available' },
                { value: 'soldout', label: 'Sold out', count: products.filter((p) => !p.isAvailable).length },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={UtensilsCrossed}
                title={products.length ? 'No products match' : 'Your menu is empty'}
                description={products.length ? 'Try another search or filter.' : categories.length ? 'Add your first product.' : 'Create a category first, then add products to it.'}
                action={!products.length && canCategories && !categories.length ? <Button icon={Plus} onClick={() => { setTab('categories'); setCategoryDialog({ open: true, category: null }); }}>New category</Button> : undefined}
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((p) => (
                <Card key={p.id} as="article" className={cn('group flex flex-col overflow-hidden transition-shadow hover:shadow-md', !p.isAvailable && 'opacity-80')}>
                  <div className="relative">
                    <FoodImage src={p.image} alt={p.title} className={cn('aspect-[4/3] w-full', !p.isAvailable && 'grayscale')} />
                    <div className="absolute left-3 top-3 flex gap-1.5">
                      {p.isPopular && <Badge tone="brand" icon={Star} className="bg-surface/95 backdrop-blur">Popular</Badge>}
                      {!p.isAvailable && <Badge tone="danger" icon={EyeOff} className="bg-surface/95 backdrop-blur">Sold out</Badge>}
                    </div>
                    {canProducts && (
                      <div className="absolute right-2 top-2">
                        <Menu
                          trigger={(pr) => (
                            <IconButton {...pr} icon={MoreHorizontal} label={`Actions for ${p.title}`} size="sm" className="bg-surface/95 text-ink shadow-sm backdrop-blur hover:bg-surface" />
                          )}
                          items={[
                            { label: 'Edit product', icon: Pencil, onSelect: () => setProductDialog({ open: true, product: p }) },
                            'separator',
                            { label: 'Delete', icon: Trash2, tone: 'danger', onSelect: () => setDeleting({ kind: 'product', item: p }) },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="text-[12px] font-medium text-muted">{catName.get(p.categoryId) ?? 'Uncategorised'}</p>
                    <h3 className="mt-0.5 font-semibold leading-snug text-ink">{p.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{p.description || 'No description'}</p>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                      <div>
                        <p className="tabular font-display text-[18px] font-bold text-ink">{formatMoney(p.price)}</p>
                        {(p.variants.length > 0 || p.addons.length > 0) && (
                          <p className="text-[11.5px] text-muted">{p.variants.length} variants · {p.addons.length} add-ons</p>
                        )}
                      </div>
                      {canAvailability ? (
                        <Switch checked={p.isAvailable} onChange={(v) => toggle(p, v)} ariaLabel={`${p.title} available to order`} />
                      ) : (
                        <Badge tone={p.isAvailable ? 'success' : 'danger'}>{p.isAvailable ? 'Available' : 'Sold out'}</Badge>
                      )}
                    </div>
                    {canProducts && (
                      <Button variant="secondary" size="sm" icon={Pencil} className="mt-3" onClick={() => setProductDialog({ open: true, product: p })}>
                        Edit
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : categories.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderOpen}
            title="No categories yet"
            description="Categories group your products on the guest menu."
            action={canCategories ? <Button icon={Plus} onClick={() => setCategoryDialog({ open: true, category: null })}>New category</Button> : undefined}
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {categories.map((c, i) => {
              const count = products.filter((p) => p.categoryId === c.id).length;
              return (
                <li key={c.id} className="flex items-center gap-4 p-4">
                  <FoodImage src={c.image} alt="" className="size-14 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{c.name}</p>
                      {!c.isActive && <Badge tone="warning" icon={EyeOff}>Hidden from guests</Badge>}
                    </div>
                    <p className="truncate text-[13px] text-muted">{c.description || '—'} · {count} product{count === 1 ? '' : 's'}</p>
                  </div>
                  {canCategories && (
                    <div className="flex items-center gap-1">
                      <IconButton icon={ArrowUp} size="sm" label={`Move ${c.name} up`} disabled={i === 0} onClick={() => reorder(c.id, -1)} />
                      <IconButton icon={ArrowDown} size="sm" label={`Move ${c.name} down`} disabled={i === categories.length - 1} onClick={() => reorder(c.id, 1)} />
                      <IconButton icon={Pencil} size="sm" label={`Edit ${c.name}`} onClick={() => setCategoryDialog({ open: true, category: c })} />
                      <IconButton icon={Trash2} size="sm" tone="danger" label={`Delete ${c.name}`} onClick={() => setDeleting({ kind: 'category', item: c })} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <ProductFormDialog
        open={productDialog.open}
        product={productDialog.product}
        categories={categories}
        defaultCategoryId={category !== 'all' ? category : undefined}
        onClose={() => setProductDialog({ open: false, product: null })}
      />
      <CategoryFormDialog open={categoryDialog.open} category={categoryDialog.category} onClose={() => setCategoryDialog({ open: false, category: null })} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={`Delete ${deleting?.kind === 'product' ? deleting.item.title : deleting?.item.name}?`}
        description={
          deleting?.kind === 'category'
            ? 'Categories that still contain products can’t be deleted. Move or delete their products first.'
            : 'The product and its photo are removed from the menu. Past orders and reports keep their records.'
        }
        confirmLabel="Delete"
      />
    </>
  );
}
