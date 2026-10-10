// Recipe of one dish (restaurants): which kitchen items go into ONE plate
// and how much of each. Selling the dish takes these off Kitchen stock.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { money, qty } from '../lib/format';
import { Button, Input, Loading, Select, cx, useToast } from './ui';
import { IngredientForm, LevelBadge, unitLabel } from '../pages/kitchen/KitchenStock';

export default function RecipeEditor({ variants, canEdit }) {
  const t = useT();
  const [vid, setVid] = useState(variants[0]?.id);
  useEffect(() => { if (!variants.some((v) => v.id === vid)) setVid(variants[0]?.id); }, [variants, vid]);
  const label = (v) => [v.color, v.size].filter(Boolean).join(' · ') || t('Standard');
  return (
    <div className="rounded-2xl border border-slate-900/10 bg-slate-500/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900"><ChefHat className="size-5 text-brand-700" />{t('Recipe — what goes into one plate')}</h3>
          <p className="text-xs text-slate-500">{t('Each time this dish is sold, these amounts are taken off Kitchen stock.')}</p>
        </div>
        <Link to="/kitchen-stock" className="text-sm font-semibold text-brand-700 hover:underline">{t('Open Kitchen stock')}</Link>
      </div>
      {variants.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {variants.map((v) => (
            <button key={v.id} type="button" onClick={() => setVid(v.id)} className={cx('rounded-full px-3 py-1.5 text-sm font-semibold', vid === v.id ? 'bg-brand-600 text-brand-ink' : 'bg-slate-500/10 text-slate-600')}>{label(v)}</button>
          ))}
        </div>
      )}
      {vid && <VariantRecipe key={vid} variantId={vid} canEdit={canEdit} />}
    </div>
  );
}

function VariantRecipe({ variantId, canEdit }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const recipe = useQuery({ queryKey: ['recipe', variantId], queryFn: () => api.get(`/product-variants/${variantId}/recipe`) });
  const ingredients = useQuery({ queryKey: ['ingredients', '', ''], queryFn: () => api.get('/ingredients') });
  const [rows, setRows] = useState(null);
  const [useAsCost, setUseAsCost] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(null); // row index waiting for a new ingredient

  useEffect(() => {
    if (recipe.data && rows === null) setRows(recipe.data.data.map((r) => ({ ingredient_id: String(r.ingredient_id), quantity: String(r.quantity) })));
  }, [recipe.data, rows]);

  const list = ingredients.data?.data || [];
  const byId = useMemo(() => Object.fromEntries(list.map((i) => [String(i.id), i])), [list]);
  if (recipe.isLoading || ingredients.isLoading || rows === null) return <Loading />;

  const saved = JSON.stringify(recipe.data.data.map((r) => [String(r.ingredient_id), Number(r.quantity)]));
  const current = JSON.stringify(rows.filter((r) => r.ingredient_id && Number(r.quantity) > 0).map((r) => [r.ingredient_id, Number(r.quantity)]));
  const dirty = saved !== current;
  const cost = rows.reduce((a, r) => a + (byId[r.ingredient_id]?.cost_per_unit || 0) * Number(r.quantity || 0), 0);
  const price = recipe.data.selling_price || 0;
  const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : null;
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const used = new Set(rows.map((r) => r.ingredient_id));

  const save = async () => {
    setBusy(true);
    try {
      const items = rows.filter((r) => r.ingredient_id && Number(r.quantity) > 0).map((r) => ({ ingredient_id: Number(r.ingredient_id), quantity: Number(r.quantity) }));
      await api.put(`/product-variants/${variantId}/recipe`, { items, use_as_cost: useAsCost });
      await qc.invalidateQueries({ queryKey: ['recipe', variantId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setRows(null);
      toast(t('Recipe saved'));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {!list.length ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('No kitchen items yet.')} {canEdit && <button type="button" className="font-semibold underline" onClick={() => setAdding(-1)}>{t('Add one now')}</button>}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const ing = byId[r.ingredient_id];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/70 p-2 ring-1 ring-slate-900/5">
                <div className="min-w-48 flex-1">
                  <Select disabled={!canEdit} value={r.ingredient_id} onChange={(e) => (e.target.value === '__new' ? setAdding(i) : setRow(i, 'ingredient_id', e.target.value))}>
                    <option value="">{t('Choose a kitchen item…')}</option>
                    {list.filter((x) => x.is_active || String(x.id) === r.ingredient_id).map((x) => (
                      <option key={x.id} value={String(x.id)} disabled={used.has(String(x.id)) && String(x.id) !== r.ingredient_id}>{x.name} ({unitLabel(t, x.unit)})</option>
                    ))}
                    {canEdit && <option value="__new">+ {t('Add a new kitchen item…')}</option>}
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Input disabled={!canEdit} type="number" min="0" step="any" inputMode="decimal" className="w-28 text-end" value={r.quantity} onChange={(e) => setRow(i, 'quantity', e.target.value)} placeholder="0" aria-label={t('Amount per plate')} />
                  <span className="w-14 text-sm text-slate-500">{ing ? unitLabel(t, ing.unit) : ''}</span>
                </div>
                <span className="num w-24 text-end text-sm text-slate-600">{ing ? money(ing.cost_per_unit * Number(r.quantity || 0)) : ''}</span>
                {ing && <LevelBadge level={ing.level} />}
                {canEdit && <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t('Remove')}><Trash2 className="size-4" /></button>}
              </div>
            );
          })}
          {canEdit && <Button variant="secondary" size="sm" icon={Plus} onClick={() => setRows((rs) => [...rs, { ingredient_id: '', quantity: '' }])}>{t('Add an ingredient')}</Button>}
        </div>
      )}

      <div className="mt-4 grid gap-3 rounded-xl bg-white/70 p-3 ring-1 ring-slate-900/5 sm:grid-cols-3">
        <div><div className="text-xs text-slate-500">{t('Cost per plate')}</div><div className="num text-lg font-bold text-slate-900">{money(cost)}</div></div>
        <div><div className="text-xs text-slate-500">{t('Selling price')}</div><div className="num text-lg font-bold text-slate-900">{money(price)}</div></div>
        <div><div className="text-xs text-slate-500">{t('Profit per plate')}</div><div className={cx('num text-lg font-bold', price - cost >= 0 ? 'text-emerald-700' : 'text-red-600')}>{money(price - cost)}{margin != null && <span className="ms-1 text-sm font-semibold">({margin}%)</span>}</div></div>
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="size-4 accent-brand-600" checked={useAsCost} onChange={(e) => setUseAsCost(e.target.checked)} />{t('Use the recipe cost as this dish\'s cost (for profit reports)')}</label>
          <Button loading={busy} disabled={!dirty} onClick={save}>{t('Save recipe')}</Button>
        </div>
      )}
      {list.length > 0 && rows.length === 0 && <p className="mt-2 text-sm text-slate-500">{t('No recipe yet — this dish does not use kitchen stock. Add the ingredients it is made from.')}</p>}

      {adding !== null && (
        <IngredientForm
          onClose={() => setAdding(null)}
          onSaved={(ing) => {
            qc.invalidateQueries({ queryKey: ['ingredients'] });
            if (adding >= 0) setRow(adding, 'ingredient_id', String(ing.id));
            else setRows((rs) => [...rs, { ingredient_id: String(ing.id), quantity: '' }]);
          }}
        />
      )}
    </div>
  );
}
