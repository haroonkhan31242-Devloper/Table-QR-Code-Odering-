/**
 * Menu management (categories + products). Every change is written to the
 * tenant-scoped store, so the customer QR menu picks it up immediately.
 */
import type { Category, Product, ProductOption } from '@/src/types/domain';
import { mutateDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { getScoped, insertScoped, listScoped, removeScoped, updateScoped } from '@/src/services/storage/collection';
import { requireStaff } from '@/src/services/access/accessControl';
import { logActivity } from '@/src/services/audit/activityService';
import { deleteImage } from '@/src/services/images/imageStorage';
import { createId } from '@/src/utils/crypto';
import { formatMoney } from '@/src/utils/format';

export interface CategoryInput {
  name: string;
  description: string;
  image: string;
  isActive: boolean;
}

export interface ProductInput {
  categoryId: string;
  title: string;
  description: string;
  price: number;
  image: string;
  isAvailable: boolean;
  isPopular: boolean;
  prepMinutes: number;
  variants: Array<Omit<ProductOption, 'id'> & { id?: string }>;
  addons: Array<Omit<ProductOption, 'id'> & { id?: string }>;
}

function cleanOptions(list: ProductInput['variants'], kind: 'variant' | 'add-on'): ProductOption[] {
  return list
    .filter((o) => o.name.trim())
    .map((o) => {
      const price = Math.round(Number(o.price));
      if (!Number.isFinite(price) || price < 0) throw fail.validation(`Each ${kind} needs a price of 0 or more.`);
      return { id: o.id ?? createId(kind === 'variant' ? 'var' : 'add'), name: o.name.trim(), price };
    });
}

function validateCategory(input: CategoryInput) {
  if (!input.name.trim()) throw fail.validation('Category name is required.');
  if (input.name.trim().length > 40) throw fail.validation('Keep the category name under 40 characters.');
}

function validateProduct(input: ProductInput) {
  if (!input.title.trim()) throw fail.validation('Product title is required.');
  if (input.title.trim().length > 80) throw fail.validation('Keep the title under 80 characters.');
  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0) throw fail.validation('Price must be greater than 0.');
  if (price > 1_000_000) throw fail.validation('Price looks too high. Check the amount.');
  if (!input.categoryId) throw fail.validation('Choose a category.');
}

/* ----------------------------- categories ----------------------------- */

export function createCategory(input: CategoryInput): Category {
  validateCategory(input);
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'menu.categories');
    const existing = listScoped(db, 'categories', ctx.scope);
    if (existing.some((c) => c.name.toLowerCase() === input.name.trim().toLowerCase())) {
      throw fail.validation('A category with this name already exists.');
    }
    const now = new Date().toISOString();
    const cat = insertScoped(db, 'categories', ctx.scope, {
      id: createId('cat'),
      ...ctx.scope,
      name: input.name.trim(),
      description: input.description.trim(),
      image: input.image,
      sortOrder: existing.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    });
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'menu',
      action: 'Category created',
      targetId: cat.id,
      targetLabel: cat.name,
      details: `Created category “${cat.name}”.`,
    });
    return cat;
  });
}

export function updateCategory(id: string, input: CategoryInput): Category {
  validateCategory(input);
  let replacedImage: string | undefined;
  const result = mutateDb((db) => {
    const ctx = requireStaff(db, 'menu.categories');
    const prev = getScoped(db, 'categories', ctx.scope, id, 'Category');
    const dup = listScoped(db, 'categories', ctx.scope).some(
      (c) => c.id !== id && c.name.toLowerCase() === input.name.trim().toLowerCase()
    );
    if (dup) throw fail.validation('A category with this name already exists.');
    if (prev.image !== input.image) replacedImage = prev.image;
    const next = updateScoped(db, 'categories', ctx.scope, id, {
      name: input.name.trim(),
      description: input.description.trim(),
      image: input.image,
      isActive: input.isActive,
      updatedAt: new Date().toISOString(),
    }, 'Category');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'menu',
      action: 'Category updated',
      targetId: id,
      targetLabel: next.name,
      details: prev.name !== next.name ? `Renamed “${prev.name}” to “${next.name}”.` : `Updated category “${next.name}”.`,
    });
    return next;
  });
  if (replacedImage) deleteImage(replacedImage);
  return result;
}

export function deleteCategory(id: string): void {
  let image: string | undefined;
  mutateDb((db) => {
    const ctx = requireStaff(db, 'menu.categories');
    const cat = getScoped(db, 'categories', ctx.scope, id, 'Category');
    const linked = listScoped(db, 'products', ctx.scope).filter((p) => p.categoryId === id).length;
    if (linked > 0) {
      throw fail.validation(`“${cat.name}” still has ${linked} product${linked === 1 ? '' : 's'}. Move or delete them first.`);
    }
    removeScoped(db, 'categories', ctx.scope, id, 'Category');
    image = cat.image;
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'menu',
      action: 'Category deleted',
      targetId: id,
      targetLabel: cat.name,
      details: `Deleted category “${cat.name}”.`,
    });
  });
  deleteImage(image);
}

export function moveCategory(id: string, direction: -1 | 1): void {
  mutateDb((db) => {
    const ctx = requireStaff(db, 'menu.categories');
    const cats = listScoped(db, 'categories', ctx.scope).sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = cats.findIndex((c) => c.id === id);
    const swap = cats[idx + direction];
    if (idx === -1 || !swap) return;
    const a = cats[idx].sortOrder;
    updateScoped(db, 'categories', ctx.scope, cats[idx].id, { sortOrder: swap.sortOrder }, 'Category');
    updateScoped(db, 'categories', ctx.scope, swap.id, { sortOrder: a }, 'Category');
  });
}

/* ------------------------------ products ------------------------------ */

export function createProduct(input: ProductInput): Product {
  validateProduct(input);
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'menu.products');
    getScoped(db, 'categories', ctx.scope, input.categoryId, 'Category');
    const now = new Date().toISOString();
    const product = insertScoped(db, 'products', ctx.scope, {
      id: createId('prod'),
      ...ctx.scope,
      categoryId: input.categoryId,
      title: input.title.trim(),
      description: input.description.trim(),
      price: Math.round(Number(input.price)),
      image: input.image,
      isAvailable: input.isAvailable,
      isPopular: input.isPopular,
      prepMinutes: Math.max(1, Math.round(Number(input.prepMinutes) || 10)),
      variants: cleanOptions(input.variants, 'variant'),
      addons: cleanOptions(input.addons, 'add-on'),
      createdAt: now,
      updatedAt: now,
    });
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'menu',
      action: 'Product created',
      targetId: product.id,
      targetLabel: product.title,
      details: `Added “${product.title}” at ${formatMoney(product.price)}.`,
    });
    return product;
  });
}

export function updateProduct(id: string, input: ProductInput): Product {
  validateProduct(input);
  let replacedImage: string | undefined;
  const result = mutateDb((db) => {
    const ctx = requireStaff(db, 'menu.products');
    const prev = getScoped(db, 'products', ctx.scope, id, 'Product');
    getScoped(db, 'categories', ctx.scope, input.categoryId, 'Category');
    if (prev.image !== input.image) replacedImage = prev.image;
    const next = updateScoped(db, 'products', ctx.scope, id, {
      categoryId: input.categoryId,
      title: input.title.trim(),
      description: input.description.trim(),
      price: Math.round(Number(input.price)),
      image: input.image,
      isAvailable: input.isAvailable,
      isPopular: input.isPopular,
      prepMinutes: Math.max(1, Math.round(Number(input.prepMinutes) || 10)),
      variants: cleanOptions(input.variants, 'variant'),
      addons: cleanOptions(input.addons, 'add-on'),
      updatedAt: new Date().toISOString(),
    }, 'Product');

    const changes: string[] = [];
    if (prev.price !== next.price) changes.push(`price ${formatMoney(prev.price)} → ${formatMoney(next.price)}`);
    if (prev.title !== next.title) changes.push(`title “${prev.title}” → “${next.title}”`);
    if (prev.image !== next.image) changes.push('image replaced');
    if (prev.description !== next.description) changes.push('description edited');
    if (prev.isAvailable !== next.isAvailable) changes.push(next.isAvailable ? 'marked available' : 'marked sold out');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'menu',
      action: prev.price !== next.price ? 'Price changed' : 'Product updated',
      targetId: id,
      targetLabel: next.title,
      details: changes.length ? `${next.title}: ${changes.join('; ')}.` : `Saved “${next.title}” with no visible changes.`,
    });
    return next;
  });
  if (replacedImage) deleteImage(replacedImage);
  return result;
}

export function setProductAvailability(id: string, isAvailable: boolean): Product {
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'menu.availability');
    const prev = getScoped(db, 'products', ctx.scope, id, 'Product');
    const next = updateScoped(db, 'products', ctx.scope, id, { isAvailable, updatedAt: new Date().toISOString() }, 'Product');
    if (prev.isAvailable !== isAvailable) {
      logActivity(db, ctx.scope, ctx.actor, {
        category: 'menu',
        action: isAvailable ? 'Product available' : 'Product sold out',
        targetId: id,
        targetLabel: next.title,
        details: `Marked “${next.title}” as ${isAvailable ? 'available' : 'sold out'}.`,
      });
    }
    return next;
  });
}

export function deleteProduct(id: string): void {
  let image: string | undefined;
  mutateDb((db) => {
    const ctx = requireStaff(db, 'menu.products');
    const product = removeScoped(db, 'products', ctx.scope, id, 'Product');
    image = product.image;
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'menu',
      action: 'Product deleted',
      targetId: id,
      targetLabel: product.title,
      details: `Removed “${product.title}” from the menu.`,
    });
  });
  deleteImage(image);
}
