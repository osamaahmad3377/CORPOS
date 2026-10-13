// Table reservations: a day at a time. Book a table for a time, then seat
// the guests when they arrive (that opens their order on the table), or mark
// them no-show / cancelled. A table can't be double-booked.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarClock, CalendarX, ChevronLeft, ChevronRight, Clock, MoreHorizontal, Pencil, Phone, Plus, StickyNote, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { Page } from '../../components/Layout';
import DownloadMenu from '../../components/DownloadMenu';
import { toNumber } from '../../lib/download';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, StatCard, Textarea, cx, useConfirm, useToast } from '../../components/ui';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const clock = (iso) => new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' });
const STATUS = {
  booked: ['Booked', 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200'],
  seated: ['Seated', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200'],
  done: ['Finished', 'bg-slate-500/10 text-slate-600'],
  cancelled: ['Cancelled', 'bg-slate-500/10 text-slate-500 line-through'],
  no_show: ['No-show', 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200'],
};

export default function Reservations() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = ymd(new Date());
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState(null); // {} = new
  const [menu, setMenu] = useState(null); // reservation id with the "more" menu open
  const day = useQuery({ queryKey: ['reservations', 'day', date], queryFn: () => api.get('/reservations', { date }), placeholderData: (p) => p });
  const list = day.data?.data || [];
  const stats = day.data?.stats;
  const refresh = () => qc.invalidateQueries({ queryKey: ['reservations'] });

  // group by hour so a busy evening reads like a timeline
  const groups = useMemo(() => {
    const g = [];
    for (const r of list) {
      const h = new Date(r.reserved_for).getHours();
      if (!g.length || g[g.length - 1].h !== h) g.push({ h, items: [] });
      g[g.length - 1].items.push(r);
    }
    return g;
  }, [list]);

  const setStatus = async (r, status) => {
    setMenu(null);
    try {
      await api.post(`/reservations/${r.id}/status`, { status });
      refresh();
      if (status === 'seated' && r.table_no) {
        toast(t('{name} seated — take their order', { name: r.name }));
        navigate(`/pos?table=${encodeURIComponent(r.table_no)}${r.notes ? `&note=${encodeURIComponent(r.notes)}` : ''}`);
      }
    } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (r) => {
    setMenu(null);
    if (!(await confirm({ title: t('Delete this reservation?'), message: t('{name} at {time}. Use Cancel instead to keep a record.', { name: r.name, time: clock(r.reserved_for) }), danger: true, confirmLabel: t('Delete') }))) return;
    try { await api.del(`/reservations/${r.id}`); refresh(); } catch (e) { toast(e.message, 'error'); }
  };

  const dayLabel = (s) => {
    if (s === today) return t('Today');
    if (s === addDays(today, 1)) return t('Tomorrow');
    if (s === addDays(today, -1)) return t('Yesterday');
    return new Date(`${s}T12:00:00`).toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'short' });
  };
  const now = Date.now();

  return (
    <Page>
      <PageHeader
        title={t('Reservations')}
        subtitle={t('Book tables ahead. Booked tables show as “Reserved” on the Orders & tables screen before the guests arrive.')}
        actions={(
          <>
            <DownloadMenu size="lg" fileName={`reservations-${date}`} dated={false} sheet="Reservations" rows={list} columns={[
              { en: 'Time', value: (r) => String(r.reserved_for || '').replace('T', ' ').slice(0, 16) },
              { en: 'Name', value: (r) => r.name },
              { en: 'Phone', value: (r) => r.phone },
              { en: 'Guests', value: (r) => toNumber(r.guests) },
              { en: 'Table', value: (r) => r.table_no },
              { en: 'Minutes', value: (r) => toNumber(r.duration_minutes) },
              { en: 'Status', value: (r) => r.status },
              { en: 'Notes', value: (r) => r.notes },
            ]} />
            <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('New reservation')}</Button>
          </>
        )}
      />

      {/* day picker: arrows, today, and the next 7 days with their booking counts */}
      <Card className="mb-6 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={ChevronLeft} onClick={() => setDate(addDays(date, -1))} aria-label={t('Previous day')} className="rtl:[&_svg]:rotate-180" />
          <div className="min-w-44 flex-1 text-center sm:flex-none">
            <div className="text-lg font-bold text-slate-900">{dayLabel(date)}</div>
            <div className="num text-xs text-slate-500">{new Date(`${date}T12:00:00`).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <Button variant="secondary" icon={ChevronRight} onClick={() => setDate(addDays(date, 1))} aria-label={t('Next day')} className="rtl:[&_svg]:rotate-180" />
          {date !== today && <Button variant="ghost" onClick={() => setDate(today)}>{t('Today')}</Button>}
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="num h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-xs" aria-label={t('Pick a date')} />
          <div className="flex flex-1 justify-end gap-1.5 overflow-x-auto">
            {Object.entries(day.data?.week || {}).map(([d, n]) => (
              <button key={d} type="button" onClick={() => setDate(d)} className={cx('flex min-w-12 flex-col items-center rounded-xl px-2 py-1.5 text-xs transition', d === date ? 'bg-brand-600 text-brand-ink' : 'bg-slate-500/[0.06] text-slate-600 hover:bg-slate-500/10')}>
                <span className="font-semibold">{new Date(`${d}T12:00:00`).toLocaleDateString('en-PK', { weekday: 'short' })}</span>
                <span className="num text-sm font-bold">{new Date(`${d}T12:00:00`).getDate()}</span>
                <span className={cx('num mt-0.5 h-4 min-w-4 rounded-full px-1 text-[10px] font-bold leading-4', n ? (d === date ? 'bg-white/25' : 'bg-amber-500 text-white') : 'opacity-0')}>{n}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={CalendarClock} label={t('Bookings')} value={<span className="num">{stats.bookings}</span>} />
          <StatCard icon={Users} tone="amber" label={t('Guests expected')} value={<span className="num">{stats.guests}</span>} />
          <StatCard icon={CalendarCheck} tone="green" label={t('Seated')} value={<span className="num">{stats.seated}</span>} sub={stats.waiting ? t('{n} still to come', { n: stats.waiting }) : null} />
          <StatCard icon={CalendarX} tone="red" label={t('No-show / cancelled')} value={<span className="num">{stats.no_show + stats.cancelled}</span>} />
        </div>
      )}

      <Card>
        {day.isLoading ? <Loading /> : day.error ? <div className="p-4"><ErrorBox error={day.error} /></div> : !list.length ? (
          <EmptyState icon={CalendarClock} title={t('No reservations on this day')} action={<Button icon={Plus} size="lg" onClick={() => setEditing({})}>{t('New reservation')}</Button>}>
            {t('When a customer calls to book a table, add it here.')}
          </EmptyState>
        ) : (
          <div className="divide-y divide-slate-900/[0.06]">
            {groups.map((g) => (
              <div key={g.h} className="flex gap-4 px-4 py-3 sm:px-5">
                <div className="num w-16 shrink-0 pt-3 text-sm font-bold text-slate-400">{clock(`2000-01-01T${pad(g.h)}:00:00`)}</div>
                <div className="grid min-w-0 flex-1 gap-2 lg:grid-cols-2">
                  {g.items.map((r) => {
                    const [label, tone] = STATUS[r.status] || STATUS.booked;
                    const late = r.status === 'booked' && now > new Date(r.reserved_for).getTime() + 15 * 60000;
                    const soon = r.status === 'booked' && !late && new Date(r.reserved_for).getTime() - now < 60 * 60000 && new Date(r.reserved_for).getTime() > now - 15 * 60000;
                    const faded = ['cancelled', 'no_show', 'done'].includes(r.status);
                    return (
                      <div key={r.id} className={cx('glass-tile relative rounded-2xl p-3.5', faded && 'opacity-60', late && 'ring-2 ring-red-400/70', soon && 'ring-2 ring-amber-400/70')}>
                        <div className="flex items-start gap-3">
                          <div className={cx('grid size-12 shrink-0 place-items-center rounded-xl text-center', r.table_no ? 'bg-brand-600 text-brand-ink' : 'border-2 border-dashed border-slate-300 text-slate-400')}>
                            {r.table_no ? <span className="num text-lg font-extrabold leading-none">{r.table_no}</span> : <span className="text-[10px] font-semibold leading-tight">{t('No table')}</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-base font-bold text-slate-900">{r.name}</span>
                              <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', late ? 'bg-red-500 text-white' : tone)}>{late ? t('Late') : t(label)}</span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                              <span className="flex items-center gap-1"><Clock className="size-3.5" /><span className="num">{clock(r.reserved_for)} – {clock(r.ends_at)}</span></span>
                              <span className="flex items-center gap-1"><Users className="size-3.5" />{t('{n} guests', { n: r.guests })}</span>
                              {r.phone && <a href={`tel:${r.phone}`} className="num flex items-center gap-1 hover:text-brand-700" dir="ltr"><Phone className="size-3.5" />{r.phone}</a>}
                            </div>
                            {r.notes && <div className="mt-1.5 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-200"><StickyNote className="mt-0.5 size-3.5 shrink-0" />{r.notes}</div>}
                          </div>
                          <button type="button" onClick={() => setMenu(menu === r.id ? null : r.id)} className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-500/10 hover:text-slate-700" aria-label={t('More')}><MoreHorizontal className="size-5" /></button>
                        </div>
                        {r.status === 'booked' && (
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="success" icon={UserCheck} className="flex-1" onClick={() => (r.table_no ? setStatus(r, 'seated') : setEditing({ ...r, seatAfter: true }))}>{t('Guests arrived — seat')}</Button>
                            <Button size="sm" variant="secondary" icon={UserX} onClick={() => setStatus(r, 'no_show')}>{t('No-show')}</Button>
                          </div>
                        )}
                        {r.status === 'seated' && (
                          <div className="mt-3 flex gap-2">
                            {r.table_no && <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate(`/pos?table=${encodeURIComponent(r.table_no)}`)}>{t('Open table {n}', { n: r.table_no })}</Button>}
                            <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'done')}>{t('Finished')}</Button>
                          </div>
                        )}
                        {menu === r.id && (
                          <div className="glass-strong absolute end-3 top-12 z-20 w-48 animate-pop-in overflow-hidden rounded-xl p-1 text-sm">
                            <MenuItem icon={Pencil} onClick={() => { setMenu(null); setEditing(r); }}>{t('Edit')}</MenuItem>
                            {r.status !== 'booked' && <MenuItem icon={CalendarClock} onClick={() => setStatus(r, 'booked')}>{t('Back to booked')}</MenuItem>}
                            {r.status === 'booked' && <MenuItem icon={CalendarX} onClick={() => setStatus(r, 'cancelled')}>{t('Cancel booking')}</MenuItem>}
                            <MenuItem icon={Trash2} danger onClick={() => remove(r)}>{t('Delete')}</MenuItem>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <ReservationForm
          reservation={editing.id ? editing : null}
          date={date}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            refresh();
            if (r.reserved_for.slice(0, 10) !== date) setDate(r.reserved_for.slice(0, 10));
            if (editing.seatAfter && r.table_no) setStatus(r, 'seated');
          }}
        />
      )}
    </Page>
  );
}

function MenuItem({ icon: Icon, danger, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start font-medium transition', danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-500/10')}>
      <Icon className="size-4" />{children}
    </button>
  );
}

function ReservationForm({ reservation, date, onClose, onSaved }) {
  const t = useT();
  const toast = useToast();
  const shop = useShop();
  const r = reservation;
  const nextHalfHour = () => { const d = new Date(Date.now() + 30 * 60000); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const [f, setF] = useState({
    name: r?.name || '',
    phone: r?.phone || '',
    guests: String(r?.guests || 2),
    day: r ? r.reserved_for.slice(0, 10) : date,
    time: r ? r.reserved_for.slice(11, 16) : (date === ymd(new Date()) ? nextHalfHour() : '19:00'),
    duration: String(r?.duration_minutes || shop.reservationMinutes),
    table_no: r?.table_no || '',
    notes: r?.notes || '',
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  // which tables are taken at this time (from that day's bookings)
  const dayList = useQuery({ queryKey: ['reservations', 'day', f.day], queryFn: () => api.get('/reservations', { date: f.day }), enabled: !!f.day });
  const start = new Date(`${f.day}T${f.time || '00:00'}:00`).getTime();
  const end = start + Number(f.duration || 90) * 60000;
  const taken = useMemo(() => {
    const m = {};
    for (const o of dayList.data?.data || []) {
      if (o.id === r?.id || !o.table_no || !['booked', 'seated'].includes(o.status)) continue;
      if (new Date(o.reserved_for).getTime() < end && new Date(o.ends_at).getTime() > start) m[o.table_no.toLowerCase()] = o;
    }
    return m;
  }, [dayList.data, start, end, r?.id]);
  const allTables = shop.tableAreas.flatMap((a) => a.tables.map((tb) => ({ ...tb, area: a.name })));
  const guests = Number(f.guests || 0);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), phone: f.phone.trim() || null, guests, reserved_for: `${f.day}T${f.time}`, duration_minutes: Number(f.duration), table_no: f.table_no || null, notes: f.notes.trim() || null };
      return r ? api.put(`/reservations/${r.id}`, body) : api.post('/reservations', body);
    },
    onSuccess: (res) => { toast(r ? t('Saved') : t('Booked {name} for {time}', { name: f.name.trim(), time: clock(res.data.reserved_for) })); onSaved(res.data); onClose(); },
    onError: setError,
  });

  return (
    <Modal open onClose={onClose} size="lg" title={r ? t('Edit reservation') : t('New reservation')}
      footer={<><Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button><Button size="lg" icon={CalendarCheck} loading={save.isPending} disabled={!f.name.trim() || !f.day || !f.time || guests < 1} onClick={() => save.mutate()}>{r ? t('Save') : t('Book table')}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <ErrorBox error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Customer name')} required><Input autoFocus value={f.name} onChange={set('name')} placeholder={t('e.g. Sara Ahmed')} /></Field>
          <Field label={t('Phone')}><Input type="tel" dir="ltr" value={f.phone} onChange={set('phone')} placeholder="03xx-xxxxxxx" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label={t('Date')} required><Input type="date" value={f.day} onChange={set('day')} /></Field>
          <Field label={t('Time')} required><Input type="time" step="900" value={f.time} onChange={set('time')} /></Field>
          <Field label={t('Guests')} required>
            <div className="flex items-center gap-1" dir="ltr">
              <button type="button" onClick={() => setF((x) => ({ ...x, guests: String(Math.max(1, Number(x.guests || 1) - 1)) }))} className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50">−</button>
              <Input type="number" min="1" max="999" className="num text-center" value={f.guests} onChange={set('guests')} />
              <button type="button" onClick={() => setF((x) => ({ ...x, guests: String(Number(x.guests || 0) + 1) }))} className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50">+</button>
            </div>
          </Field>
          <Field label={t('Stays for')}>
            <Select value={f.duration} onChange={set('duration')}>
              {[...new Set([60, 90, 120, 150, 180, 240, Number(f.duration)])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m < 60 ? t('{n} min', { n: m }) : m % 60 ? t('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 }) : t('{n} hours', { n: m / 60 })}</option>)}
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{t('Table')}</span>
            <span className="text-xs text-slate-500">{t('Grey tables are booked at this time')}</span>
          </div>
          {allTables.length === 0 ? <p className="rounded-xl bg-slate-500/[0.06] p-3 text-sm text-slate-500">{t('No tables set. Add tables in Settings → Restaurant.')}</p> : (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-900/10 p-2">
              <button type="button" onClick={() => setF((x) => ({ ...x, table_no: '' }))} className={cx('mb-2 w-full rounded-lg border-2 border-dashed px-3 py-1.5 text-start text-sm font-semibold', !f.table_no ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500')}>{t('Choose the table later')}</button>
              {shop.tableAreas.filter((a) => a.tables.length).map((a, ai) => (
                <div key={ai} className="mb-2">
                  {a.name && <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{a.name}</div>}
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {a.tables.map((tb) => {
                      const no = String(tb.no);
                      const busy = taken[no.toLowerCase()];
                      const small = Number(tb.seats) > 0 && guests > Number(tb.seats);
                      const on = f.table_no.toLowerCase() === no.toLowerCase();
                      return (
                        <button key={no} type="button" disabled={!!busy} title={busy ? t('Booked {from} for {name}', { from: clock(busy.reserved_for), name: busy.name }) : small ? t('Only {n} seats', { n: tb.seats }) : ''}
                          onClick={() => setF((x) => ({ ...x, table_no: no }))}
                          className={cx('flex flex-col items-center rounded-lg border-2 px-1 py-1.5 transition disabled:cursor-not-allowed', on ? 'border-brand-600 bg-brand-600 text-brand-ink' : busy ? 'border-transparent bg-slate-500/10 text-slate-400 line-through' : small ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-800 hover:border-brand-400')}>
                          <span className="num text-sm font-extrabold leading-tight">{no}</span>
                          {Number(tb.seats) > 0 && <span className="num flex items-center gap-0.5 text-[10px] opacity-75"><Users className="size-2.5" />{tb.seats}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(() => { const tb = allTables.find((x) => String(x.no).toLowerCase() === f.table_no.toLowerCase()); return tb && Number(tb.seats) > 0 && guests > Number(tb.seats) ? <p className="mt-1.5 text-sm text-amber-700">{t('Table {n} has {s} seats for {g} guests — add chairs or pick a bigger table.', { n: tb.no, s: tb.seats, g: guests })}</p> : null; })()}
        </div>

        <Field label={t('Note (optional)')}><Textarea rows={2} value={f.notes} onChange={set('notes')} placeholder={t('e.g. Birthday cake at 9, high chair, window seat')} /></Field>
      </form>
    </Modal>
  );
}
