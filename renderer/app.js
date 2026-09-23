const state = {
  bootstrap: null,
  signalements: [],
  reparations: [],
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
  toast.timer = setTimeout(() => node.classList.remove('show'), 3200);
}

function bytes(value) {
  const n = Number(value || 0);
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

function statusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  const cls = normalized === 'clos' || normalized === 'terminée' ? 'closed' : 'open';
  return `<span class="badge ${cls}">${esc(status || '—')}</span>`;
}

function protectedIdentity(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  return state.identitiesVisible ? esc(text) : '<span class="masked" title="Identité masquée">••••••</span>';
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
  $('#sys-root').textContent = paths.root || '—';
  $('#sys-db').textContent = paths.database || '—';
  $('#sys-backups').textContent = paths.backups || '—';

  const health = $('#health-pill');
  health.textContent = state.bootstrap?.integrity?.ok ? 'Base locale saine' : 'Contrôle requis';
  health.className = `health ${state.bootstrap?.integrity?.ok ? 'ok' : 'ko'}`;
}

function renderSignalements() {
  const q = $('#signal-search').value.trim().toLowerCase();
  const rows = state.signalements.filter((s) => {
    if (!q) return true;
    return [s.num, s.date, s.lieu, s.type, s.gravite, s.eleve, s.classe, s.statut]
      .some((v) => String(v || '').toLowerCase().includes(q));
  });

  $('#signalements-body').innerHTML = rows.length ? rows.map((s) => `
    <tr>
      <td><strong>${esc(s.num)}</strong></td>
      <td>${esc(s.date)}<br><small>${esc(s.heure)}</small></td>
      <td>${esc(s.lieu)}</td>
      <td>${esc(s.type || '—')}</td>
      <td>${esc(s.gravite || '—')}</td>
      <td>${protectedIdentity(s.eleve)}<br><small>${esc(s.classe || '')}</small></td>
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
      <td>${esc(r.referent || '—')}</td>
      <td>${esc(r.debut || '—')}</td>
      <td>${esc(r.duree || '—')}</td>
      <td>${statusBadge(r.statut)}</td>
    </tr>`).join('') : '<tr><td colspan="6">Aucune réparation.</td></tr>';
}

async function reload() {
  state.bootstrap = await window.rdl.bootstrap();
  state.signalements = state.bootstrap.signalements;
  state.reparations = state.bootstrap.reparations;
  renderDashboard();
  renderSignalements();
  renderReparations();
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

function bindStaticEvents() {
  $$('.nav').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('[data-goto]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goto)));
  $('#privacy-toggle').addEventListener('click', () => {
    state.identitiesVisible = !state.identitiesVisible;
    updatePrivacyButton();
    renderSignalements();
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
        toast('Statut mis à jour.');
      }
    } catch (error) {
      toast(error.message, true);
    }
  });

  // Protection contre l'affichage accidentel d'identités lors d'un changement de fenêtre.
  window.addEventListener('blur', hideIdentities);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideIdentities();
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  bindStaticEvents();
  updatePrivacyButton();
  try {
    await reload();
  } catch (error) {
    $('#health-pill').textContent = 'Erreur locale';
    $('#health-pill').className = 'health ko';
    toast(`Démarrage impossible : ${error.message}`, true);
  }
});
