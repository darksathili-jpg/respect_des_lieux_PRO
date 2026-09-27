(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const state = {
    query: '',
    limit: 100,
    offset: 0,
    total: 0,
    rows: [],
    invoker: null,
    invokerRepairId: null,
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
      const parentContext = parentClosed
        ? `<div class="repair-parent-lock" role="status"><span>Dossier parent clos</span><small>Rouvrez-le pour reprendre le suivi.</small></div>`
        : '';
      const actions = parentClosed
        ? `<div class="actions repair-actions-locked">
             <button class="mini" type="button" data-edit-repair="${Number(repair.id)}" disabled title="Rouvrez le dossier pour modifier cette réparation">Modifier</button>
             ${terminal
               ? `<button class="mini" type="button" data-repair-status="${Number(repair.id)}" data-repair-status-target="En cours" disabled title="Rouvrez le dossier pour reprendre cette réparation">Rouvrir la réparation</button>`
               : `<button class="mini" type="button" data-repair-status="${Number(repair.id)}" data-repair-status-target="Terminée" disabled title="Rouvrez le dossier pour terminer cette réparation">Terminer</button>
                  <button class="mini" type="button" data-repair-status="${Number(repair.id)}" data-repair-status-target="Annulée" disabled title="Rouvrez le dossier pour annuler cette réparation">Annuler</button>`}
             <button class="mini repair-parent-reopen" type="button" data-reopen-parent="${Number(repair.signalement_id)}">Rouvrir le dossier</button>
             <span class="repair-lock-hint">Actions suspendues tant que le dossier parent est clos.</span>
           </div>`
        : `<div class="actions">
             <button class="mini" type="button" data-edit-repair="${Number(repair.id)}">Modifier</button>
             ${terminal
               ? `<button class="mini" type="button" data-repair-status="${Number(repair.id)}" data-repair-status-target="En cours">Rouvrir</button>`
               : `<button class="mini" type="button" data-repair-status="${Number(repair.id)}" data-repair-status-target="Terminée">Terminer</button>
                  <button class="mini" type="button" data-repair-status="${Number(repair.id)}" data-repair-status-target="Annulée">Annuler</button>`}
           </div>`;
      return `
        <tr data-reparation-id="${Number(repair.id)}" data-parent-status="${esc(repair.signalement_statut || '')}">
          <td><strong>${esc(repair.signalement_num)}</strong><br><small>${esc(repair.signalement_lieu)}</small>${parentContext}</td>
          <td>${esc(repair.mesure || '—')}</td>
          <td>${referent(repair.referent)}</td>
          <td>${esc(repair.debut || '—')}</td>
          <td>${esc(repair.duree || '—')}</td>
          <td>${badge(repair.statut)}${repair.cloture ? `<br><small>${esc(repair.cloture)}</small>` : ''}</td>
          <td>${actions}</td>
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
    const canEditReferent = !repair || identitiesVisible();
    state.invoker = invoker || document.activeElement;
    state.invokerRepairId = repair ? Number(repair.id) : null;
    form.reset();
    form.elements.reparation_id.value = repair ? String(repair.id) : '';
    form.elements.signalement_id.value = repair ? String(repair.signalement_id) : '';
    form.elements.mesure.value = repair?.mesure || '';
    form.elements.referent.disabled = !canEditReferent;
    form.elements.referent.value = canEditReferent ? (repair?.referent || '') : '';
    form.elements.debut.value = repair?.debut || (repair ? '' : new Date().toISOString().slice(0, 10));
    form.elements.duree.value = repair?.duree || '';
    form.elements.notes.value = repair?.notes || '';
    form.elements.statut.value = repair?.statut || 'En cours';
    form.elements.statut.disabled = Boolean(repair);
    dialog.dataset.mode = repair ? 'edit' : 'create';
    dialog.dataset.identitiesVisible = identitiesVisible() ? 'true' : 'false';
    $('#repair-dialog-title').textContent = repair ? 'Modifier une réparation' : 'Ajouter une réparation';
    $('#save-repair').textContent = repair ? 'Enregistrer les modifications' : 'Enregistrer';
  }

  async function openEditor(id, invoker) {
    try {
      const includeIdentities = identitiesVisible();
      const repair = await window.rdl.getReparation(Number(id), includeIdentities);
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

  function restoreInvokerFocus(originalTarget, repairId) {
    if ($('#repair-dialog')?.open || document.querySelector('dialog[open]')) return false;
    const liveTarget = originalTarget?.isConnected
      ? originalTarget
      : (repairId ? document.querySelector(`[data-edit-repair="${repairId}"]`) : null);
    if (!liveTarget || typeof liveTarget.focus !== 'function') return false;
    liveTarget.focus();
    return document.activeElement === liveTarget;
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
      form.elements.referent.disabled = false;
      delete dialog.dataset.identitiesVisible;
      const target = state.invoker;
      const repairId = state.invokerRepairId;
      state.invoker = null;
      state.invokerRepairId = null;
      requestAnimationFrame(() => {
        const restored = restoreInvokerFocus(target, repairId);
        if (!restored && repairId) {
          setTimeout(() => restoreInvokerFocus(target, repairId), 140);
        }
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
      const reopenParent = event.target.closest('[data-reopen-parent]');

      if (create) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openCreate(Number(create.dataset.repair), create);
        return;
      }
      if (reopenParent) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await withBusy(reopenParent, async () => {
          try {
            await window.rdl.setSignalementStatus(Number(reopenParent.dataset.reopenParent), 'Ouvert');
            await refresh();
            document.dispatchEvent(new CustomEvent('rdl:signalements-changed'));
            notify('Dossier parent rouvert : le suivi des réparations peut reprendre.');
          } catch (error) {
            notify(error.message, true);
          }
        });
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

    document.addEventListener('rdl:privacy-visibility-changed', () => refresh({ resetOffset: true }).catch(() => {}));
    document.addEventListener('rdl:reparations-changed', () => refresh().catch(() => {}));
  }

  async function waitForShellReady() {
    const shell = $('#app-shell');
    for (let i = 0; i < 120; i += 1) {
      if (shell?.dataset.shellReady === 'true') return true;
      if (shell?.dataset.shellReady === 'false') return false;
      await wait(50);
    }
    throw new Error('Le shell n’a pas terminé son initialisation.');
  }

  async function init() {
    if (!window.rdl || !$('#reparations-body') || !$('#repair-form')) return;
    bindDialog();
    bindActions();
    const ready = await waitForShellReady();
    if (ready) await refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void init(), { once: true });
  else void init();
})();
