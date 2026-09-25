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

  function closeDetailDialog(reason = 'button') {
    if (!dialog?.open) return false;
    dialog.dataset.closedBy = reason;
    dialog.close();
    return true;
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'signal-detail-dialog';
    dialog.className = 'detail-dialog';
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

    // Deux boutons de sortie directs : aucune délégation fragile ne peut les
    // rendre inopérants à la suite d'un changement de contenu dans la fiche.
    $$('[data-detail-close]', dialog).forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeDetailDialog('button');
      });
    });

    // Troisième sortie : clic explicite sur l'arrière-plan du dialog.
    dialog.addEventListener('click', async (event) => {
      if (event.target === dialog) {
        closeDetailDialog('backdrop');
        return;
      }

      const photo = event.target.closest('[data-detail-open-photo]');
      if (photo) {
        try {
          await window.rdl.openPhoto(Number(photo.dataset.detailOpenPhoto));
        } catch (error) {
          notify(`Ouverture de la photo impossible : ${error.message}`, true);
        }
      }
    });

    // Échap reste disponible, mais n'est plus l'unique moyen de quitter.
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDetailDialog('escape');
    });

    dialog.addEventListener('close', () => {
      activeSignalementId = null;
    });

    return dialog;
  }

  function renderPhotos(photos) {
    if (!photos.length) {
      return '<div class="detail-empty">Aucune photo attachée à ce dossier.</div>';
    }
    return `<div class="detail-photo-list">${photos.map((photo) => `
      <div class="detail-photo-row">
        <div>
          <strong>${esc(photo.original_name || 'Photo JPEG')}</strong>
          <small>${bytes(photo.size_bytes)} · ajoutée le ${dateFr(photo.created_at)}</small>
        </div>
        <button class="mini fiche" type="button" data-detail-open-photo="${Number(photo.id)}">Ouvrir</button>
      </div>`).join('')}</div>`;
  }

  function renderRepairs(reparations) {
    if (!reparations.length) {
      return '<div class="detail-empty">Aucune réparation ou mesure enregistrée.</div>';
    }
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

  function renderDetail(signalement, reparations, photos) {
    const body = $('#signal-detail-body');
    const title = $('#signal-detail-title');
    title.textContent = `Dossier ${signalement.num}`;

    body.innerHTML = `
      <section class="detail-summary">
        <div>
          <span class="detail-number">${esc(signalement.num)}</span>
          <h3>${esc(signalement.lieu || 'Lieu non renseigné')}</h3>
          <p>${esc(signalement.date || '—')}${signalement.heure ? ` · ${esc(signalement.heure)}` : ''}</p>
        </div>
        <div class="detail-summary-status">${statusBadge(signalement.statut)}</div>
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
        ${renderPhotos(photos)}
      </section>

      <section class="detail-block">
        <div class="detail-section-head split"><div><p class="eyebrow">Suivi</p><h3>Réparations et mesures</h3></div><span class="badge">${reparations.length}</span></div>
        ${renderRepairs(reparations)}
      </section>`;
  }

  async function openSignalementById(id) {
    const signalementId = Number(id);
    if (!Number.isSafeInteger(signalementId) || signalementId <= 0) return;
    try {
      const [signalements, reparations, photos] = await Promise.all([
        window.rdl.listSignalements(500),
        window.rdl.listReparations(1000),
        window.rdl.listPhotos(signalementId)
      ]);
      const signalement = signalements.find((row) => Number(row.id) === signalementId);
      if (!signalement) throw new Error('Signalement introuvable.');
      activeSignalementId = signalementId;
      const linkedRepairs = reparations.filter((row) => Number(row.signalement_id) === signalementId);
      ensureDialog();
      renderDetail(signalement, linkedRepairs, photos);
      if (!dialog.open) dialog.showModal();
    } catch (error) {
      notify(`Fiche inaccessible : ${error.message}`, true);
    }
  }

  async function openSignalementByNum(num) {
    const target = String(num || '').trim();
    if (!target) return;
    try {
      const rows = await window.rdl.listSignalements(500);
      const signalement = rows.find((row) => String(row.num) === target);
      if (!signalement) throw new Error(`Dossier ${target} introuvable.`);
      await openSignalementById(signalement.id);
    } catch (error) {
      notify(`Fiche inaccessible : ${error.message}`, true);
    }
  }

  async function refreshActiveDetail() {
    if (!dialog?.open || !activeSignalementId) return;
    const id = activeSignalementId;
    await openSignalementById(id);
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

  async function refreshApplicationData() {
    if (typeof window.reload === 'function') {
      await window.reload();
      return;
    }
    window.location.reload();
  }

  function bindRepairEditing() {
    const form = $('#repair-form');
    const repairDialog = $('#repair-dialog');
    if (!form || !repairDialog) return;
    ensureRepairEditField();

    // Capture=true : en mode édition, ce handler intercepte le submit avant
    // l'ancien chemin de création d'app.js. En mode création il ne fait rien.
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
        await refreshApplicationData();
        await refreshActiveDetail();
        notify('Réparation modifiée et enregistrée localement.');
      } catch (error) {
        notify(`Modification impossible : ${error.message}`, true);
      }
    }, true);

    repairDialog.addEventListener('close', () => setRepairDialogMode(null));
  }

  function decorateSignalRows() {
    const body = $('#signalements-body');
    if (!body) return;
    $$('tr', body).forEach((row) => {
      const numNode = $('td:first-child strong', row);
      const num = numNode?.textContent?.trim();
      if (!num || num === 'Aucun signalement.') return;

      row.classList.add('record-row');
      row.dataset.ficheNum = num;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Ouvrir la fiche ${num}`);
      row.title = 'Cliquer pour ouvrir la fiche complète';

      const actions = $('.actions', row);
      if (actions && !actions.querySelector('[data-fiche]')) {
        const button = document.createElement('button');
        button.className = 'mini fiche';
        button.type = 'button';
        button.dataset.fiche = num;
        button.textContent = 'Fiche';
        button.title = `Ouvrir la fiche ${num}`;
        actions.prepend(button);
      }

      const photoButton = $('[data-photo]', row);
      if (photoButton) {
        const match = /\((\d+)\)/.exec(photoButton.textContent || '');
        const count = match ? Number(match[1]) : 0;
        photoButton.textContent = '+ Photo';
        photoButton.title = count
          ? `${count} photo(s) déjà enregistrée(s). Les consulter depuis la fiche.`
          : 'Ajouter une photo JPEG au dossier';
      }

      const repairButton = $('[data-repair]', row);
      if (repairButton) {
        repairButton.textContent = '+ Réparation';
        repairButton.title = 'Ajouter une réparation ou mesure';
      }
    });
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

  function decorateRecentRows() {
    const list = $('#recent-list');
    if (!list) return;
    $$('.recent-item', list).forEach((item) => {
      const num = $('.recent-num', item)?.textContent?.trim();
      if (!num) return;
      item.classList.add('record-row', 'recent-record-row');
      item.dataset.ficheNum = num;
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Ouvrir la fiche ${num}`);
      item.title = 'Ouvrir la fiche complète';
    });
  }

  function bindNavigation() {
    document.addEventListener('click', (event) => {
      const editRepair = event.target.closest('[data-edit-repair]');
      if (editRepair) {
        event.preventDefault();
        event.stopPropagation();
        openRepairEditor(editRepair.dataset.editRepair);
        return;
      }

      const fiche = event.target.closest('[data-fiche]');
      if (fiche) {
        event.preventDefault();
        event.stopPropagation();
        openSignalementByNum(fiche.dataset.fiche);
        return;
      }

      const createRepair = event.target.closest('[data-repair]');
      if (createRepair) {
        // app.js ouvre le formulaire de création sur le même événement ;
        // ce reset différé garantit qu'un ancien mode édition ne subsiste pas.
        setTimeout(() => setRepairDialogMode(null), 0);
      }

      const row = event.target.closest('[data-fiche-num]');
      if (!row || event.target.closest('button, a, input, select, textarea, label')) return;
      openSignalementByNum(row.dataset.ficheNum);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-fiche-num]');
      if (!row || event.target.closest('button, a, input, select, textarea')) return;
      event.preventDefault();
      openSignalementByNum(row.dataset.ficheNum);
    });

    $('#privacy-toggle')?.addEventListener('click', () => {
      setTimeout(() => refreshActiveDetail(), 0);
    });

    window.addEventListener('blur', () => {
      if (dialog?.open) closeDetailDialog('window-blur');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && dialog?.open) closeDetailDialog('document-hidden');
    });
  }

  function observeRenders() {
    const signalBody = $('#signalements-body');
    if (signalBody) {
      decorateSignalRows();
      new MutationObserver(decorateSignalRows).observe(signalBody, { childList: true });
    }
    const repairBody = $('#reparations-body');
    if (repairBody) {
      decorateRepairRows();
      new MutationObserver(() => decorateRepairRows()).observe(repairBody, { childList: true });
    }
    const recent = $('#recent-list');
    if (recent) {
      decorateRecentRows();
      new MutationObserver(decorateRecentRows).observe(recent, { childList: true });
    }
  }

  function init() {
    if (!window.rdl) return;
    ensureDialog();
    bindRepairEditing();
    bindNavigation();
    observeRenders();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
