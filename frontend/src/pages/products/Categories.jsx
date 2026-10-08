import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Eye, EyeOff, FolderPlus, FolderTree, Pencil, Plus, Search, Tag, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, cx, useConfirm, useToast,
} from '../../components/ui';

export default function Categories() {
  const t = useT();
  const { can } = useAuth();
  const canCats = can('categories.manage');
  const canBrands = can('brands.manage');
  const [tab, setTab] = useState(canCats ? 'categories' : 'brands');

  const tabs = [
    canCats && { key: 'categories', label: t('Categories'), icon: FolderTree },
    canBrands && { key: 'brands', label: t('Brands'), icon: Tag },
  ].filter(Boolean);

  return (
    <Page>
      <PageHeader title={t('Categories & brands')} subtitle={t('Put your items into groups, so they are easy to find when selling and in reports.')} />
      {tabs.length > 1 && (
        <div className="mb-4 flex gap-1 rounded-lg bg-slate-200/60 p-1 sm:w-fit">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cx('flex flex-1 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-base font-medium transition-colors sm:flex-none',
                tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
            >
              <Icon className="size-5" />{label}
            </button>
          ))}
        </div>
      )}
      <div className="max-w-4xl">
        {tab === 'categories' && canCats && <CategoriesPanel />}
        {tab === 'brands' && canBrands && <BrandsPanel />}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- categories

function buildTree(rows) {
  const byParent = new Map();
  for (const c of rows) {
    const k = c.parent_id ?? 0;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(c);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(rows.map((c) => c.id));
  // Orphans (parent deleted) are shown at the top level.
  const roots = rows.filter((c) => !c.parent_id || !ids.has(c.parent_id)).sort((a, b) => a.name.localeCompare(b.name));
  return { roots, children: (id) => byParent.get(id) || [] };
}

function descendantIds(tree, id) {
  const out = new Set();
  const walk = (x) => tree.children(x).forEach((c) => { out.add(c.id); walk(c.id); });
  walk(id);
  return out;
}

function CategoriesPanel() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories'), select: (r) => r?.data || [] });
  const rows = useMemo(() => list.data || [], [list.data]);
  const tree = useMemo(() => buildTree(rows), [rows]);
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // { category } | { parent_id } for new
  const [blocked, setBlocked] = useState(null); // { category, message }

  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] });

  const toggleActive = async (c) => {
    try {
      await api.patch(`/categories/${c.id}`, { is_active: !c.is_active });
      refresh();
      toast(c.is_active ? t('{name} is now hidden', { name: c.name }) : t('{name} is shown again', { name: c.name }));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (c) => {
    if (!(await confirm({ title: t('Delete “{name}”?', { name: c.name }), message: t('This category will be removed. The items in it are not deleted.'), danger: true, confirmLabel: t('Delete') }))) return;
    try {
      await api.del(`/categories/${c.id}`);
      refresh();
      toast(t('Category deleted'));
    } catch (err) {
      setBlocked({ category: c, message: err.message });
    }
  };

  const term = filter.trim().toLowerCase();
  const matches = (c) => c.name.toLowerCase().includes(term);
  const visible = (c) => !term || matches(c) || [...descendantIds(tree, c.id)].some((id) => matches(rows.find((r) => r.id === id)));

  const renderNode = (c, depth) => {
    if (!visible(c)) return null;
    const kids = tree.children(c.id);
    const open = term || !collapsed.has(c.id);
    return (
      <div key={c.id}>
        <div className="group flex items-center gap-2 border-b border-slate-100 py-3 pe-3 hover:bg-slate-50" style={{ paddingInlineStart: `${12 + depth * 28}px` }}>
          {kids.length ? (
            <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label={open ? t('Hide sub-categories') : t('Show sub-categories')} title={open ? t('Hide sub-categories') : t('Show sub-categories')}
              onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}>
              {open ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5 rtl:rotate-180" />}
            </button>
          ) : <span className="w-8" />}
          <div className={cx('min-w-0 flex-1', !c.is_active && 'opacity-60')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx('truncate text-base', depth === 0 ? 'font-semibold text-slate-900' : 'text-slate-800')}>{c.name}</span>
              {!c.is_active && <Badge>{t('Hidden')}</Badge>}
            </div>
            <div className="text-xs text-slate-500">
              {itemCount(t, c.products_count)}
              {kids.length > 0 && ` · ${kids.length === 1 ? t('1 sub-category') : t('{n} sub-categories', { n: kids.length })}`}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            <IconBtn title={t('Add sub-category')} onClick={() => setEditing({ parent_id: c.id })} icon={FolderPlus} />
            <IconBtn title={t('Edit')} onClick={() => setEditing({ category: c })} icon={Pencil} />
            <IconBtn title={c.is_active ? t('Hide') : t('Show')} onClick={() => toggleActive(c)} icon={c.is_active ? EyeOff : Eye} />
            <IconBtn title={t('Delete')} danger onClick={() => remove(c)} icon={Trash2} />
          </div>
        </div>
        {open && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <Input className="ps-10 pe-10" placeholder={t('Find a category…')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          {filter && <button type="button" onClick={() => setFilter('')} className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t('Clear')} title={t('Clear')}><X className="size-5" /></button>}
        </div>
        <div className="flex-1" />
        <span className="text-sm text-slate-500">{rows.length === 1 ? t('1 category') : t('{n} categories', { n: rows.length })}</span>
        <Button icon={Plus} size="lg" onClick={() => setEditing({ parent_id: null })}>{t('Add category')}</Button>
      </div>
      {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
        <EmptyState icon={FolderTree} title={t('No categories yet')} action={<Button icon={Plus} size="lg" onClick={() => setEditing({ parent_id: null })}>{t('Add your first category')}</Button>}>
          {t('A category is a group of similar items, e.g. Drinks, Snacks, Mobile phones or Paint. A category can have smaller groups inside it (sub-categories).')}
        </EmptyState>
      ) : (
        <div>
          {tree.roots.map((c) => renderNode(c, 0))}
          {term && !tree.roots.some(visible) && <p className="px-4 py-8 text-center text-sm text-slate-500">{t('No category matches “{q}”.', { q: filter })}</p>}
        </div>
      )}

      {editing && <CategoryModal state={editing} rows={rows} tree={tree} onClose={() => setEditing(null)} onSaved={refresh} />}

      <Modal
        open={!!blocked}
        onClose={() => setBlocked(null)}
        size="sm"
        title={t('Can’t delete “{name}”', { name: blocked?.category.name })}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setBlocked(null)}>{t('OK')}</Button>
            {blocked?.category.is_active && <Button icon={EyeOff} onClick={() => { toggleActive(blocked.category); setBlocked(null); }}>{t('Hide it instead')}</Button>}
          </>
        )}
      >
        <ErrorBox error={{ message: blocked?.message }} />
        <p className="mt-3 text-sm text-slate-600">
          {t('First move its items (from the My items page) or its sub-categories to another category. Or hide it — a hidden category stays on old items and in reports, but is not offered for new items.')}
        </p>
      </Modal>
    </Card>
  );
}

const itemCount = (t, n) => (n === 1 ? t('1 item') : t('{n} items', { n: n ?? 0 }));

// Icon + text label (label hidden on small phones to save room).
function IconBtn({ title, danger, onClick, icon: Icon }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-500 transition-colors', danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-200 hover:text-slate-800')}>
      <Icon className="size-5 shrink-0" />
      <span className="hidden md:inline">{title}</span>
    </button>
  );
}

function CategoryModal({ state, rows, tree, onClose, onSaved }) {
  const t = useT();
  const toast = useToast();
  const existing = state.category;
  const [form, setForm] = useState({
    name: existing?.name || '',
    parent_id: existing ? (existing.parent_id ?? '') : (state.parent_id ?? ''),
    is_active: existing ? !!existing.is_active : true,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // A category can't move under itself or one of its own sub-categories.
  const blockedIds = existing ? new Set([existing.id, ...descendantIds(tree, existing.id)]) : new Set();
  const byId = Object.fromEntries(rows.map((c) => [c.id, c]));
  const pathOf = (c) => { const parts = [c.name]; let p = byId[c.parent_id]; let n = 0; while (p && n++ < 10) { parts.unshift(p.name); p = byId[p.parent_id]; } return parts.join(' › '); };
  const parents = rows.filter((c) => !blockedIds.has(c.id)).map((c) => ({ id: c.id, path: pathOf(c) })).sort((a, b) => a.path.localeCompare(b.path));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name: form.name.trim(), parent_id: form.parent_id ? Number(form.parent_id) : null, is_active: form.is_active };
    try {
      if (existing) await api.put(`/categories/${existing.id}`, body);
      else await api.post('/categories', body);
      toast(existing ? t('Category saved') : t('Category added'));
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const parentName = !existing && state.parent_id ? byId[state.parent_id]?.name : null;
  return (
    <Modal open onClose={onClose} size="sm" title={existing ? t('Edit category') : parentName ? t('New sub-category inside {name}', { name: parentName }) : t('New category')}
      footer={<><Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" size="lg" form="category-form" loading={busy}>{existing ? t('Save') : t('Add category')}</Button></>}>
      <form id="category-form" onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label={t('Category name')} required error={error?.errors?.name?.[0]}>
          <Input autoFocus required maxLength={255} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t('Put it inside')} hint={t('Leave it as “Main category” if it is not inside another one.')} error={error?.errors?.parent_id?.[0]}>
          <Select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
            <option value="">{t('Main category (not inside another)')}</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.path}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-5 rounded border-slate-300 accent-brand-600" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          {t('Shown — can be chosen when adding items')}
        </label>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- brands

function BrandsPanel() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ['brands'], queryFn: () => api.get('/brands'), select: (r) => r?.data || [] });
  const rows = list.data || [];
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null); // brand | {} for new
  const [blocked, setBlocked] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['brands'] });

  const toggleActive = async (b) => {
    try {
      await api.patch(`/brands/${b.id}`, { is_active: !b.is_active });
      refresh();
      toast(b.is_active ? t('{name} is now hidden', { name: b.name }) : t('{name} is shown again', { name: b.name }));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (b) => {
    if (!(await confirm({ title: t('Delete “{name}”?', { name: b.name }), message: t('This brand will be removed. Its items are not deleted.'), danger: true, confirmLabel: t('Delete') }))) return;
    try {
      await api.del(`/brands/${b.id}`);
      refresh();
      toast(t('Brand deleted'));
    } catch (err) {
      setBlocked({ brand: b, message: err.message });
    }
  };

  const term = filter.trim().toLowerCase();
  const shown = term ? rows.filter((b) => b.name.toLowerCase().includes(term)) : rows;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <Input className="ps-10 pe-10" placeholder={t('Find a brand…')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          {filter && <button type="button" onClick={() => setFilter('')} className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t('Clear')} title={t('Clear')}><X className="size-5" /></button>}
        </div>
        <div className="flex-1" />
        <span className="text-sm text-slate-500">{rows.length === 1 ? t('1 brand') : t('{n} brands', { n: rows.length })}</span>
        <Button icon={Plus} size="lg" onClick={() => setEditing({})}>{t('Add brand')}</Button>
      </div>
      {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
        <EmptyState icon={Tag} title={t('No brands yet')} action={<Button icon={Plus} size="lg" onClick={() => setEditing({})}>{t('Add your first brand')}</Button>}>
          {t('Brands are optional. Add the companies whose items you sell (e.g. Nestlé, Samsung, Dulux) to find items and reports by brand.')}
        </EmptyState>
      ) : !shown.length ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">{t('No brand matches “{q}”.', { q: filter })}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <div className={cx('grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700', !b.is_active && 'opacity-60')}>{b.name.slice(0, 1).toUpperCase()}</div>
              <div className={cx('min-w-0 flex-1', !b.is_active && 'opacity-60')}>
                <div className="flex items-center gap-2"><span className="truncate text-base font-medium text-slate-900">{b.name}</span>{!b.is_active && <Badge>{t('Hidden')}</Badge>}</div>
                <div className="text-xs text-slate-500">{itemCount(t, b.products_count)}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                <IconBtn title={t('Rename')} onClick={() => setEditing(b)} icon={Pencil} />
                <IconBtn title={b.is_active ? t('Hide') : t('Show')} onClick={() => toggleActive(b)} icon={b.is_active ? EyeOff : Eye} />
                <IconBtn title={t('Delete')} danger onClick={() => remove(b)} icon={Trash2} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <BrandModal brand={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={refresh} />}

      <Modal
        open={!!blocked}
        onClose={() => setBlocked(null)}
        size="sm"
        title={t('Can’t delete “{name}”', { name: blocked?.brand.name })}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setBlocked(null)}>{t('OK')}</Button>
            {blocked?.brand.is_active && <Button icon={EyeOff} onClick={() => { toggleActive(blocked.brand); setBlocked(null); }}>{t('Hide it instead')}</Button>}
          </>
        )}
      >
        <ErrorBox error={{ message: blocked?.message }} />
        <p className="mt-3 text-sm text-slate-600">{t('First change those items to another brand (or no brand). Or hide this brand, so it is not offered for new items.')}</p>
      </Modal>
    </Card>
  );
}

function BrandModal({ brand, onClose, onSaved }) {
  const t = useT();
  const toast = useToast();
  const [form, setForm] = useState({ name: brand?.name || '', is_active: brand ? !!brand.is_active : true });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name: form.name.trim(), is_active: form.is_active };
    try {
      if (brand) await api.put(`/brands/${brand.id}`, body);
      else await api.post('/brands', body);
      toast(brand ? t('Brand saved') : t('Brand added'));
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="sm" title={brand ? t('Edit brand') : t('New brand')}
      footer={<><Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" size="lg" form="brand-form" loading={busy}>{brand ? t('Save') : t('Add brand')}</Button></>}>
      <form id="brand-form" onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label={t('Brand name')} required error={error?.errors?.name?.[0]}>
          <Input autoFocus required maxLength={255} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-5 rounded border-slate-300 accent-brand-600" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          {t('Shown — can be chosen when adding items')}
        </label>
      </form>
    </Modal>
  );
}
