(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const state = {
    query: '',
    limit: 100,
    offset: 0,
    total: 0,
    rows: [],
    invoker: null,
    searchTimer: null
  };

  function identitiesVisible() {
    return $('#privacy-toggle')?.getAttribute('aria-pressed') === 'true';
  }

  function badge(status) {
    const normalized = String(status || '').toLowerCase();
    const cls = normalized === 'terminée' || normalized === 'annulée' ? 'closed' : 'open';
    return `<span class="badge ${cls}">${esc(status || '—')}</span>`;
  }

  function referent(value) {
    const text = String(value || '').trim();
    if (!text) return '—';
    return identitiesVisible() ? esc(text) : '<span class="masked" title="Information masquée">••••••</span>';
  }

  function notify(message, error = false) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error', error);
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  async function withBusy(control, operation) {
    if (!control || control.dataset.busy === 'true') return null;
    control.dataset.busy = 'true';
    control.setAttribute('aria-busy', 'true');
    control.disabled = true;
    try {
      return await operation();
    } finally {
      control.disabled = false;
      control.removeAttribute('aria-busy');
      delete control.dataset.busy;
    }
  }

  function render() {
    const body = $('#reparations-body');
    if (!body) return;
    body.innerHTML = state.rows.length ? state.rows.map((repair) => {
      const parentClosed = repair.signalement_statut === 'Clos';
      const terminal = repair.statut === 'Terminée' || repair.statut === 'Annulée';
      return `
        <tr data-reparation-id="${Number(repair.id)}">
          <td><strong>${esc(repair.signalement_num)}</strong><br><small>${esc(repair.signalement_lieu)}</small></td>
          <td>${esc(repair.mesure || '—')}</td>
          <td>${referent(repair.referent)}</td>
          <td>${esc(repair.debut || '—')}</td>
          <td>${esc(repair.duree || '—')}</td>
          <td>${badge(repair.statut)}${repair.cloture ? `<br><small>${esc(repair.cloture)}</small>` : ''}</td>
          <td><div class="actions">
            <button class="mini" type="button" data-edit-repair="${Number(repair.id)}" ${parentClosed ? 'disabled title="Rouvrez le dossier pour modifier cette réparation"' : ''}>Modifier</button>
            ${terminal
              ? `<button class="mini" type="button" data-repair-status="${Number(repair.id)}" data-repair-status-target="En cours" ${parentClosed ? 'disabled' : ''}>Rouvrir</button>`
              : `<button class="mini" type="button" data-repair-status="${Number(repair.id)}" data-repair-status-target="Terminée" ${parentClosed ? 'disabled' : ''}>Terminer</button>
                 <button class="mini" type="button" data-repair-status="${Number(repair.id)}" data-repair-status-target="Annulée" ${parentClosed ? 'disabled' : ''}>Annuler</button>`}
          </div></td>
        </tr>`;
    }).join('') : '<tr><td colspan="7">Aucune réparation.</td></tr>';

    const start = state.total ? state.offset + 1 : 0;
    const end = Math.min(state.offset + state.rows.length, state.total);
    const page = $('#repair-page');
    if (page) page.textContent = state.total ? `${start}–${end} sur ${state.total}` : '0 réparation';
    if ($('#repair-prev')) $('#repair-prev').disabled = state.offset <= 0;
    if ($('#repair-next')) $('#repair-next').disabled = state.offset + state.limit >= state.total;
  }

  async function refresh({ resetOffset = false } = {}) {
    if (resetOffset) state.offset = 0;
    const result = await window.rdl.queryReparations({
      query: state.query,
      limit: state.limit,
      offset: state.offset,
      includeIdentities: identitiesVisible()
    });
    state.rows = result.rows || [];
    state.total = Number(result.total || 0);
    state.limit = Number(result.limit || state.limit);
    state.offset = Number(result.offset || 0);
    render();
  }

  function setDialogMode(repair = null, invoker = null) {
    const dialog = $('#repair-dialog');
    const form = $('#repair-form');
    if (!dialog || !form) return;
    state.invoker = invoker || document.activeElement;
    form.reset();
    form.elements.reparation_id.value = repair ? String(repair.id) : '';
    form.elements.signalement_id.value = repair ? String(repair.signalement_id) : String(form.elements.signalement_id.value || '');
    form.elements.mesure.value = repair?.mesure || '';
    form.elements.referent.value = repair?.referent || '';
    form.elements.debut.value = repair?.debut || (repair ? '' : new Date().toISOString().slice(0, 10));
    form.elements.duree.value = repair?.duree || '';
    form.elements.notes.value = repair?.notes || '';
    form.elements.statut.value = repair?.statut || 'En cours';
    form.elements.statut.disabled = Boolean(repair);
    dialog.dataset.mode = repair ? 'edit' : 'create';
    $('#repair-dialog-title').textContent = repair ? 'Modifier une réparation' : 'Ajouter une réparation';
    $('#save-repair').textContent = repair ? 'Enregistrer les modifications' : 'Enregistrer';
  }

  async function openEditor(id, invoker) {
    try {
      const repair = await window.rdl.getReparation(Number(id));
      if (!repair) throw new Error('Réparation introuvable.');
      if (repair.signalement_statut === 'Clos') throw new Error('Rouvrez le dossier avant de modifier cette réparation.');
      setDialogMode(repair, invoker);
      const dialog = $('#repair-dialog');
      dialog.showModal();
      setTimeout(() => $('#repair-form [name="mesure"]')?.focus(), 20);
    } catch (error) {
      notify(`Modification impossible : ${error.message}`, true);
    }
  }

  function openCreate(signalementId, invoker) {
    const form = $('#repair-form');
    if (!form) return;
    setDialogMode(null, invoker);
    form.elements.signalement_id.value = String(signalementId);
    $('#repair-dialog').showModal();
    setTimeout(() => form.elements.mesure?.focus(), 20);
  }

  function closeDialog(reason = 'button') {
    const dialog = $('#repair-dialog');
    if (!dialog?.open) return;
    dialog.dataset.closedBy = reason;
    dialog.close();
  }

  function bindDialog() {
    const dialog = $('#repair-dialog');
    const form = $('#repair-form');
    if (!dialog || !form) return;

    dialog.querySelectorAll('[data-repair-cancel]').forEach((button) => {
      button.addEventListener('click', () => closeDialog('button'));
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog('escape');
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog('backdrop');
    });
    dialog.addEventListener('close', () => {
      form.elements.statut.disabled = false;
      const target = state.invoker;
      state.invoker = null;
      requestAnimationFrame(() => {
        if (target && target.isConnected && typeof target.focus === 'function') target.focus();
      });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const submit = $('#save-repair');
      await withBusy(submit, async () => {
        try {
          const payload = Object.fromEntries(new FormData(form).entries());
          const repairId = Number(payload.reparation_id || 0);
          delete payload.reparation_id;
          if (repairId) {
            delete payload.signalement_id;
            delete payload.statut;
            await window.rdl.updateReparation(repairId, payload);
          } else {
            await window.rdl.createReparation(payload);
          }
          closeDialog(repairId ? 'updated' : 'created');
          await refresh();
          document.dispatchEvent(new CustomEvent('rdl:signalements-changed'));
          notify(repairId ? 'Réparation modifiée.' : 'Réparation enregistrée localement.');
        } catch (error) {
          notify(error.message, true);
        }
      });
    }, true);
  }

  function bindActions() {
    document.addEventListener('click', async (event) => {
      const create = event.target.closest('[data-repair]');
      const edit = event.target.closest('[data-edit-repair]');
      const status = event.target.closest('[data-repair-status]');

      if (create) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openCreate(Number(create.dataset.repair), create);
        return;
      }
      if (edit) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await openEditor(edit.dataset.editRepair, edit);
        return;
      }
      if (status) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await withBusy(status, async () => {
          try {
            await window.rdl.setReparationStatus(Number(status.dataset.repairStatus), status.dataset.repairStatusTarget);
            await refresh();
            document.dispatchEvent(new CustomEvent('rdl:signalements-changed'));
            notify('Statut de la réparation mis à jour.');
          } catch (error) {
            notify(error.message, true);
          }
        });
      }
    }, true);

    $('#repair-search')?.addEventListener('input', (event) => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(async () => {
        state.query = event.target.value.trim();
        try { await refresh({ resetOffset: true }); } catch (error) { notify(error.message, true); }
      }, 180);
    });
    $('#repair-prev')?.addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, async () => {
        state.offset = Math.max(0, state.offset - state.limit);
        await refresh();
      });
    });
    $('#repair-next')?.addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, async () => {
        state.offset += state.limit;
        await refresh();
      });
    });

    $('#privacy-toggle')?.addEventListener('click', () => setTimeout(() => refresh({ resetOffset: true }).catch(() => {}), 0));
    document.addEventListener('rdl:reparations-changed', () => refresh().catch(() => {}));
  }

  async function init() {
    if (!window.rdl || !$('#reparations-body') || !$('#repair-form')) return;
    bindDialog();
    bindActions();
    await refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else void init();
})();
