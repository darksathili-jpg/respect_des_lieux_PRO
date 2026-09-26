(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  let activeSignalementId = null;
  let dialog = null;
  let detailInvoker = null;
  let decoratingRepairs = false;

  function identitiesVisible() {
    return $('#privacy-toggle')?.getAttribute('aria-pressed') === 'true';
  }

  function protectedIdentity(value) {
    const text = String(value || '').trim();
    if (!text) return '—';
    return identitiesVisible()
      ? esc(text)
      : '<span class="masked" title="Information masquée">••••••</span>';
  }

  function statusBadge(status) {
    const normalized = String(status || '').toLowerCase();
    const cls = normalized === 'clos' || normalized === 'terminée' ? 'closed' : 'open';
    return `<span class="badge ${cls}">${esc(status || '—')}</span>`;
  }

  function bytes(value) {
    const n = Number(value || 0);
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
    return `${(n / 1024 / 1024).toFixed(1)} Mo`;
  }

  function dateFr(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return esc(value);
    return date.toLocaleDateString('fr-FR');
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

  function closeDetailDialog(reason = 'button') {
    if (!dialog?.open) return false;
    dialog.dataset.closedBy = reason;
    dialog.close();
    return true;
  }

  function detailFocusableElements() {
    if (!dialog) return [];
    return $$('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', dialog)
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
  }

  function keepDetailFocusInside(event) {
    if (event.key !== 'Tab' || !dialog?.open) return;
    const focusable = detailFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    const outside = !current || !dialog.contains(current);

    if (event.shiftKey && (outside || current === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (outside || current === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'signal-detail-dialog';
    dialog.className = 'detail-dialog';
    dialog.tabIndex = -1;
    dialog.setAttribute('aria-labelledby', 'signal-detail-title');
    dialog.innerHTML = `
      <div class="dialog-card detail-card">
        <header class="detail-header">
          <div>
            <p class="eyebrow">Fiche de signalement</p>
            <h2 id="signal-detail-title">Dossier</h2>
          </div>
          <button class="close" type="button" data-detail-close aria-label="Fermer la fiche" title="Fermer">×</button>
        </header>
        <div id="signal-detail-body" class="detail-scroll" aria-live="polite"></div>
        <footer class="detail-footer">
          <span class="detail-hint">Les identités restent masquées tant que « Afficher les identités » n’est pas activé.</span>
          <button class="btn secondary" type="button" data-detail-close>Fermer</button>
        </footer>
      </div>`;
    document.body.appendChild(dialog);

    $$('[data-detail-close]', dialog).forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeDetailDialog('button');
      });
    });

    dialog.addEventListener('click', async (event) => {
      if (event.target === dialog) {
        closeDetailDialog('backdrop');
        return;
      }

      const openPhoto = event.target.closest('[data-detail-open-photo]');
      const removePhoto = event.target.closest('[data-detail-remove-photo]');
      const editSignalement = event.target.closest('[data-edit-signalement]');
      const editRepair = event.target.closest('[data-edit-repair]');

      try {
        if (openPhoto) {
          await withBusy(openPhoto, () => window.rdl.openPhoto(Number(openPhoto.dataset.detailOpenPhoto)));
        } else if (removePhoto) {
          const ok = window.confirm('Retirer définitivement cette photo du dossier local ?');
          if (!ok) return;
          await withBusy(removePhoto, async () => {
            await window.rdl.removePhoto(Number(removePhoto.dataset.detailRemovePhoto));
            await refreshActiveDetail();
            document.dispatchEvent(new CustomEvent('rdl:signalements-changed'));
            notify('Photo retirée du dossier.');
          });
        } else if (editSignalement) {
          const id = Number(editSignalement.dataset.editSignalement);
          const invoker = detailInvoker;
          closeDetailDialog('edit');
          document.dispatchEvent(new CustomEvent('rdl:edit-signalement', { detail: { id, invoker } }));
        } else if (editRepair) {
          await openRepairEditor(editRepair.dataset.editRepair);
        }
      } catch (error) {
        notify(error.message, true);
      }
    });

    dialog.addEventListener('keydown', keepDetailFocusInside);

    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDetailDialog('escape');
    });

    dialog.addEventListener('close', () => {
      activeSignalementId = null;
      const target = detailInvoker;
      detailInvoker = null;
      if (target && typeof target.focus === 'function' && target.isConnected) target.focus();
    });

    return dialog;
  }

  function renderPhotos(photos, signalementClosed) {
    if (!photos.length) return '<div class="detail-empty">Aucune photo attachée à ce dossier.</div>';
    return `<div class="detail-photo-list">${photos.map((photo) => `
      <div class="detail-photo-row">
        <div>
          <strong>${esc(photo.original_name || 'Photo JPEG')}</strong>
          <small>${bytes(photo.size_bytes)} · ajoutée le ${dateFr(photo.created_at)}</small>
        </div>
        <div class="actions">
          <button class="mini fiche" type="button" data-detail-open-photo="${Number(photo.id)}">Ouvrir</button>
          <button class="mini danger-mini" type="button" data-detail-remove-photo="${Number(photo.id)}" ${signalementClosed ? 'disabled title="Rouvrez le dossier pour retirer une photo"' : ''}>Retirer</button>
        </div>
      </div>`).join('')}</div>`;
  }

  function renderRepairs(reparations) {
    if (!reparations.length) return '<div class="detail-empty">Aucune réparation ou mesure enregistrée.</div>';
    return `<div class="detail-repair-list">${reparations.map((repair) => `
      <article class="detail-repair" data-detail-repair-id="${Number(repair.id)}">
        <div class="detail-repair-head">
          <strong>${esc(repair.mesure || 'Mesure enregistrée')}</strong>
          <div class="detail-repair-tools">
            ${statusBadge(repair.statut)}
            <button class="mini edit-repair" type="button" data-edit-repair="${Number(repair.id)}">Modifier</button>
          </div>
        </div>
        <dl class="detail-definition compact">
          <div><dt>Référent</dt><dd>${protectedIdentity(repair.referent)}</dd></div>
          <div><dt>Début</dt><dd>${esc(repair.debut || '—')}</dd></div>
          <div><dt>Durée</dt><dd>${esc(repair.duree || '—')}</dd></div>
          <div><dt>Clôture</dt><dd>${esc(repair.cloture || '—')}</dd></div>
        </dl>
        ${repair.notes ? `<p class="detail-note">${esc(repair.notes)}</p>` : ''}
      </article>`).join('')}</div>`;
  }

  function renderDetail(detail) {
    const { signalement, reparations = [], photos = [], events = [] } = detail;
    const body = $('#signal-detail-body');
    const title = $('#signal-detail-title');
    const closed = signalement.statut === 'Clos';
    title.textContent = `Dossier ${signalement.num}`;

    body.innerHTML = `
      <section class="detail-summary">
        <div>
          <span class="detail-number">${esc(signalement.num)}</span>
          <h3>${esc(signalement.lieu || 'Lieu non renseigné')}</h3>
          <p>${esc(signalement.date || '—')}${signalement.heure ? ` · ${esc(signalement.heure)}` : ''}</p>
        </div>
        <div class="detail-summary-status">
          ${statusBadge(signalement.statut)}
          <button class="mini" type="button" data-edit-signalement="${Number(signalement.id)}" ${closed ? 'disabled title="Rouvrez le dossier pour le modifier"' : ''}>Modifier le dossier</button>
        </div>
      </section>

      <div class="detail-columns">
        <section class="detail-block">
          <div class="detail-section-head"><p class="eyebrow">Incident</p><h3>Informations du dossier</h3></div>
          <dl class="detail-definition">
            <div><dt>Type</dt><dd>${esc(signalement.type || '—')}</dd></div>
            <div><dt>Gravité</dt><dd>${esc(signalement.gravite || '—')}</dd></div>
            <div><dt>Date</dt><dd>${esc(signalement.date || '—')}</dd></div>
            <div><dt>Heure</dt><dd>${esc(signalement.heure || '—')}</dd></div>
            <div><dt>Créé le</dt><dd>${dateFr(signalement.created_at)}</dd></div>
            <div><dt>Mis à jour</dt><dd>${dateFr(signalement.updated_at)}</dd></div>
          </dl>
        </section>

        <section class="detail-block identity-block">
          <div class="detail-section-head"><p class="eyebrow">Accès protégé</p><h3>Personnes associées</h3></div>
          <dl class="detail-definition">
            <div><dt>Élève</dt><dd>${protectedIdentity(signalement.eleve)}</dd></div>
            <div><dt>Classe</dt><dd>${protectedIdentity(signalement.classe)}</dd></div>
            <div><dt>Signalé par</dt><dd>${protectedIdentity(signalement.signale_par)}</dd></div>
          </dl>
          <p class="detail-privacy-copy">Utilisez le bouton global « Afficher les identités » uniquement lorsque ces informations sont nécessaires.</p>
        </section>
      </div>

      <section class="detail-block detail-description">
        <div class="detail-section-head"><p class="eyebrow">Constat</p><h3>Description factuelle</h3></div>
        <p class="detail-text">${signalement.description ? esc(signalement.description) : '<span class="detail-muted">Aucune description renseignée.</span>'}</p>
      </section>

      <section class="detail-block">
        <div class="detail-section-head split"><div><p class="eyebrow">Pièces</p><h3>Photos</h3></div><span class="badge">${photos.length}</span></div>
        ${renderPhotos(photos, closed)}
      </section>

      <section class="detail-block">
        <div class="detail-section-head split"><div><p class="eyebrow">Suivi</p><h3>Réparations et mesures</h3></div><span class="badge">${reparations.length}</span></div>
        ${renderRepairs(reparations)}
      </section>

      <section class="detail-block">
        <div class="detail-section-head split"><div><p class="eyebrow">Historique</p><h3>Événements du dossier</h3></div><span class="badge">${events.length}</span></div>
        ${events.length ? `<div class="detail-repair-list">${events.map((event) => `<div class="detail-photo-row"><div><strong>${esc(event.event_type)}</strong><small>${dateFr(event.created_at)} · ${esc(event.detail || '')}</small></div></div>`).join('')}</div>` : '<div class="detail-empty">Aucun événement historisé.</div>'}
      </section>`;
  }

  async function openSignalementById(id, invoker = null) {
    const signalementId = Number(id);
    if (!Number.isSafeInteger(signalementId) || signalementId <= 0) return;
    try {
      const detail = await window.rdl.getSignalementDetail(signalementId);
      activeSignalementId = signalementId;
      detailInvoker = invoker || document.activeElement;
      ensureDialog();
      renderDetail(detail);
      if (!dialog.open) {
        dialog.showModal();
        requestAnimationFrame(() => detailFocusableElements()[0]?.focus());
      }
    } catch (error) {
      notify(`Fiche inaccessible : ${error.message}`, true);
    }
  }

  async function openSignalementByNum(num, invoker = null) {
    const target = String(num || '').trim();
    if (!target) return;
    try {
      const result = await window.rdl.querySignalements({ query: target, limit: 20, offset: 0, includeIdentities: false });
      const signalement = (result.rows || []).find((row) => String(row.num) === target);
      if (!signalement) throw new Error(`Dossier ${target} introuvable.`);
      await openSignalementById(signalement.id, invoker);
    } catch (error) {
      notify(`Fiche inaccessible : ${error.message}`, true);
    }
  }

  async function refreshActiveDetail() {
    if (!dialog?.open || !activeSignalementId) return;
    const detail = await window.rdl.getSignalementDetail(activeSignalementId);
    renderDetail(detail);
  }

  function ensureRepairEditField() {
    const form = $('#repair-form');
    if (!form) return null;
    let field = form.elements.reparation_id;
    if (!field) {
      field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'reparation_id';
      form.prepend(field);
    }
    return field;
  }

  function setRepairDialogMode(repair = null) {
    const form = $('#repair-form');
    const repairDialog = $('#repair-dialog');
    if (!form || !repairDialog) return;
    const idField = ensureRepairEditField();
    const title = $('h2', repairDialog);
    const submit = $('footer .btn.primary', repairDialog);

    if (!repair) {
      idField.value = '';
      if (title) title.textContent = 'Ajouter une réparation';
      if (submit) submit.textContent = 'Enregistrer';
      repairDialog.dataset.mode = 'create';
      return;
    }

    form.reset();
    idField.value = String(repair.id);
    form.elements.signalement_id.value = String(repair.signalement_id || '');
    form.elements.mesure.value = repair.mesure || '';
    form.elements.referent.value = repair.referent || '';
    form.elements.debut.value = repair.debut || '';
    form.elements.duree.value = repair.duree || '';
    form.elements.notes.value = repair.notes || '';
    form.elements.statut.value = repair.statut || 'En cours';
    if (title) title.textContent = 'Modifier la réparation';
    if (submit) submit.textContent = 'Enregistrer les modifications';
    repairDialog.dataset.mode = 'edit';
  }

  async function openRepairEditor(id) {
    const repairId = Number(id);
    if (!Number.isSafeInteger(repairId) || repairId <= 0) return;
    try {
      const rows = await window.rdl.listReparations(1000);
      const repair = rows.find((row) => Number(row.id) === repairId);
      if (!repair) throw new Error('Réparation introuvable.');
      setRepairDialogMode(repair);
      const repairDialog = $('#repair-dialog');
      if (!repairDialog.open) repairDialog.showModal();
      setTimeout(() => $('#repair-form [name="mesure"]')?.focus(), 40);
    } catch (error) {
      notify(`Modification impossible : ${error.message}`, true);
    }
  }

  function bindRepairEditing() {
    const form = $('#repair-form');
    const repairDialog = $('#repair-dialog');
    if (!form || !repairDialog) return;
    ensureRepairEditField();

    form.addEventListener('submit', async (event) => {
      const repairId = Number(form.elements.reparation_id?.value || 0);
      if (!repairId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const payload = Object.fromEntries(new FormData(form).entries());
      delete payload.reparation_id;
      try {
        await window.rdl.updateReparation(repairId, payload);
        repairDialog.close('updated');
        setRepairDialogMode(null);
        document.dispatchEvent(new CustomEvent('rdl:signalements-changed'));
        await refreshActiveDetail();
        notify('Réparation modifiée et enregistrée localement.');
      } catch (error) {
        notify(`Modification impossible : ${error.message}`, true);
      }
    }, true);

    repairDialog.addEventListener('close', () => setRepairDialogMode(null));
  }

  async function decorateRepairRows() {
    if (decoratingRepairs) return;
    const body = $('#reparations-body');
    if (!body) return;
    decoratingRepairs = true;
    try {
      const repairs = await window.rdl.listReparations(1000);
      const rows = $$('tr', body).filter((row) => $('td', row));
      rows.forEach((row, index) => {
        const repair = repairs[index];
        if (!repair) return;
        row.dataset.repairId = String(repair.id);
        const statusCell = $('td:last-child', row);
        if (!statusCell || statusCell.querySelector('[data-edit-repair]')) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'repair-status-actions';
        while (statusCell.firstChild) wrapper.appendChild(statusCell.firstChild);
        const edit = document.createElement('button');
        edit.className = 'mini edit-repair';
        edit.type = 'button';
        edit.dataset.editRepair = String(repair.id);
        edit.textContent = 'Modifier';
        edit.setAttribute('aria-label', `Modifier la réparation ${repair.id}`);
        wrapper.appendChild(edit);
        statusCell.appendChild(wrapper);
      });
    } catch (error) {
      console.error('Décoration des réparations impossible:', error);
    } finally {
      decoratingRepairs = false;
    }
  }

  function bindNavigation() {
    document.addEventListener('click', (event) => {
      const fiche = event.target.closest('[data-fiche-id]');
      if (fiche && !event.target.closest('[data-edit-signalement],[data-photo],[data-repair],[data-set-status]')) {
        event.preventDefault();
        event.stopPropagation();
        openSignalementById(fiche.dataset.ficheId, fiche);
        return;
      }

      const editRepair = event.target.closest('[data-edit-repair]');
      if (editRepair && !dialog?.open) {
        event.preventDefault();
        event.stopPropagation();
        openRepairEditor(editRepair.dataset.editRepair);
        return;
      }

      const createRepair = event.target.closest('[data-repair]');
      if (createRepair) setTimeout(() => setRepairDialogMode(null), 0);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-fiche-id]');
      if (!row || event.target.closest('button, a, input, select, textarea')) return;
      event.preventDefault();
      openSignalementById(row.dataset.ficheId, row);
    });

    document.addEventListener('rdl:privacy-visibility-changed', () => {
      void refreshActiveDetail();
    });

    window.addEventListener('blur', () => {
      if (dialog?.open) closeDetailDialog('window-blur');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && dialog?.open) closeDetailDialog('document-hidden');
    });
  }

  function observeRepairRenders() {
    const repairBody = $('#reparations-body');
    if (!repairBody) return;
    decorateRepairRows();
    new MutationObserver(() => decorateRepairRows()).observe(repairBody, { childList: true });
  }

  function init() {
    if (!window.rdl) return;
    ensureDialog();
    bindRepairEditing();
    bindNavigation();
    observeRepairRenders();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
