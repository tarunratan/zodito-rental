'use client';

import { useState, useMemo } from 'react';

type BikeOption = {
  id: string;
  registration_number: string | null;
  emoji: string;
  model: { display_name: string } | null;
};

type Expense = {
  id: string;
  bike_id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
  bike: BikeOption | null;
};

const CATEGORIES = ['bad_debt', 'damage', 'tyre', 'maintenance', 'repair', 'insurance', 'fuel', 'cleaning', 'parts', 'other'] as const;

const CAT_ICONS: Record<string, string> = {
  bad_debt: '💀', damage: '💥', tyre: '🔄', maintenance: '🔧', repair: '🛠️',
  insurance: '📋', fuel: '⛽', cleaning: '🧽', parts: '⚙️', other: '📝',
};

const CAT_LABELS: Record<string, string> = {
  bad_debt: 'Bad Debt / Write-off', damage: 'Damage / Accident',
  tyre: 'Tyre / Tube', maintenance: 'Maintenance', repair: 'Repair',
  insurance: 'Insurance', fuel: 'Fuel', cleaning: 'Cleaning', parts: 'Parts', other: 'Other',
};

const EMPTY_FORM = {
  bike_id: '',
  category: 'maintenance' as typeof CATEGORIES[number],
  description: '',
  amount: '',
  expense_date: new Date().toISOString().split('T')[0],
  notes: '',
};

function rupee(n: number) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function pct(a: number, b: number) {
  if (!b) return '0%';
  return `${((a / b) * 100).toFixed(1)}%`;
}

function bikeName(bike: BikeOption | null) {
  if (!bike) return '—';
  return `${bike.emoji} ${bike.model?.display_name ?? 'Bike'}${bike.registration_number ? ` (${bike.registration_number})` : ''}`;
}

export function ExpensesManager({ initialExpenses, bikes }: { initialExpenses: Expense[]; bikes: BikeOption[] }) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterBike, setFilterBike] = useState('all');
  const [filterCat, setFilterCat] = useState('all');

  function upd<K extends keyof typeof form>(k: K, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const filtered = expenses.filter(e => {
    if (filterBike !== 'all' && e.bike_id !== filterBike) return false;
    if (filterCat !== 'all' && e.category !== filterCat) return false;
    return true;
  });

  const totalFiltered = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const bikeSummary = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    for (const e of expenses) {
      if (!map[e.bike_id]) map[e.bike_id] = { name: bikeName(e.bike), total: 0 };
      map[e.bike_id].total += Number(e.amount);
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [expenses]);

  const catSummary = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) map[e.category] = (map[e.category] ?? 0) + Number(e.amount);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const grandTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);

  async function save() {
    if (!form.bike_id || !form.description.trim() || !form.amount) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bike_id: form.bike_id,
          category: form.category,
          description: form.description.trim(),
          amount: parseFloat(form.amount),
          expense_date: form.expense_date,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      if (data.expense) {
        const bike = bikes.find(b => b.id === form.bike_id) ?? null;
        setExpenses(prev => [{ ...data.expense, bike }, ...prev]);
      }
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    const res = await fetch(`/api/admin/expenses/${id}`, { method: 'DELETE' });
    if (res.ok) setExpenses(prev => prev.filter(e => e.id !== id));
    setDeleteId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Bike Expenses</h2>
          <p className="text-sm text-muted">Track maintenance, repairs, and other costs per bike</p>
        </div>
        <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setError(null); }}
          className="btn-accent text-sm px-4 py-2">
          + Add Expense
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted uppercase mb-1">Total Expenses</p>
          <p className="text-xl font-bold text-red-500">{rupee(grandTotal)}</p>
          <p className="text-xs text-muted">{expenses.length} records</p>
        </div>
        {catSummary.slice(0, 3).map(([cat, total]) => (
          <div key={cat} className="card p-4">
            <p className="text-xs font-semibold text-muted uppercase mb-1">{CAT_ICONS[cat]} {cat}</p>
            <p className="text-xl font-bold">{rupee(total)}</p>
            <p className="text-xs text-muted">{pct(total, grandTotal)} of total</p>
          </div>
        ))}
      </div>

      {bikeSummary.length > 0 && (
        <div className="card p-5 mb-6">
          <h3 className="font-semibold mb-3">By Bike</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {bikeSummary.slice(0, 8).map(([bikeId, { name, total }]) => (
              <div key={bikeId} className="p-3 bg-bg rounded-lg">
                <p className="text-xs font-medium truncate">{name}</p>
                <p className="font-semibold text-red-500">{rupee(total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterBike} onChange={e => setFilterBike(e.target.value)} className="input-field py-1.5 text-sm w-auto">
          <option value="all">All Bikes</option>
          {bikes.map(b => <option key={b.id} value={b.id}>{bikeName(b)}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="input-field py-1.5 text-sm w-auto">
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
        </select>
        {(filterBike !== 'all' || filterCat !== 'all') && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>Filtered total:</span>
            <span className="font-semibold text-red-500">{rupee(totalFiltered)}</span>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">No expenses recorded yet. Add your first one!</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Bike</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Description</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-bg/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted">
                      {new Date(e.expense_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-3 text-xs">{bikeName(e.bike)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-border/60 px-2 py-0.5 rounded-full capitalize">
                        {CAT_ICONS[e.category]} {e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{e.description}</div>
                      {e.notes && <div className="text-xs text-muted">{e.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-500">{rupee(Number(e.amount))}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDeleteId(e.id)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-bg/60">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-right text-muted">
                    {filtered.length !== expenses.length ? 'Filtered Total' : 'Grand Total'}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-500 text-sm">{rupee(totalFiltered)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-md my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-lg">Add Expense</h3>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-primary text-xl leading-none">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted block mb-1">Bike *</label>
                <select value={form.bike_id} onChange={e => upd('bike_id', e.target.value)} className="input-field w-full">
                  <option value="">Select bike…</option>
                  {bikes.map(b => <option key={b.id} value={b.id}>{bikeName(b)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Category *</label>
                  <select value={form.category} onChange={e => upd('category', e.target.value)} className="input-field w-full">
                    {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {CAT_LABELS[c] ?? c}</option>)}
                  </select>
                  {(form.category === 'bad_debt' || form.category === 'damage') && (
                    <p className="text-[11px] text-amber-600 bg-amber-50 rounded px-2 py-1 mt-1">
                      ⚠️ Financial write-off — include booking number in description
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Date *</label>
                  <input type="date" value={form.expense_date} onChange={e => upd('expense_date', e.target.value)} className="input-field w-full" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1">Description *</label>
                <input value={form.description} onChange={e => upd('description', e.target.value)} className="input-field w-full" placeholder="e.g. Front tyre replacement" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1">Amount (₹) *</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={e => upd('amount', e.target.value)} className="input-field w-full" placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => upd('notes', e.target.value)} className="input-field w-full h-16 resize-none" placeholder="Additional details (optional)" />
              </div>
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
              <button onClick={save} disabled={!form.bike_id || !form.description.trim() || !form.amount || saving}
                className="btn-accent px-5 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Saving…' : 'Save Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-primary rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold">Delete expense?</h3>
            <p className="text-sm text-muted">This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="border border-border rounded-lg hover:bg-border/40 text-sm px-4 py-2">Cancel</button>
              <button onClick={() => del(deleteId)} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
