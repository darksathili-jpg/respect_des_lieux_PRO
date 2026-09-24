(() => {
  'use strict';

  const THEME_VERSION = '5.2.1';
  const MASTER_SIGNATURE = 'watteau-v5.2.1';
  const FIDELITY_SIGNATURE = 'master-dashboard-2026-09-24';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const ICONS = Object.freeze({
    app: '<path d="M5 21V8l7-5 7 5v13M9 21v-6h6v6M3 21h18M8 8h.01M12 8h.01M16 8h.01"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/>',
    alert: '<path d="M4 13v-2l11-5v12L4 13Zm0 0v5m11-7 4-2v6l-4-2M7 14v5"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L3 18l3 3 8.7-9.3Z"/>',
    chart: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/><path d="M2 20h20"/>',
    building: '<path d="M4 21V9l8-5 8 5v12M2 21h20M8 21v-8h8v8M8 10h.01M12 10h.01M16 10h.01"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M4.9 7.5 3.5 5.8l2.3-2.3 1.7 1.4A8 8 0 0 1 10 3.8L10.3 2h3.4l.3 1.8a8 8 0 0 1 2.5 1.1l1.7-1.4 2.3 2.3-1.4 1.7a8 8 0 0 1 1.1 2.5l1.8.3v3.4l-1.8.3a8 8 0 0 1-1.1 2.5l1.4 1.7-2.3 2.3-1.7-1.4A8 8 0 0 1 14 20.2l-.3 1.8h-3.4l-.3-1.8a8 8 0 0 1-2.5-1.1l-1.7 1.4-2.3-2.3 1.4-1.7A8 8 0 0 1 3.8 14L2 13.7v-3.4l1.8-.3a8 8 0 0 1 1.1-2.5Z"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2.3-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6m1 3c2.5.5 4 2.4 4 5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    leaf: '<path d="M20 4C12 4 5 8 5 15c0 3 2 5 5 5 7 0 10-8 10-16Z"/><path d="M4 21c3-5 7-8 12-10"/>',
    graduate: '<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3 3 9 3 12 0v-5M22 9v6"/>',
    book: '<path d="M4 5h6a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4z"/><path d="M20 5h-6a3 3 0 0 0-3 3v11a3 3 0 0 1 3-3h6z"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M8 14c-2-1-3-3-3-5a7 7 0 0 1 14 0c0 2-1 4-3 5-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
    window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
    more: '<circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>'
  });

  const svg = (name, cls = 'ui-icon') =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.app}</svg>`;

  function watteauMark() {
    return `
      <svg class="watteau-mark" viewBox="0 0 300 205" aria-label="Lycée Watteau Valenciennes" role="img">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <g stroke-width="3.2">
            <path d="M67 103V72l48-25 42 18v38M157 103V61l37-17 40 24v35M52 103h199"/>
            <path d="M77 73h70M167 64h57M89 103V81h16v22M117 103V75h17v28M177 103V72h16v31M204 103V77h15v26"/>
            <path d="M119 47V26h28v21M115 28h36M119 20h28M123 15h20M129 10h8"/>
            <path d="M80 70 115 49l42 17M157 62l38-18 39 24"/>
          </g>
          <path d="M48 110c62-18 146-18 205 0" stroke-width="2.2"/>
        </g>
        <text x="150" y="129" text-anchor="middle" fill="currentColor" font-size="14" font-family="Segoe UI,Arial,sans-serif" letter-spacing="6">LYCÉE</text>
        <text x="150" y="166" text-anchor="middle" fill="currentColor" font-size="48" font-family="Segoe Script,Segoe Print,cursive" font-style="italic">Watteau</text>
        <line x1="88" y1="181" x2="116" y2="181" stroke="currentColor" stroke-width="1.5"/>
        <line x1="184" y1="181" x2="212" y2="181" stroke="currentColor" stroke-width="1.5"/>
        <text x="150" y="185" text-anchor="middle" fill="currentColor" font-size="9" font-family="Segoe UI,Arial,sans-serif" letter-spacing="4">VALENCIENNES</text>
      </svg>`;
  }

  function schoolHeroArt() {
    return `
      <svg class="school-hero-art" viewBox="0 0 760 260" aria-hidden="true">
        <defs>
          <linearGradient id="brick" x1="0" x2="1"><stop stop-color="#d8745c"/><stop offset="1" stop-color="#a93030"/></linearGradient>
          <linearGradient id="tower" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f5d6c4"/><stop offset="1" stop-color="#d79073"/></linearGradient>
        </defs>
        <g opacity=".18" fill="#b43b31">
          <circle cx="52" cy="220" r="55"/><circle cx="105" cy="208" r="62"/><circle cx="160" cy="224" r="50"/>
          <circle cx="643" cy="220" r="65"/><circle cx="704" cy="210" r="58"/>
        </g>
        <g>
          <rect x="354" y="91" width="80" height="150" rx="6" fill="url(#tower)"/>
          <ellipse cx="394" cy="86" rx="43" ry="13" fill="#a62f2d"/>
          <ellipse cx="394" cy="78" rx="38" ry="13" fill="#f1cdb9" stroke="#a62f2d" stroke-width="4"/>
          <path d="M358 62c6-17 66-17 72 0" fill="#f1cdb9" stroke="#a62f2d" stroke-width="4"/>
          <path d="M367 59h54M367 110h54M367 137h54" stroke="#a62f2d" stroke-width="3"/>
          <g stroke="#8f2929" stroke-width="3"><path d="M371 97v-13M386 97v-13M402 97v-13M417 97v-13"/><path d="M371 128v-12M386 128v-12M402 128v-12M417 128v-12"/></g>
          <path d="M246 241V132l102-45 88 38v116z" fill="#cf6c55"/>
          <path d="M434 241V126l96-42 104 48v109z" fill="url(#brick)"/>
          <path d="M530 84v157h104V132z" fill="#a32c2c"/>
          <path d="M246 132 348 87l86 38M434 126l96-42 104 48" fill="none" stroke="#f3c8b4" stroke-width="6"/>
          <path d="M514 93h31M520 79h20" stroke="#8d2727" stroke-width="5"/>
          <g fill="#f9efe7" stroke="#8a2b2b" stroke-width="2">
            <rect x="270" y="149" width="20" height="37" rx="8"/><rect x="307" y="137" width="20" height="49" rx="8"/><rect x="365" y="145" width="20" height="41" rx="8"/>
            <rect x="458" y="146" width="20" height="40" rx="8"/><rect x="495" y="132" width="20" height="54" rx="8"/><rect x="553" y="143" width="22" height="43" rx="10"/><rect x="595" y="151" width="20" height="35" rx="8"/>
            <rect x="270" y="199" width="20" height="42" rx="8"/><rect x="307" y="197" width="20" height="44" rx="8"/><rect x="365" y="199" width="20" height="42" rx="8"/><rect x="458" y="198" width="20" height="43" rx="8"/><rect x="495" y="197" width="20" height="44" rx="8"/><rect x="595" y="199" width="20" height="42" rx="8"/>
          </g>
          <circle cx="582" cy="120" r="9" fill="#fbefe7"/><g fill="none" stroke="#f5d2c1" stroke-width="3"><path d="M548 124h68"/><path d="M548 190h68"/></g>
        </g>
        <g fill="#9e3531" opacity=".95"><rect x="202" y="185" width="9" height="58"/><circle cx="205" cy="173" r="38"/><circle cx="174" cy="187" r="28"/><circle cx="235" cy="188" r="31"/><rect x="675" y="199" width="8" height="42"/><circle cx="680" cy="191" r="34"/><circle cx="650" cy="202" r="25"/><circle cx="710" cy="202" r="27"/></g>
      </svg>`;
  }

  function injectStyles() {
    if ($('#rdl-theme-v521')) return;
    const style = document.createElement('style');
    style.id = 'rdl-theme-v521';
    style.textContent = `
      :root{--wat-navy:#173e5c;--wat-navy-deep:#15364f;--wat-red:#8b1e24;--wat-coral:#c63a32;--wat-terra:#d76e52;--wat-cream:#fbf7f2;--wat-paper:#fffefb;--wat-border:#ebe2db;--wat-text:#103d5f;--wat-muted:#768a9c;--accent:#c63a32;--bg:#fbf7f2;--surface:#fffefb;--surface2:#f9f5f1;--ink:#173e5c;--muted:#768a9c;--border:#ebe2db;--green:#2f9c5e;--amber:#e18d28;--red:#c53d39;--radius:14px;--shadow:0 5px 18px rgba(37,49,59,.07)}
      *{box-sizing:border-box}html,body{background:var(--wat-cream)!important;color:var(--wat-text);font-family:"Segoe UI Variable","Segoe UI",Arial,sans-serif}body{overflow-x:hidden}
      .ui-icon{display:block!important;width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;max-width:24px!important;max-height:24px!important}
      .shell{grid-template-columns:clamp(270px,23vw,350px) minmax(0,1fr)!important;background:var(--wat-cream)}
      .sidebar{position:sticky;top:0;height:100vh!important;min-height:690px;padding:0!important;gap:0!important;overflow:hidden!important;background:linear-gradient(180deg,#214965 0%,#173f5d 46%,#173d59 100%)!important;color:#fff;box-shadow:none!important;z-index:20}
      .brand{display:block!important;padding:0!important;border:0!important}.rdl-app-name{height:72px;display:flex;align-items:center;gap:14px;padding:0 22px;border-bottom:1px solid rgba(255,255,255,.09);font-size:18px;font-weight:650}.rdl-app-name .ui-icon{width:29px!important;height:29px!important;min-width:29px!important;min-height:29px!important;max-width:29px!important;max-height:29px!important}
      .rdl-logo-area{height:245px;display:flex;align-items:center;justify-content:center;padding:12px 25px 4px;color:#fff}.watteau-mark{width:min(280px,100%);height:auto;color:#fff;filter:drop-shadow(0 3px 10px rgba(0,0,0,.12))}
      .sidebar nav{display:flex;flex-direction:column;gap:0!important;margin:0!important}.sidebar .nav{display:flex!important;align-items:center;gap:19px;width:100%;min-height:72px;padding:0 32px!important;border:0!important;border-radius:0!important;background:transparent!important;color:#f7fbff!important;font-size:20px!important;font-weight:430!important;transition:background .15s ease}.sidebar .nav .ui-icon{width:30px!important;height:30px!important;min-width:30px!important;min-height:30px!important;max-width:30px!important;max-height:30px!important}.sidebar .nav:hover{transform:none!important;background:rgba(255,255,255,.045)!important}.sidebar .nav.active{background:linear-gradient(90deg,#c83e36 0%,#dd7155 100%)!important;color:#fff!important;box-shadow:none!important;font-weight:620!important}.sidebar .nav.active::after{display:none!important}
      .local-seal{position:absolute!important;left:0;right:0;bottom:0;height:190px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}.rdl-sidebar-slogan{position:absolute;left:31px;bottom:54px;color:#fff;font-family:"Segoe Script","Segoe Print",cursive;font-size:22px;line-height:1.35;font-style:italic;transform:rotate(-4deg)}.rdl-sidebar-slogan::after{content:"";display:block;width:126px;height:2px;background:#fff;margin:10px 0 0 36px;transform:rotate(-8deg)}
      .main{min-width:0;background:var(--wat-cream)!important}.topbar{height:72px!important;padding:0 25px!important;background:#fffefb!important;border-bottom:1px solid #eee7e0!important;box-shadow:none!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;position:sticky;top:0;z-index:15}.topbar::after{display:none!important}.rdl-hidden-title{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}
      .rdl-user{display:flex;align-items:center;gap:11px;margin-right:24px;color:var(--wat-text)}.rdl-user>.ui-icon{color:#c62027;width:31px!important;height:31px!important;min-width:31px!important;min-height:31px!important;max-width:31px!important;max-height:31px!important}.rdl-user strong,.rdl-user small{display:block}.rdl-user strong{font-size:15px}.rdl-user small{font-size:11px;color:#71869a;margin-top:2px}.rdl-more{width:38px;height:38px;border:0;background:transparent;color:#6f8799;border-radius:9px;display:grid;place-items:center}.rdl-more:hover{background:#f5f0eb}.rdl-more .ui-icon{width:18px!important;height:18px!important;min-width:18px!important;min-height:18px!important;max-width:18px!important;max-height:18px!important}.rdl-utility-menu{position:absolute;right:20px;top:63px;z-index:50;min-width:230px;padding:9px;background:#fff;border:1px solid #e7dfd7;border-radius:13px;box-shadow:0 16px 46px rgba(26,42,53,.18);display:none;flex-direction:column;gap:6px}.rdl-utility-menu.open{display:flex}.rdl-utility-menu .btn,.rdl-utility-menu .health{width:100%;text-align:left;margin:0}.btn{border-radius:9px!important}.btn.primary{background:linear-gradient(135deg,#ca443a,#a92e2d)!important;color:#fff!important;box-shadow:0 5px 15px rgba(170,45,44,.17)!important}.btn.secondary{background:#fff!important;border-color:#e6ddd5!important;color:#173e5c!important}
      .view{padding:22px 26px 40px!important}#view-dashboard{padding:0 22px 24px!important;background:#fbf8f4!important}#view-dashboard .hero{position:relative;height:310px!important;min-height:310px!important;margin:0 -22px 18px!important;padding:0!important;border:0!important;border-radius:0!important;background:linear-gradient(180deg,#fffefa 0%,#fff9f4 100%)!important;box-shadow:none!important;overflow:hidden!important;color:var(--wat-text)!important}
      .rdl-hero-copy{position:absolute;left:46px;top:38px;z-index:3}.rdl-hero-copy h2{margin:0!important;font-size:43px!important;line-height:1.05!important;letter-spacing:-.035em!important;color:#103d5f!important;font-weight:760!important}.rdl-hero-copy p{margin:12px 0 0!important;font-size:18px!important;color:#173f60!important;line-height:1.35!important}.rdl-hero-copy::after{content:"";display:block;width:58px;height:4px;background:#c51f27;border-radius:4px;margin-top:26px}.rdl-hero-art{position:absolute;left:180px;right:0;bottom:0;height:100%;z-index:1;overflow:hidden}.school-hero-art{position:absolute;left:18%;bottom:-5px;width:72%;height:auto;min-width:650px}.rdl-hero-meta{position:absolute;right:44px;top:28px;z-index:4;text-align:right;color:#103d5f}.rdl-hero-meta strong{display:block;font-size:16px}.rdl-hero-meta small{display:block;margin-top:4px;font-size:12px;color:#627f96}.rdl-weather{display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-top:6px;font-weight:700}.rdl-weather .ui-icon{color:#f28c00;width:28px!important;height:28px!important;min-width:28px!important;min-height:28px!important;max-width:28px!important;max-height:28px!important}.rdl-hero-script{position:absolute;right:45px;bottom:42px;z-index:4;width:205px;color:#0e446e;font-family:"Segoe Script","Segoe Print",cursive;font-size:22px;line-height:1.35;font-style:italic;transform:rotate(-7deg);text-align:center}.rdl-hero-script::after{content:"";display:block;width:80px;height:2px;background:#c9272b;margin:6px 0 0 auto;transform:rotate(-8deg)}
      #view-dashboard .kpis{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:13px!important;margin:0 0 18px!important}#view-dashboard .kpi{min-height:150px!important;padding:24px 15px!important;border:1px solid #ece4dd!important;border-radius:13px!important;background:#fffefb!important;box-shadow:0 5px 17px rgba(41,49,55,.065)!important;display:grid!important;grid-template-columns:56px 1fr!important;grid-template-rows:auto auto!important;column-gap:12px!important;align-content:center!important;overflow:hidden!important}#view-dashboard .kpi::after{display:none!important}.rdl-kpi-icon{grid-row:1 / span 2;width:56px;height:56px;display:grid;place-items:center;align-self:center}.rdl-kpi-icon .ui-icon{width:51px!important;height:51px!important;min-width:51px!important;min-height:51px!important;max-width:51px!important;max-height:51px!important}.rdl-kpi-red{color:#ca1d22}.rdl-kpi-blue{color:#0c70d0}.rdl-kpi-green{color:#079833}.rdl-kpi-cyan{color:#168bc8}#view-dashboard .kpi strong{grid-column:2;margin:0!important;font-size:41px!important;line-height:1!important;color:#103d5f!important;font-weight:760!important}#view-dashboard .rdl-kpi-label{grid-column:2;margin-top:8px;font-size:15px;line-height:1.35;color:#123f61}.rdl-kpi-hidden{display:none!important}
      #view-dashboard>.grid.two{display:grid!important;grid-template-columns:minmax(0,1.1fr) minmax(0,.95fr)!important;gap:15px!important}#view-dashboard>.grid.two>.panel{padding:0!important;min-height:355px;border:1px solid #ece4dd!important;border-radius:13px!important;background:#fffefb!important;box-shadow:0 5px 17px rgba(41,49,55,.065)!important;overflow:hidden!important}#view-dashboard .panel-head{height:66px;padding:0 20px!important;margin:0!important;border-bottom:1px solid #ede5de!important;display:flex!important;align-items:center!important}#view-dashboard .panel-head h3{font-size:20px!important;color:#103d5f!important;letter-spacing:-.02em}#view-dashboard .text-btn{font-size:14px!important;color:#1e628e!important}#view-dashboard .stack{padding:0 20px!important;gap:0!important}#view-dashboard .recent-item{display:grid!important;grid-template-columns:44px minmax(0,1fr) auto!important;gap:12px!important;align-items:center!important;min-height:68px!important;padding:8px 0!important;border-bottom:1px solid #ece4dd!important}#view-dashboard .recent-item:last-child{border-bottom:0!important}#view-dashboard .recent-num{display:none!important}.rdl-recent-icon{width:38px;height:38px;display:grid;place-items:center}.rdl-recent-icon .ui-icon{width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important;max-width:32px!important;max-height:32px!important}.rdl-recent-icon.book{color:#eb2028}.rdl-recent-icon.bulb{color:#f09900}.rdl-recent-icon.trash{color:#0c72d1}.rdl-recent-icon.window{color:#ec4e1f}#view-dashboard .recent-main strong{font-size:14px!important;color:#173f61!important;font-weight:680!important}#view-dashboard .recent-main small{font-size:11px!important;color:#7a91a3!important;margin-top:4px!important}#view-dashboard .badge{font-size:11px!important;padding:6px 12px!important;border-radius:999px!important}#view-dashboard .badge.open{background:#fde3df!important;color:#d33131!important}#view-dashboard .badge.closed{background:#dff3da!important;color:#238137!important}
      .rdl-engagement{height:100%;position:relative;padding:0 20px 18px;overflow:hidden}.rdl-engagement h3{height:66px;margin:0 -20px;padding:0 20px;display:flex;align-items:center;border-bottom:1px solid #ede5de;font-size:20px;color:#103d5f}.rdl-engagement::after{content:"";position:absolute;right:-52px;top:67px;width:220px;height:250px;border:18px solid #d98f77;border-radius:50%;opacity:.07}.rdl-engagement blockquote{position:relative;z-index:2;margin:24px 0 22px;font-family:Georgia,"Times New Roman",serif;font-style:italic;color:#173f61;font-size:21px;line-height:1.43;max-width:90%}.rdl-engagement blockquote::before{content:"“";color:#ddd6d1;font-size:50px;line-height:0;vertical-align:-16px;margin-right:5px}.rdl-engagement-rule{width:58px;height:4px;border-radius:4px;background:#c51f24;margin-bottom:25px}.rdl-values{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,1fr)}.rdl-value{text-align:center;padding:0 11px;color:#153f60;font-size:12px;line-height:1.4;border-right:1px solid #e9e0d8}.rdl-value:last-child{border-right:0}.rdl-value .ui-icon{width:38px!important;height:38px!important;min-width:38px!important;min-height:38px!important;max-width:38px!important;max-height:38px!important;margin:0 auto 8px;color:#c71d23}.rdl-dashboard-hidden{display:none!important}
      .panel{background:#fffefb!important;border-color:#e9e0d8!important;box-shadow:0 5px 18px rgba(41,49,55,.055)!important}.panel h3{color:#173f61}.search{background:#fff!important}.table-wrap{background:#fff;border-color:#e6ddd5!important}th{background:#f8f4ef!important;color:#6b8193!important}tbody tr:hover{background:#fff9f4!important}.mini{border-color:#e3d9d1!important;color:#173f61!important}.toast{background:#173f61!important}
      @media(max-width:1200px){.shell{grid-template-columns:250px minmax(0,1fr)!important}.rdl-logo-area{height:190px}.sidebar .nav{min-height:59px;font-size:16px!important;padding:0 23px!important;gap:14px}.rdl-sidebar-slogan{font-size:18px;bottom:30px}.local-seal{height:155px!important}#view-dashboard .hero{height:250px!important;min-height:250px!important}.rdl-hero-copy{left:34px;top:28px}.rdl-hero-copy h2{font-size:34px!important}.rdl-hero-copy p{font-size:15px!important}.rdl-hero-script{font-size:17px;right:30px;bottom:28px}.rdl-hero-meta{right:30px;top:20px}#view-dashboard .kpi{grid-template-columns:45px 1fr!important;padding:18px 12px!important;min-height:125px!important}.rdl-kpi-icon{width:45px;height:45px}.rdl-kpi-icon .ui-icon{width:41px!important;height:41px!important;min-width:41px!important;min-height:41px!important;max-width:41px!important;max-height:41px!important}#view-dashboard .kpi strong{font-size:32px!important}#view-dashboard .rdl-kpi-label{font-size:12px}}
      @media(max-width:1040px){.shell{grid-template-columns:210px minmax(0,1fr)!important}.rdl-app-name{font-size:14px;padding:0 14px}.rdl-logo-area{height:155px;padding:8px 16px}.sidebar .nav{min-height:54px;font-size:14px!important;padding:0 15px!important}.local-seal{display:none!important}#view-dashboard .kpis{grid-template-columns:repeat(2,1fr)!important}#view-dashboard>.grid.two{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function decorateBrand() {
    const brand = $('.brand'); if (!brand) return;
    brand.innerHTML = `<div class="rdl-app-name">${svg('app')}<span>Respect des Lieux PRO</span></div><div class="rdl-logo-area">${watteauMark()}</div>`;
    const seal = $('.local-seal'); if (seal) seal.innerHTML = `<div class="rdl-sidebar-slogan">Des lieux respectés<br>pour mieux apprendre</div>`;
  }

  function decorateNavigation() {
    const config = [['dashboard','home','Accueil'],['signalements','alert','Signalements'],['reparations','tool','Interventions'],['confidentialite','chart','Suivi'],['systeme','building','Établissement'],['sauvegardes','settings','Paramètres']];
    for (const [view, iconName, label] of config) { const button = $(`.nav[data-view="${view}"]`); if (!button) continue; button.innerHTML = `${svg(iconName)}<span>${label}</span>`; button.setAttribute('aria-label', label); }
  }

  function decorateTopbar() {
    const topbar = $('.topbar'); if (!topbar || topbar.dataset.rdlFidelity === '1') return; topbar.dataset.rdlFidelity = '1';
    const titleWrap = topbar.firstElementChild; if (titleWrap) titleWrap.classList.add('rdl-hidden-title');
    const actions = $('.top-actions', topbar); if (!actions) return;
    const user = document.createElement('div'); user.className = 'rdl-user'; user.innerHTML = `${svg('users')}<div><strong>Personnel</strong><small>Session locale</small></div>`;
    const more = document.createElement('button'); more.type = 'button'; more.className = 'rdl-more'; more.setAttribute('aria-label','Ouvrir les actions rapides'); more.setAttribute('aria-expanded','false'); more.innerHTML = svg('more');
    actions.classList.add('rdl-utility-menu'); topbar.insertBefore(user, actions); topbar.insertBefore(more, actions);
    more.addEventListener('click', (event) => { event.stopPropagation(); const open = actions.classList.toggle('open'); more.setAttribute('aria-expanded', String(open)); });
    document.addEventListener('click', (event) => { if (!actions.contains(event.target) && !more.contains(event.target)) { actions.classList.remove('open'); more.setAttribute('aria-expanded','false'); } });
  }

  function heroMarkup() {
    const now = new Date(); const date = now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    return `<div class="rdl-hero-copy"><h2>Bonjour !</h2><p>Ensemble, prenons soin de notre lycée</p></div><div class="rdl-hero-art">${schoolHeroArt()}</div><div class="rdl-hero-meta"><strong>${date.charAt(0).toUpperCase()+date.slice(1)}</strong><small>Lycée Watteau - Valenciennes</small><div class="rdl-weather">${svg('sun')}<span>14 °C</span></div></div><div class="rdl-hero-script">Un cadre serein<br>pour tous</div>`;
  }
  function buildHero() { const hero = $('#view-dashboard .hero'); if (!hero || hero.dataset.rdlFidelityHero === 'master') return; hero.dataset.rdlFidelityHero = 'master'; hero.innerHTML = heroMarkup(); }
  function buildKpis() {
    const cards = $$('#view-dashboard .kpi'); if (cards.length !== 4 || cards[0].dataset.rdlFidelity === '1') return; cards.forEach((card) => card.dataset.rdlFidelity = '1');
    cards[0].innerHTML = `<span class="rdl-kpi-icon rdl-kpi-red">${svg('users')}</span><strong id="kpi-total">0</strong><div class="rdl-kpi-label">Signalements<br>en attente</div>`;
    cards[1].innerHTML = `<span class="rdl-kpi-icon rdl-kpi-blue">${svg('tool')}</span><strong id="kpi-repairs">0</strong><div class="rdl-kpi-label">Interventions<br>en cours</div>`;
    cards[2].innerHTML = `<span class="rdl-kpi-icon rdl-kpi-green">${svg('check')}</span><strong id="rdl-kpi-resolved">0</strong><div class="rdl-kpi-label">Résolus<br>ce mois-ci</div><span class="rdl-kpi-hidden" id="kpi-open">0</span>`;
    cards[3].innerHTML = `<span class="rdl-kpi-icon rdl-kpi-cyan">${svg('users')}</span><strong>100%</strong><div class="rdl-kpi-label">Mobilisés pour un<br>lycée plus propre</div><span class="rdl-kpi-hidden" id="kpi-photos">0</span><small class="rdl-kpi-hidden" id="kpi-photo-size">0 Mo</small>`;
  }
  function engagementPanel() {
    const grid = $('#view-dashboard > .grid.two'); if (!grid) return; const panels = $$(':scope > .panel', grid); if (panels.length < 2) return; const panel = panels[1]; if (panel.dataset.rdlEngagement === '1') return; panel.dataset.rdlEngagement = '1';
    panel.innerHTML = `<div class="rdl-engagement"><h3>Notre engagement</h3><blockquote>Un environnement respecté<br>favorise la réussite de chacun.</blockquote><div class="rdl-engagement-rule"></div><div class="rdl-values"><div class="rdl-value">${svg('leaf')}<span>Un lycée<br>plus propre</span></div><div class="rdl-value">${svg('users')}<span>Une communauté<br>responsable</span></div><div class="rdl-value">${svg('graduate')}<span>Des réussites<br>durables</span></div></div><div class="rdl-dashboard-hidden" aria-hidden="true"><span id="fact-db"></span><span id="fact-integrity"></span><span id="fact-version"></span><span id="fact-retention"></span></div></div>`;
  }
  function recentIconName(text) { const t = String(text || '').toLowerCase(); if (/éclair|eclair|lumi|ampoul/.test(t)) return 'bulb'; if (/toilet|propret|déchet|dechet|poubell/.test(t)) return 'trash'; if (/vitr|fenê|fene|vitre/.test(t)) return 'window'; return 'book'; }
  function decorateRecent() {
    const list = $('#recent-list'); if (!list) return;
    $$('.recent-item', list).forEach((row) => { if (row.querySelector('.rdl-recent-icon')) return; const main = $('.recent-main', row); const strong = $('strong', main); const small = $('small', main); const parts = String(small?.textContent || '').split('·').map((s) => s.trim()).filter(Boolean); const type = parts.length > 1 ? parts.slice(1).join(' · ') : ''; if (strong && type && !strong.textContent.includes(type)) strong.textContent = `${strong.textContent} - ${type}`; if (small && parts.length) small.textContent = parts[0]; const iconName = recentIconName(type || strong?.textContent); const node = document.createElement('span'); node.className = `rdl-recent-icon ${iconName}`; node.innerHTML = svg(iconName); row.prepend(node); });
  }
  function refreshDerivedKpis() {
    let signals = []; let repairs = []; try { if (typeof state !== 'undefined') { signals = Array.isArray(state.signalements) ? state.signalements : []; repairs = Array.isArray(state.reparations) ? state.reparations : []; } } catch {}
    const month = new Date().toISOString().slice(0,7); const resolved = signals.filter((s) => { const status = String(s.statut || '').toLowerCase(); if (!['clos','résolu','resolu'].includes(status)) return false; const stamp = String(s.closed_at || s.updated_at || s.date || ''); return !stamp || stamp.slice(0,7) === month; }).length;
    const inProgress = repairs.filter((r) => !['terminée','terminee','annulée','annulee'].includes(String(r.statut || '').toLowerCase())).length; const resolvedNode = $('#rdl-kpi-resolved'); if (resolvedNode) resolvedNode.textContent = String(resolved); const repairNode = $('#kpi-repairs'); if (repairNode) repairNode.textContent = String(inProgress);
  }
  function installObservers() { const recent = $('#recent-list'); if (recent) new MutationObserver(() => { decorateRecent(); refreshDerivedKpis(); }).observe(recent,{childList:true,subtree:true}); const signalBody = $('#signalements-body'); if (signalBody) new MutationObserver(refreshDerivedKpis).observe(signalBody,{childList:true,subtree:true}); }
  function signature() { document.documentElement.dataset.rdlTheme = THEME_VERSION; document.documentElement.dataset.rdlFidelity = FIDELITY_SIGNATURE; let node = $('[data-rdl-theme-signature]'); if (!node) { node = document.createElement('i'); node.hidden = true; document.body.appendChild(node); } node.dataset.rdlThemeSignature = MASTER_SIGNATURE; node.dataset.rdlFidelitySignature = FIDELITY_SIGNATURE; }
  function init() { injectStyles(); decorateBrand(); decorateNavigation(); decorateTopbar(); buildHero(); buildKpis(); engagementPanel(); decorateRecent(); refreshDerivedKpis(); installObservers(); signature(); setTimeout(() => { decorateRecent(); refreshDerivedKpis(); }, 250); setTimeout(() => { decorateRecent(); refreshDerivedKpis(); }, 1200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();