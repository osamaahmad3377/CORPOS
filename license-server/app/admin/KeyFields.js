'use client';

/** Shared form fields for creating / editing a key. `values` + `onChange(name, value)`. */
export default function KeyFields({ values, onChange }) {
  const bind = (name) => ({
    name,
    value: values[name] ?? '',
    onChange: (e) => onChange(name, e.target.value),
  });
  return (
    <div className="grid">
      <label className="field span2">
        <span>Shop name *</span>
        <input required maxLength={200} {...bind('shop_name')} />
      </label>
      <label className="field">
        <span>Owner name</span>
        <input maxLength={200} {...bind('owner_name')} />
      </label>
      <label className="field">
        <span>Phone</span>
        <input type="tel" maxLength={50} {...bind('phone')} />
      </label>
      <label className="field">
        <span>City</span>
        <input maxLength={100} {...bind('city')} />
      </label>
      <label className="field">
        <span>Plan</span>
        <input maxLength={50} list="plan-options" {...bind('plan')} />
        <datalist id="plan-options">
          <option value="standard" />
          <option value="pro" />
          <option value="trial" />
        </datalist>
      </label>
      <label className="field">
        <span>Max activations (computers)</span>
        <input type="number" min={1} max={1000} required {...bind('max_activations')} />
      </label>
      <label className="field">
        <span>Offline lease (days)</span>
        <input type="number" min={1} max={3650} required {...bind('lease_days')} />
      </label>
      <label className="field">
        <span>Expires on (empty = lifetime)</span>
        <div className="row">
          <input type="date" {...bind('expires_at')} />
          {values.expires_at && (
            <button type="button" className="btn ghost small" onClick={() => onChange('expires_at', '')}>Lifetime</button>
          )}
        </div>
      </label>
      <label className="field span2">
        <span>Notes</span>
        <textarea rows={3} maxLength={5000} {...bind('notes')} />
      </label>
    </div>
  );
}
