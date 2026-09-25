const state = {
  bootstrap: null,
  signalements: [],
  reparations: [],
  lifecycle: { policy: { active: false }, rows: [] },
  privacyEvents: [],
  identitiesVisible: false,
  signalQuery: { query: '', limit: 100, offset: 0, total: 0 }
};

const VIEW_LABELS = Object.freeze({
  dashboard: 'Accueil',
  signalements: 'Signalements',
  reparations: 'Réparations',
  sauvegardes: 'Sauvegardes',
  confidentialite: 'Protection des données',
  systeme: 'Système local'
});

const REQUIRED_DOM_IDS = Object.freeze([
  'app-shell', 'main-region', 'page-title', 'privacy-toggle', 'health-pill',
  'backup-now', 'new-signalement', 'signal-search', 'signalements-body',
  'signal-prev', 'signal-next', 'signal-page', 'reparations-body',
  'backup-view-action', 'open-backups', 'encrypted-backup', 'encrypted-restore',
  'retention-form', 'retention-enabled', 'retention-months', 'retention-note',
  'retention-confirmed', 'rights-query', 'rights-export', 'open-exports',
  'privacy-events', 'lifecycle-body', 'open-data', 'signal-dialog', 'signal-form',
  'repair-dialog', 'repair-form', 'secret-dialog', 'secret-form', 'toast'
]);

let secretResolver = null;
let secretMode = 'export';
let signalDialogInvoker = null;
let signalSearchTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function assertDomContract() {
  const missing = REQUIRED_DOM_IDS.filter((id) => !document.getElementById(id));
  const shells = $$('#app-shell');
  const navigation = $$('#app-shell .nav[data-view]');
  const views = $$('#app-shell .view[data-view-panel]');
  const navNames = navigation.map((node) => node.dataset.view);
  const viewNames = views.map((node) => node.dataset.viewPanel);
  const expectedNames = Object.keys(VIEW_LABELS);

  if (missing.length) throw new Error(`Contrat DOM incomplet : ${missing.join(', ')}`);
  if (shells.length !== 1) throw new Error(`Contrat DOM invalide : ${shells.length} shell(s) détectée(s).`);
  if (navigation.length !== expectedNames.length) throw new Error(`Navigation invalide : ${navigation.length} destination(s).`);
  if (views.length !== expectedNames.length) throw new Error(`Vues invalides : ${views.length} vue(s).`);
  if (expectedNames.some((name) => !navNames.includes(name) || !viewNames.includes(name))) {
    throw new Error('Navigation et vues métier désynchronisées.');
  }
}

function toast(message, error = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 4200);
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

function statusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  const cls = normalized === 'clos' || normalized === 'terminée' ? 'closed' : 'open';
  return `<span class="badge ${cls}">${esc(status || '—')}</span>`;
}

function protectedIdentity(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  return state.identitiesVisible ? esc(text) : '<span class="masked" title="Information masquée">••••••</span>';
}

function updatePrivacyButton() {
  const button = $('#privacy-toggle');
  button.setAttribute('aria-pressed', String(state.identitiesVisible));
  button.textContent = state.identitiesVisible ? 'Masquer les identités' : 'Afficher les identités';
  button.classList.toggle('privacy-active', state.identitiesVisible);
}

async function hideIdentities() {
  if (!state.identitiesVisible) return;
  state.identitiesVisible = false;
  updatePrivacyButton();
  renderReparations();
  await refreshSignalements();
}

function setView(name) {
  if (!Object.hasOwn(VIEW_LABELS, name)) return false;

  $$('#app-shell .nav[data-view]').forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  $$('#app-shell .view[data-view-panel]').forEach((view) => {
    const active = view.dataset.viewPanel === name;
    view.classList.toggle('active', active);
    view.hidden = !active;
  });

  $('#page-title').textContent = VIEW_LABELS[name];
  document.title = `${VIEW_LABELS[name]} — Respect des Lieux PRO`;
  $('#app-shell').dataset.activeView = name;
  return true;
}

function renderDashboard() {
  const stats = state.bootstrap?.stats || {};
  $('#kpi-total').textContent = stats.signalements || 0;
  $('#kpi-open').textContent = stats.ouverts || 0;
  $('#kpi-repairs').textContent = stats.reparations || 0;
  $('#kpi-photos').textContent = stats.photos || 0;
  $('#kpi-photo-size').textContent = bytes(stats.photosBytes || 0);

  const recent = (state.bootstrap?.signalements || state.signalements).slice(0, 6);
  $('#recent-list').innerHTML = recent.length
    ? recent.map((s) => `
      <div class="recent-item record-row" data-fiche-id="${Number(s.id)}" tabindex="0" role="button" aria-label="Ouvrir la fiche ${esc(s.num)}">
        <div class="recent-num">${esc(s.num)}</div>
        <div class="recent-main"><strong>${esc(s.lieu)}</strong><small>${esc(s.date)} · ${esc(s.type || 'Non catégorisé')}</small></div>
        ${statusBadge(s.statut)}
      </div>`).join('')
    : 'Aucun signalement.';

  const paths = state.bootstrap?.paths || {};
  $('#fact-db').textContent = paths.database || '—';
  $('#fact-integrity').textContent = state.bootstrap?.integrity?.ok ? 'OK' : 'À vérifier';
  $('#fact-version').textContent = state.bootstrap?.appVersion || '—';
  $('#fact-retention').textContent = state.lifecycle?.policy?.active
    ? `${state.lifecycle.policy.months} mois · réexamen manuel`
    : 'non configurée';
  $('#sys-root').textContent = paths.root || '—';
  $('#sys-db').textContent = paths.database || '—';
  $('#sys-backups').textContent = paths.backups || '—';
  $('#sys-exports').textContent = paths.exports || '—';

  const health = $('#health-pill');
  health.textContent = state.bootstrap?.integrity?.ok ? 'Base locale saine' : 'Contrôle requis';
  health.className = `health ${state.bootstrap?.integrity?.ok ? 'ok' : 'ko'}`;
}

function renderSignalements() {
  const rows = state.signalements;
  $('#signalements-body').innerHTML = rows.length ? rows.map((s) => {
    const closed = s.statut === 'Clos';
    return `
      <tr class="record-row" data-fiche-id="${Number(s.id)}" tabindex="0" role="button" aria-label="Ouvrir la fiche ${esc(s.num)}">
        <td><strong>${esc(s.num)}</strong></td>
        <td>${esc(s.date)}<br><small>${esc(s.heure)}</small></td>
        <td>${esc(s.lieu)}</td>
        <td>${esc(s.type || '—')}</td>
        <td>${esc(s.gravite || '—')}</td>
        <td>${protectedIdentity(s.eleve)}<br><small>${protectedIdentity(s.classe)}</small></td>
        <td>${statusBadge(s.statut)}</td>
        <td><div class="actions">
          <button class="mini fiche" type="button" data-fiche-id="${Number(s.id)}">Fiche</button>
          <button class="mini" type="button" data-edit-signalement="${Number(s.id)}" ${closed ? 'disabled title="Rouvrez le dossier pour le modifier"' : ''}>Modifier</button>
          <button class="mini" type="button" data-photo="${Number(s.id)}" ${closed ? 'disabled title="Rouvrez le dossier pour ajouter une photo"' : ''}>+ Photo</button>
          <button class="mini" type="button" data-repair="${Number(s.id)}" ${closed ? 'disabled title="Rouvrez le dossier pour ajouter une réparation"' : ''}>+ Réparation</button>
          <button class="mini" type="button" data-set-status="${Number(s.id)}" data-status-target="${closed ? 'Ouvert' : 'Clos'}">${closed ? 'Rouvrir' : 'Clore'}</button>
        </div></td>
      </tr>`;
  }).join('') : '<tr><td colspan="8">Aucun signalement.</td></tr>';

  const { offset, limit, total } = state.signalQuery;
  const start = total ? offset + 1 : 0;
  const end = Math.min(offset + rows.length, total);
  $('#signal-page').textContent = total ? `${start}–${end} sur ${total}` : '0 dossier';
  $('#signal-prev').disabled = offset <= 0;
  $('#signal-next').disabled = offset + limit >= total;
}

async function refreshSignalements({ resetOffset = false } = {}) {
  if (resetOffset) state.signalQuery.offset = 0;
  const result = await window.rdl.querySignalements({
    query: state.signalQuery.query,
    limit: state.signalQuery.limit,
    offset: state.signalQuery.offset,
    includeIdentities: state.identitiesVisible
  });
  state.signalements = result.rows || [];
  state.signalQuery.total = Number(result.total || 0);
  state.signalQuery.limit = Number(result.limit || state.signalQuery.limit);
  state.signalQuery.offset = Number(result.offset || 0);
  renderSignalements();
}

function renderReparations() {
  $('#reparations-body').innerHTML = state.reparations.length ? state.reparations.map((r) => `
    <tr>
      <td><strong>${esc(r.signalement_num)}</strong><br><small>${esc(r.signalement_lieu)}</small></td>
      <td>${esc(r.mesure || '—')}</td>
      <td>${protectedIdentity(r.referent)}</td>
      <td>${esc(r.debut || '—')}</td>
      <td>${esc(r.duree || '—')}</td>
      <td>${statusBadge(r.statut)}</td>
    </tr>`).join('') : '<tr><td colspan="6">Aucune réparation.</td></tr>';
}

function lifecycleBadge(row) {
  const labels = { due: 'À traiter', soon: 'Échéance proche', future: 'Planifié' };
  return `<span class="lifecycle-badge ${esc(row.lifecycle_state)}">${labels[row.lifecycle_state] || 'Planifié'}</span>`;
}

function renderRetention() {
  const policy = state.lifecycle?.policy || { active: false };
  const enabled = $('#retention-enabled');
  const months = $('#retention-months');
  const note = $('#retention-note');
  const confirmed = $('#retention-confirmed');
  enabled.checked = Boolean(policy.active);
  months.disabled = !policy.active;
  note.disabled = !policy.active;
  confirmed.disabled = !policy.active;
  months.value = policy.active ? policy.months : '';
  note.value = policy.active ? (policy.note || '') : '';
  confirmed.checked = Boolean(policy.active);

  const status = $('#retention-status');
  status.textContent = policy.active ? `${policy.months} mois · validée` : 'Non configurée';
  status.className = `health ${policy.active ? 'ok' : 'neutral'}`;
}

function renderLifecycle() {
  const policy = state.lifecycle?.policy || { active: false };
  const rows = state.lifecycle?.rows || [];
  $('#lifecycle-count').textContent = rows.length;
  if (!policy.active) {
    $('#lifecycle-body').innerHTML = '<tr><td colspan="6">Politique de conservation non configurée : aucun calcul d’échéance n’est effectué.</td></tr>';
    return;
  }
  $('#lifecycle-body').innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td><strong>${esc(row.num)}</strong><br><small>${esc(row.lieu)}</small></td>
      <td>${dateFr(row.closed_at)}</td>
      <td>${dateFr(row.due_at)}${Number.isFinite(row.days_remaining) ? `<br><small>${row.days_remaining <= 0 ? `${Math.abs(row.days_remaining)} j dépassés` : `${row.days_remaining} j restants`}</small>` : ''}</td>
      <td>${lifecycleBadge(row)}</td>
      <td>${row.identity_reduced_at ? '<span class="badge closed">réduits</span>' : '<span class="badge open">présents</span>'}</td>
      <td><div class="actions">
        <button class="mini" type="button" data-reduce="${row.id}" ${row.identity_reduced_at ? 'disabled' : ''}>Réduire les identifiants</button>
        <button class="mini danger-mini" type="button" data-purge="${row.id}" data-num="${esc(row.num)}">Supprimer</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="6">Aucun dossier clos à examiner.</td></tr>';
}

function eventLabel(type) {
  const labels = {
    retention_policy_enabled: 'Politique de conservation activée',
    retention_policy_disabled: 'Politique de conservation désactivée',
    direct_identifiers_reduced: 'Identifiants directs réduits',
    dossier_purged: 'Dossier supprimé',
    purge_reapplied_after_restore: 'Suppression réappliquée après restauration',
    access_review_exported: 'Dossier de revue exporté',
    encrypted_backup_exported: 'Sauvegarde chiffrée exportée',
    encrypted_restore_prepared: 'Restauration chiffrée préparée'
  };
  return labels[type] || type;
}

function renderPrivacyEvents() {
  const rows = state.privacyEvents || [];
  const container = $('#privacy-events');
  container.classList.toggle('empty-state', rows.length === 0);
  container.innerHTML = rows.length ? rows.map((row) => `
    <div class="event-row">
      <div><strong>${esc(eventLabel(row.event_type))}</strong><small>${esc(row.dossier_num || row.signalement_num || '—')} · ${esc(row.detail || row.details || '—')}</small></div>
      <time datetime="${esc(row.created_at || '')}">${esc(new Date(row.created_at).toLocaleString('fr-FR'))}</time>
    </div>`).join('') : 'Aucune opération.';
}

async function reload() {
  const [bootstrap, signalPage, reparations, lifecycle, privacyEvents] = await Promise.all([
    window.rdl.bootstrap(),
    window.rdl.querySignalements({
      query: state.signalQuery.query,
      limit: state.signalQuery.limit,
      offset: state.signalQuery.offset,
      includeIdentities: state.identitiesVisible
    }),
    window.rdl.listReparations(10000),
    window.rdl.lifecycleReview(),
    window.rdl.listPrivacyEvents(200)
  ]);
  state.bootstrap = bootstrap;
  state.signalements = signalPage.rows || [];
  state.signalQuery.total = Number(signalPage.total || 0);
  state.signalQuery.limit = Number(signalPage.limit || state.signalQuery.limit);
  state.signalQuery.offset = Number(signalPage.offset || 0);
  state.reparations = reparations;
  state.lifecycle = lifecycle;
  state.privacyEvents = privacyEvents;
  renderDashboard();
  renderSignalements();
  renderReparations();
  renderRetention();
  renderLifecycle();
  renderPrivacyEvents();
}

function formPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function closeSignalDialog(reason = 'cancel') {
  const dialog = $('#signal-dialog');
  if (!dialog.open) return;
  dialog.dataset.closedBy = reason;
  dialog.close();
}

function resetSignalIdentityFields(form) {
  ['eleve', 'classe', 'signale_par'].forEach((name) => {
    const field = form.elements[name];
    field.disabled = false;
    field.value = '';
  });
}

function openCreateSignalement(invoker = null) {
  const dialog = $('#signal-dialog');
  const form = $('#signal-form');
  signalDialogInvoker = invoker || document.activeElement;
  form.reset();
  resetSignalIdentityFields(form);
  form.elements.signalement_id.value = '';
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  dialog.dataset.mode = 'create';
  $('#signal-dialog-eyebrow').textContent = 'Nouveau dossier';
  $('#signal-dialog-title').textContent = 'Créer un signalement';
  $('#save-signalement').textContent = 'Enregistrer localement';
  dialog.showModal();
  setTimeout(() => form.elements.lieu.focus(), 20);
}

async function openSignalementEditor(id, invoker = null) {
  const signalementId = Number(id);
  if (!Number.isSafeInteger(signalementId) || signalementId <= 0) return;
  try {
    const detail = await window.rdl.getSignalementDetail(signalementId);
    const signalement = detail.signalement;
    if (!signalement) throw new Error('Signalement introuvable.');
    if (signalement.statut === 'Clos') throw new Error('Rouvrez le dossier avant de modifier ses informations.');

    const dialog = $('#signal-dialog');
    const form = $('#signal-form');
    signalDialogInvoker = invoker || document.activeElement;
    form.reset();
    form.elements.signalement_id.value = String(signalement.id);
    form.elements.date.value = signalement.date || '';
    form.elements.heure.value = signalement.heure || '';
    form.elements.lieu.value = signalement.lieu || '';
    form.elements.type.value = signalement.type || '';
    form.elements.gravite.value = signalement.gravite || '';
    form.elements.description.value = signalement.description || '';

    const identityReduced = Boolean(signalement.identity_reduced_at);
    ['eleve', 'classe', 'signale_par'].forEach((name) => {
      const field = form.elements[name];
      const canEditIdentity = state.identitiesVisible && !identityReduced;
      field.disabled = !canEditIdentity;
      field.value = canEditIdentity ? (signalement[name] || '') : '';
    });

    dialog.dataset.mode = 'edit';
    $('#signal-dialog-eyebrow').textContent = 'Dossier existant';
    $('#signal-dialog-title').textContent = `Modifier ${signalement.num}`;
    $('#save-signalement').textContent = 'Enregistrer les modifications';
    dialog.showModal();
    setTimeout(() => form.elements.lieu.focus(), 20);
  } catch (error) {
    toast(`Modification impossible : ${error.message}`, true);
  }
}

function askSecret(mode) {
  secretMode = mode;
  const dialog = $('#secret-dialog');
  const form = $('#secret-form');
  form.reset();
  $('#secret-title').textContent = mode === 'export' ? 'Créer une sauvegarde chiffrée' : 'Restaurer une sauvegarde chiffrée';
  $('#secret-description').textContent = mode === 'export'
    ? 'Choisissez une phrase secrète d’au moins 12 caractères. Elle ne sera pas stockée dans l’application.'
    : 'Saisissez la phrase secrète utilisée lors de la création du fichier .rdlbackup.';
  $('#secret-confirm-row').hidden = mode !== 'export';
  $('#secret-warning').textContent = mode === 'export'
    ? 'Conservez cette phrase dans un endroit sûr et distinct de la sauvegarde. Sans elle, le fichier chiffré ne peut pas être restauré.'
    : 'La restauration est vérifiée avant remplacement et crée d’abord une sauvegarde de sécurité de l’état actuel.';
  dialog.showModal();
  setTimeout(() => $('#secret-passphrase').focus(), 50);
  return new Promise((resolve) => { secretResolver = resolve; });
}

function bindSecretDialog() {
  $('#secret-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const passphrase = $('#secret-passphrase').value;
    const confirmation = $('#secret-confirm').value;
    if (passphrase.length < 12) {
      toast('La phrase secrète doit contenir au moins 12 caractères.', true);
      return;
    }
    if (secretMode === 'export' && passphrase !== confirmation) {
      toast('Les deux phrases secrètes ne correspondent pas.', true);
      return;
    }
    $('#secret-dialog').close('ok');
    secretResolver?.(passphrase);
    secretResolver = null;
  });
  $('#secret-dialog').addEventListener('close', () => {
    if (secretResolver) secretResolver(null);
    secretResolver = null;
  });
}

function bindSignalDialog() {
  const dialog = $('#signal-dialog');
  const form = $('#signal-form');

  $$('[data-signal-cancel]').forEach((button) => {
    button.addEventListener('click', () => closeSignalDialog('button'));
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeSignalDialog('backdrop');
  });
  dialog.addEventListener('close', () => {
    resetSignalIdentityFields(form);
    const target = signalDialogInvoker;
    signalDialogInvoker = null;
    if (target && typeof target.focus === 'function' && target.isConnected) target.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('#save-signalement');
    await withBusy(submit, async () => {
      try {
        const payload = formPayload(form);
        const id = Number(payload.signalement_id || 0);
        delete payload.signalement_id;
        if (id) await window.rdl.updateSignalement(id, payload);
        else await window.rdl.createSignalement(payload);
        closeSignalDialog(id ? 'updated' : 'created');
        state.signalQuery.offset = 0;
        await reload();
        document.dispatchEvent(new CustomEvent('rdl:signalements-changed'));
        toast(id ? 'Signalement modifié.' : 'Signalement enregistré sur ce PC.');
      } catch (error) {
        toast(error.message, true);
      }
    });
  });
}

function toggleRetentionFields() {
  const enabled = $('#retention-enabled').checked;
  $('#retention-months').disabled = !enabled;
  $('#retention-note').disabled = !enabled;
  $('#retention-confirmed').disabled = !enabled;
}

async function createLocalBackup() {
  try {
    await window.rdl.createBackup();
    await reload();
    toast('Sauvegarde locale créée.');
  } catch (error) {
    toast(`Sauvegarde impossible : ${error.message}`, true);
  }
}

function bindStaticEvents() {
  $$('#app-shell .nav[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('[data-goto]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goto)));

  $('#privacy-toggle').addEventListener('click', async () => {
    state.identitiesVisible = !state.identitiesVisible;
    updatePrivacyButton();
    renderReparations();
    await refreshSignalements({ resetOffset: true });
    document.dispatchEvent(new CustomEvent('rdl:privacy-visibility-changed'));
  });

  $('#signal-search').addEventListener('input', (event) => {
    clearTimeout(signalSearchTimer);
    signalSearchTimer = setTimeout(async () => {
      state.signalQuery.query = event.target.value.trim();
      try {
        await refreshSignalements({ resetOffset: true });
      } catch (error) {
        toast(`Recherche impossible : ${error.message}`, true);
      }
    }, 180);
  });

  $('#signal-prev').addEventListener('click', async (event) => {
    await withBusy(event.currentTarget, async () => {
      state.signalQuery.offset = Math.max(0, state.signalQuery.offset - state.signalQuery.limit);
      await refreshSignalements();
    });
  });
  $('#signal-next').addEventListener('click', async (event) => {
    await withBusy(event.currentTarget, async () => {
      state.signalQuery.offset += state.signalQuery.limit;
      await refreshSignalements();
    });
  });

  $('#new-signalement').addEventListener('click', (event) => openCreateSignalement(event.currentTarget));

  $('#backup-now').addEventListener('click', createLocalBackup);
  $('#backup-view-action').addEventListener('click', createLocalBackup);
  $('#open-data').addEventListener('click', () => window.rdl.openDataFolder());
  $('#open-backups').addEventListener('click', () => window.rdl.openBackupsFolder());
  $('#open-exports').addEventListener('click', () => window.rdl.openExportsFolder());

  $('#encrypted-backup').addEventListener('click', async () => {
    const passphrase = await askSecret('export');
    if (!passphrase) return;
    try {
      const result = await window.rdl.exportEncryptedBackup(passphrase);
      if (result.canceled) return;
      await reload();
      toast('Sauvegarde chiffrée créée. Conservez le fichier et sa phrase secrète séparément.');
    } catch (error) {
      toast(`Export chiffré impossible : ${error.message}`, true);
    }
  });

  $('#encrypted-restore').addEventListener('click', async () => {
    const passphrase = await askSecret('restore');
    if (!passphrase) return;
    try {
      const result = await window.rdl.prepareEncryptedRestore(passphrase);
      if (result.canceled) return;
      const restart = window.confirm('Sauvegarde vérifiée. Une copie de sécurité de l’état actuel a été créée. Redémarrer maintenant pour appliquer la restauration ?');
      if (restart) await window.rdl.restartApp();
      else toast('Restauration prête : elle sera appliquée au prochain redémarrage de l’application.');
    } catch (error) {
      toast(`Restauration refusée : ${error.message}`, true);
    }
  });

  $('#retention-enabled').addEventListener('change', toggleRetentionFields);
  $('#retention-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const enabled = $('#retention-enabled').checked;
    try {
      await window.rdl.configureRetentionPolicy({
        enabled,
        months: enabled ? Number($('#retention-months').value) : null,
        note: enabled ? $('#retention-note').value : '',
        confirmed: enabled ? $('#retention-confirmed').checked : false
      });
      await reload();
      toast(enabled ? 'Politique de réexamen enregistrée.' : 'Politique de réexamen désactivée.');
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('#rights-export').addEventListener('click', async () => {
    const query = $('#rights-query').value.trim();
    try {
      const result = await window.rdl.exportAccessReview(query);
      if (result.canceled) return;
      await reload();
      toast(`Revue préparée (${result.matches} dossier(s)). Vérifiez les données de tiers avant toute communication.`);
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('#repair-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await window.rdl.createReparation(formPayload(event.currentTarget));
      $('#repair-dialog').close();
      await reload();
      toast('Réparation enregistrée localement.');
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('#signalements-body').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-signalement]');
    const photo = event.target.closest('[data-photo]');
    const repair = event.target.closest('[data-repair]');
    const status = event.target.closest('[data-set-status]');
    try {
      if (edit) {
        await openSignalementEditor(edit.dataset.editSignalement, edit);
      } else if (photo) {
        await withBusy(photo, async () => {
          const result = await window.rdl.attachPhoto(Number(photo.dataset.photo));
          if (!result.canceled) {
            await reload();
            document.dispatchEvent(new CustomEvent('rdl:signalements-changed'));
            toast('Photo assainie et copiée dans le coffre local.');
          }
        });
      } else if (repair) {
        const form = $('#repair-form');
        form.reset();
        form.elements.signalement_id.value = repair.dataset.repair;
        form.elements.debut.value = new Date().toISOString().slice(0, 10);
        $('#repair-dialog').showModal();
      } else if (status) {
        await withBusy(status, async () => {
          const target = status.dataset.statusTarget;
          await window.rdl.setSignalementStatus(Number(status.dataset.setStatus), target);
          await reload();
          document.dispatchEvent(new CustomEvent('rdl:signalements-changed'));
          toast(target === 'Clos' ? 'Dossier clos : sa date de clôture est tracée.' : 'Dossier rouvert.');
        });
      }
    } catch (error) {
      toast(error.message, true);
    }
  });

  document.addEventListener('rdl:edit-signalement', async (event) => {
    await openSignalementEditor(event.detail?.id, event.detail?.invoker || null);
  });
  document.addEventListener('rdl:signalements-changed', async () => {
    try { await refreshSignalements(); } catch (error) { console.error(error); }
  });

  $('#lifecycle-body').addEventListener('click', async (event) => {
    const reduce = event.target.closest('[data-reduce]');
    const purge = event.target.closest('[data-purge]');
    try {
      if (reduce) {
        const ok = window.confirm('Cette action efface les champs structurés « élève », « classe » et « signalé par » du dossier clos. Les textes libres et photos ne sont pas anonymisés. Continuer ?');
        if (!ok) return;
        await window.rdl.reduceDirectIdentifiers(Number(reduce.dataset.reduce));
        await reload();
        toast('Identifiants structurés réduits. Vérifiez encore les textes libres et photographies.');
      } else if (purge) {
        const num = purge.dataset.num;
        const typed = window.prompt(`Suppression définitive du dossier ${num}.\nTapez exactement ${num} pour confirmer.`);
        if (typed === null) return;
        await window.rdl.purgeSignalement(Number(purge.dataset.purge), typed.trim());
        await reload();
        toast(`Dossier ${num} supprimé de la base active. Le registre de purge empêchera sa réapparition après restauration.`);
      }
    } catch (error) {
      toast(error.message, true);
    }
  });

  window.addEventListener('blur', () => { void hideIdentities(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void hideIdentities();
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  const shell = $('#app-shell');
  try {
    assertDomContract();
    bindSecretDialog();
    bindSignalDialog();
    bindStaticEvents();
    updatePrivacyButton();
    toggleRetentionFields();
    setView('dashboard');
    await reload();
    shell.dataset.shellReady = 'true';
  } catch (error) {
    if (shell) shell.dataset.shellReady = 'false';
    const health = $('#health-pill');
    if (health) {
      health.textContent = 'Erreur locale';
      health.className = 'health ko';
    }
    if ($('#toast')) toast(`Démarrage impossible : ${error.message}`, true);
    console.error('RDL startup failed:', error);
  }
});
