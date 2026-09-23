const state = {
  bootstrap: null,
  signalements: [],
  reparations: [],
  lifecycle: { policy: { active: false }, rows: [] },
  privacyEvents: [],
  identitiesVisible: false
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function toast(message, error = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 4200);
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

function hideIdentities() {
  if (!state.identitiesVisible) return;
  state.identitiesVisible = false;
  updatePrivacyButton();
  renderSignalements();
  renderReparations();
}

function setView(name) {
  $$('.nav').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  const labels = {
    dashboard: 'Tableau de bord',
    signalements: 'Signalements',
    reparations: 'Réparations',
    sauvegardes: 'Sauvegardes',
    confidentialite: 'Protection des données',
    systeme: 'Système local'
  };
  $('#page-title').textContent = labels[name] || 'Respect des Lieux PRO';
}

function renderDashboard() {
  const stats = state.bootstrap?.stats || {};
  $('#kpi-total').textContent = stats.signalements || 0;
  $('#kpi-open').textContent = stats.ouverts || 0;
  $('#kpi-repairs').textContent = stats.reparations || 0;
  $('#kpi-photos').textContent = stats.photos || 0;
  $('#kpi-photo-size').textContent = bytes(stats.photosBytes || 0);

  const recent = state.signalements.slice(0, 6);
  $('#recent-list').innerHTML = recent.length
    ? recent.map((s) => `
      <div class="recent-item">
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
  const q = $('#signal-search').value.trim().toLowerCase();
  const rows = state.signalements.filter((s) => {
    if (!q) return true;
    const fields = [s.num, s.date, s.lieu, s.type, s.gravite, s.statut];
    if (state.identitiesVisible) fields.push(s.eleve, s.classe, s.signale_par);
    return fields.some((v) => String(v || '').toLowerCase().includes(q));
  });

  $('#signalements-body').innerHTML = rows.length ? rows.map((s) => `
    <tr>
      <td><strong>${esc(s.num)}</strong></td>
      <td>${esc(s.date)}<br><small>${esc(s.heure)}</small></td>
      <td>${esc(s.lieu)}</td>
      <td>${esc(s.type || '—')}</td>
      <td>${esc(s.gravite || '—')}</td>
      <td>${protectedIdentity(s.eleve)}<br><small>${protectedIdentity(s.classe)}</small></td>
      <td>${statusBadge(s.statut)}</td>
      <td><div class="actions">
        <button class="mini" data-photo="${s.id}">Photo (${Number(s.photo_count || 0)})</button>
        <button class="mini" data-repair="${s.id}">Réparation</button>
        <button class="mini" data-close="${s.id}">${s.statut === 'Clos' ? 'Rouvrir' : 'Clore'}</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="8">Aucun signalement.</td></tr>';
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
        <button class="mini" data-reduce="${row.id}" ${row.identity_reduced_at ? 'disabled' : ''}>Réduire les identifiants</button>
        <button class="mini danger-mini" data-purge="${row.id}" data-num="${esc(row.num)}">Supprimer</button>
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
    access_review_exported: 'Dossier de revue exporté'
  };
  return labels[type] || type;
}

function renderPrivacyEvents() {
  const rows = state.privacyEvents || [];
  $('#privacy-events').innerHTML = rows.length ? rows.slice(0, 12).map((event) => `
    <div class="event-row">
      <div><strong>${esc(eventLabel(event.event_type))}</strong>${event.dossier_num ? `<small>${esc(event.dossier_num)}</small>` : ''}</div>
      <time>${dateFr(event.created_at)}</time>
    </div>`).join('') : 'Aucune opération.';
}

async function reload() {
  state.bootstrap = await window.rdl.bootstrap();
  state.signalements = state.bootstrap.signalements;
  state.reparations = state.bootstrap.reparations;
  state.lifecycle = state.bootstrap.lifecycle || { policy: state.bootstrap.retention || { active: false }, rows: [] };
  state.privacyEvents = state.bootstrap.privacyEvents || [];
  renderDashboard();
  renderSignalements();
  renderReparations();
  renderRetention();
  renderLifecycle();
  renderPrivacyEvents();
  updatePrivacyButton();
}

function formPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function createBackup() {
  try {
    const result = await window.rdl.createBackup();
    toast(`Sauvegarde créée : ${result.folder}`);
  } catch (error) {
    toast(`Sauvegarde impossible : ${error.message}`, true);
  }
}

function toggleRetentionFields() {
  const active = $('#retention-enabled').checked;
  $('#retention-months').disabled = !active;
  $('#retention-note').disabled = !active;
  $('#retention-confirmed').disabled = !active;
  if (!active) $('#retention-confirmed').checked = false;
}

function bindStaticEvents() {
  $$('.nav').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('[data-goto]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goto)));

  $('#privacy-toggle').addEventListener('click', () => {
    state.identitiesVisible = !state.identitiesVisible;
    updatePrivacyButton();
    renderSignalements();
    renderReparations();
  });

  $('#new-signalement').addEventListener('click', () => {
    const form = $('#signal-form');
    form.reset();
    form.elements.date.value = new Date().toISOString().slice(0, 10);
    $('#signal-dialog').showModal();
  });

  $('#signal-search').addEventListener('input', renderSignalements);
  $('#backup-now').addEventListener('click', createBackup);
  $('#backup-view-action').addEventListener('click', createBackup);
  $('#open-backups').addEventListener('click', () => window.rdl.openBackupsFolder());
  $('#open-data').addEventListener('click', () => window.rdl.openDataFolder());
  $('#open-exports').addEventListener('click', () => window.rdl.openExportsFolder());

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

  $('#signal-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await window.rdl.createSignalement(formPayload(event.currentTarget));
      $('#signal-dialog').close();
      await reload();
      toast('Signalement enregistré sur ce PC.');
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
    const photo = event.target.closest('[data-photo]');
    const repair = event.target.closest('[data-repair]');
    const close = event.target.closest('[data-close]');
    try {
      if (photo) {
        const result = await window.rdl.attachPhoto(Number(photo.dataset.photo));
        if (!result.canceled) {
          await reload();
          toast('Photo assainie et copiée dans le coffre local.');
        }
      } else if (repair) {
        const form = $('#repair-form');
        form.reset();
        form.elements.signalement_id.value = repair.dataset.repair;
        form.elements.debut.value = new Date().toISOString().slice(0, 10);
        $('#repair-dialog').showModal();
      } else if (close) {
        const id = Number(close.dataset.close);
        const current = state.signalements.find((s) => Number(s.id) === id);
        await window.rdl.updateSignalement(id, { statut: current?.statut === 'Clos' ? 'Ouvert' : 'Clos' });
        await reload();
        toast(current?.statut === 'Clos' ? 'Dossier rouvert.' : 'Dossier clos : sa date de clôture est désormais tracée.');
      }
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('#lifecycle-body').addEventListener('click', async (event) => {
    const reduce = event.target.closest('[data-reduce]');
    const purge = event.target.closest('[data-purge]');
    try {
      if (reduce) {
        const ok = window.confirm('Cette action efface les champs structurés « élève » et « classe » du dossier clos. Les textes libres et photos ne sont pas anonymisés. Continuer ?');
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

  window.addEventListener('blur', hideIdentities);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideIdentities();
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  bindStaticEvents();
  updatePrivacyButton();
  toggleRetentionFields();
  try {
    await reload();
  } catch (error) {
    $('#health-pill').textContent = 'Erreur locale';
    $('#health-pill').className = 'health ko';
    toast(`Démarrage impossible : ${error.message}`, true);
  }
});
