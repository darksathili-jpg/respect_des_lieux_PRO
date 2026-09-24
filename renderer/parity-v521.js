(() => {
  'use strict';

  const PAGE_SIZE = 25;
  const state = {
    status: 'all',
    gravity: 'all',
    sort: 'date-desc',
    page: 1,
    totalRows: 0,
    filteredRows: 0,
    applying: false,
    lastOrder: ''
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const text = (node) => String(node?.textContent || '').trim();
  const norm = (value) => String(value || '').trim().toLocaleLowerCase('fr-FR');

  function installStyles() {
    if ($('#rdl-parity-v521-style')) return;
    const style = document.createElement('style');
    style.id = 'rdl-parity-v521-style';
    style.textContent = `
      .parity-toolbar{display:flex;align-items:flex-end;gap:9px;flex-wrap:wrap;margin:0 0 14px;padding:12px 13px;border:1px solid #e6dcd3;border-radius:13px;background:linear-gradient(180deg,#fffaf6,#f8f1eb)}
      .parity-field{display:flex;flex-direction:column;gap:4px;min-width:145px}.parity-field label{font-size:8px;letter-spacing:.1em;text-transform:uppercase;font-weight:850;color:#8b7468}.parity-field select{height:34px;border:1px solid #dccfc5;border-radius:9px;background:#fffdf9;color:#203f5a;padding:0 28px 0 9px;font-size:11px;font-weight:650;outline:none}.parity-field select:focus{border-color:#c76549;box-shadow:0 0 0 3px rgba(199,101,73,.12)}
      .parity-summary{margin-left:auto;display:flex;align-items:center;gap:9px;min-height:34px}.parity-count{font-size:10px;color:#6e625a;white-space:nowrap}.parity-page{display:flex;align-items:center;gap:5px}.parity-page button{width:32px;height:32px;border:1px solid #ddcfc5;border-radius:9px;background:#fffdf9;color:#203f5a;font-weight:800}.parity-page button:hover:not(:disabled){background:#f5e9e2;color:#8b1e24}.parity-page button:disabled{opacity:.35;cursor:not-allowed}.parity-page span{min-width:62px;text-align:center;font-size:10px;font-weight:750;color:#203f5a}.parity-reset{height:34px;border:1px solid #dfc8c2;border-radius:9px;background:#fff8f5;color:#8b1e24;padding:0 11px;font-size:10px;font-weight:800}.parity-reset:hover{background:#f8e7e2}.parity-hidden{display:none!important}.parity-window-note{font-size:9px;color:#9a887d;white-space:nowrap}
      @media(max-width:1200px){.parity-summary{margin-left:0;width:100%;justify-content:space-between}.parity-window-note{display:none}}
    `;
    document.head.appendChild(style);
  }

  function realRows() {
    return $$('#signalements-body tr').filter((row) => row.cells?.length >= 8 && $('td:first-child strong', row));
  }

  function rowModel(row) {
    const cells = row.cells;
    const dateRaw = text(cells[1]).split(/\s+/)[0];
    const timestamp = Date.parse(dateRaw) || 0;
    return {
      row,
      num: text(cells[0]),
      date: timestamp,
      lieu: norm(text(cells[2])),
      gravity: norm(text(cells[4])),
      status: norm(text(cells[6]))
    };
  }

  function uniqueCellValues(index) {
    return [...new Set(realRows().map((row) => text(row.cells[index])).filter(Boolean))].sort((a,b) => a.localeCompare(b,'fr'));
  }

  function syncDynamicOptions() {
    const gravitySelect = $('#parity-gravity');
    const statusSelect = $('#parity-status');
    if (!gravitySelect || !statusSelect) return;

    const rebuild = (select, values, current, allLabel) => {
      const existing = [...select.options].map((o) => o.value).join('|');
      const desired = ['all', ...values.map(norm)].join('|');
      if (existing === desired) return;
      select.innerHTML = `<option value="all">${allLabel}</option>` + values.map((value) => `<option value="${norm(value)}">${value}</option>`).join('');
      select.value = [...select.options].some((o) => o.value === current) ? current : 'all';
    };

    rebuild(statusSelect, uniqueCellValues(6), state.status, 'Tous les statuts');
    rebuild(gravitySelect, uniqueCellValues(4), state.gravity, 'Toutes les gravités');
  }

  function compareModels(a, b) {
    if (state.sort === 'date-asc') return a.date - b.date || a.num.localeCompare(b.num,'fr');
    if (state.sort === 'num-asc') return a.num.localeCompare(b.num,'fr',{numeric:true});
    if (state.sort === 'lieu-asc') return a.lieu.localeCompare(b.lieu,'fr') || b.date - a.date;
    return b.date - a.date || b.num.localeCompare(a.num,'fr',{numeric:true});
  }

  function apply() {
    if (state.applying) return;
    const body = $('#signalements-body');
    if (!body) return;
    const rows = realRows();
    syncDynamicOptions();

    state.totalRows = rows.length;
    const models = rows.map(rowModel).filter((item) => {
      const statusOk = state.status === 'all' || item.status === state.status;
      const gravityOk = state.gravity === 'all' || item.gravity === state.gravity;
      return statusOk && gravityOk;
    }).sort(compareModels);

    state.filteredRows = models.length;
    const maxPage = Math.max(1, Math.ceil(models.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), maxPage);
    const start = (state.page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const visible = new Set(models.slice(start, end).map((item) => item.row));
    const matched = new Set(models.map((item) => item.row));

    rows.forEach((row) => row.classList.toggle('parity-hidden', !matched.has(row) || !visible.has(row)));

    const order = models.map((item) => item.num).join('|');
    if (order && order !== state.lastOrder) {
      state.applying = true;
      const fragment = document.createDocumentFragment();
      models.forEach((item) => fragment.appendChild(item.row));
      rows.filter((row) => !matched.has(row)).forEach((row) => fragment.appendChild(row));
      body.appendChild(fragment);
      state.lastOrder = order;
      state.applying = false;
    }

    const count = $('#parity-count');
    const label = $('#parity-page-label');
    const prev = $('#parity-prev');
    const next = $('#parity-next');
    if (count) count.textContent = `${models.length} dossier${models.length > 1 ? 's' : ''} · ${rows.length} chargé${rows.length > 1 ? 's' : ''}`;
    if (label) label.textContent = `${state.page} / ${maxPage}`;
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= maxPage;
  }

  function toolbarMarkup() {
    return `
      <div class="parity-field"><label for="parity-status">Statut</label><select id="parity-status"><option value="all">Tous les statuts</option></select></div>
      <div class="parity-field"><label for="parity-gravity">Gravité</label><select id="parity-gravity"><option value="all">Toutes les gravités</option></select></div>
      <div class="parity-field"><label for="parity-sort">Trier</label><select id="parity-sort"><option value="date-desc">Plus récents</option><option value="date-asc">Plus anciens</option><option value="num-asc">N° de dossier</option><option value="lieu-asc">Lieu A → Z</option></select></div>
      <button id="parity-reset" class="parity-reset" type="button">Réinitialiser</button>
      <div class="parity-summary"><span id="parity-count" class="parity-count">0 dossier</span><span class="parity-window-note">25 dossiers par page</span><div class="parity-page"><button id="parity-prev" type="button" aria-label="Page précédente">‹</button><span id="parity-page-label">1 / 1</span><button id="parity-next" type="button" aria-label="Page suivante">›</button></div></div>`;
  }

  function installToolbar() {
    const panel = $('#view-signalements .panel');
    const tableWrap = $('#view-signalements .table-wrap');
    if (!panel || !tableWrap || $('#parity-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'parity-toolbar';
    toolbar.className = 'parity-toolbar';
    toolbar.dataset.rdlParity = 'v5.2.1';
    toolbar.innerHTML = toolbarMarkup();
    panel.insertBefore(toolbar, tableWrap);

    $('#parity-status').addEventListener('change', (event) => { state.status = event.target.value; state.page = 1; apply(); });
    $('#parity-gravity').addEventListener('change', (event) => { state.gravity = event.target.value; state.page = 1; apply(); });
    $('#parity-sort').addEventListener('change', (event) => { state.sort = event.target.value; state.page = 1; state.lastOrder = ''; apply(); });
    $('#parity-reset').addEventListener('click', () => {
      state.status = 'all'; state.gravity = 'all'; state.sort = 'date-desc'; state.page = 1; state.lastOrder = '';
      $('#parity-status').value = 'all'; $('#parity-gravity').value = 'all'; $('#parity-sort').value = 'date-desc';
      const search = $('#signal-search');
      if (search && search.value) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
      else apply();
    });
    $('#parity-prev').addEventListener('click', () => { if (state.page > 1) { state.page -= 1; apply(); } });
    $('#parity-next').addEventListener('click', () => { const max = Math.max(1, Math.ceil(state.filteredRows / PAGE_SIZE)); if (state.page < max) { state.page += 1; apply(); } });
  }

  function observeTable() {
    const body = $('#signalements-body');
    if (!body) return;
    let timer = null;
    new MutationObserver(() => {
      if (state.applying) return;
      clearTimeout(timer);
      timer = setTimeout(() => { state.page = 1; state.lastOrder = ''; apply(); }, 25);
    }).observe(body, { childList: true });
  }

  function install() {
    installStyles();
    installToolbar();
    observeTable();
    setTimeout(apply, 60);
    window.RDL_PARITY = Object.freeze({
      snapshot: () => ({ version: '5.2.1', pageSize: PAGE_SIZE, ...state, applying: Boolean(state.applying) })
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
