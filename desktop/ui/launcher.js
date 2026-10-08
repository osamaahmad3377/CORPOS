const $ = (sel) => document.querySelector(sel);

function render(s) {
  document.querySelectorAll('section').forEach((el) => {
    el.classList.toggle('active', el.dataset.state.split(' ').includes(s.state));
  });
  $('#version').textContent = `Version ${s.version}`;
  $('#machine-id').textContent = s.machineId;
  document.querySelectorAll('#support-email, .support-email').forEach((el) => { el.textContent = s.supportEmail || 'info@nextcore.com.pk'; });
  $('#busy-text').textContent = s.state === 'checking' ? 'Checking your license online…' : 'Starting CorePOS…';

  const msg = $('#activate-msg');
  msg.hidden = !(s.state === 'activate' && s.message);
  msg.textContent = s.message || '';

  $('#offline-msg').textContent = s.message || '';
  $('#error-msg').textContent = s.message || '';

  if (s.state === 'activate') setTimeout(() => $('#key').focus(), 50);
  const types = $('#business-type');
  if (s.businessTypes?.length && !types.options.length) {
    for (const t of s.businessTypes) types.add(new Option(t.label, t.code));
    types.value = 'general';
    const second = $('#second-type');
    for (const t of s.businessTypes) second.add(new Option(t.label, t.code));
    second.value = 'restaurant';
  }

  if (s.state === 'setup') setTimeout(() => $('[name=shop_name]').focus(), 50);
}

$('#key').addEventListener('input', (e) => {
  // Auto-format as CPOS-XXXXX-XXXXX-XXXXX-XXXXX while typing/pasting.
  let raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.startsWith('CPOS')) raw = raw.slice(4);
  raw = raw.slice(0, 20);
  e.target.value = raw ? `CPOS-${raw.match(/.{1,5}/g).join('-')}` : '';
});

$('#activate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#activate-btn');
  const msg = $('#activate-msg');
  btn.disabled = true;
  btn.textContent = 'Activating…';
  msg.hidden = true;
  try {
    const res = await window.corepos.activate($('#key').value);
    if (!res.ok) {
      msg.textContent = res.message;
      msg.hidden = false;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Activate';
  }
});

$('#has-second').addEventListener('change', (e) => {
  $('#second-biz').hidden = !e.target.checked;
  $('[name=second_name]').required = e.target.checked;
  if (e.target.checked) $('[name=second_name]').focus();
});

$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const data = Object.fromEntries(form.entries());
  const msg = $('#setup-msg');
  msg.hidden = true;

  // optional second business (e.g. a restaurant next to the mart)
  if ($('#has-second').checked && data.second_name.trim()) {
    data.second_business = { name: data.second_name.trim(), type: data.second_type };
  }
  delete data.second_name;
  delete data.second_type;

  if (data.admin_password !== data.confirm) {
    msg.textContent = 'Passwords do not match.';
    msg.hidden = false;
    return;
  }
  delete data.confirm;

  const btn = $('#setup-btn');
  btn.disabled = true;
  btn.textContent = 'Setting up…';
  try {
    const res = await window.corepos.setup(data);
    if (!res.ok) {
      msg.textContent = (res.errors || ['Setup failed.']).join('\n');
      msg.hidden = false;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create shop & start';
  }
});

document.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  e.preventDefault();
  if (action === 'retry') window.corepos.retry();
  if (action === 'logs') window.corepos.openLogs();
  if (action === 'support') window.corepos.openSupport();
  if (action === 'change-key') render({ ...current, state: 'activate', message: '' });
});

let current = null;
window.corepos.onState((s) => { current = s; render(s); });
window.corepos.state().then((s) => { current = s; render(s); });
