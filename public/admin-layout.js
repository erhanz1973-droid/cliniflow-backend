/**
 * admin-layout.js — Clinifly Admin Shared Layout
 * Injects sidebar + topbar, handles auth, active nav, clinic name.
 */
(function () {

  /* ── Navigation items ──────────────────────────────────────── */
  const NAV = [
    { href: '/admin.html',           i18nKey: 'nav.dashboard',  fallback: 'Dashboard', icon: iconGrid(),     key: 'dashboard' },
    { href: '/admin-patients.html',  i18nKey: 'nav.patients',   fallback: 'Hastalar',  icon: iconUsers(),    key: 'patients',  badge: 'sbPatients' },
    { href: '/admin-treatment.html', i18nKey: 'nav.treatments', fallback: 'Tedaviler', icon: iconTooth(),    key: 'treatment' },
    { href: '/admin-schedule.html',  i18nKey: 'nav.schedule',   fallback: 'Takvim',    icon: iconCal(),      key: 'schedule' },
  ];
  const NAV2 = [
    { href: '/admin-doctor-applications-v2.html', i18nKey: 'nav.doctors',  fallback: 'Doktorlar', icon: iconDoctor(), key: 'doctors', badge: 'sbDoctors' },
    { href: '/admin-chat.html',     i18nKey: 'nav.messages', fallback: 'Mesajlar', icon: iconChat(),     key: 'chat',    badge: 'sbChat' },
    { href: '/admin-referrals.html', i18nKey: 'nav.referrals', fallback: 'Referanslar', icon: iconReferrals(), key: 'referrals', badge: 'sbReferrals' },
    { href: '/admin-settings.html', i18nKey: 'nav.settings', fallback: 'Ayarlar',  icon: iconSettings(), key: 'settings' },
  ];

  /* ── SVG Icons ─────────────────────────────────────────────── */
  function svg(d, extra) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra||''}>${d}</svg>`;
  }
  function iconGrid()     { return svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'); }
  function iconUsers()    { return svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'); }
  function iconTooth()    { return svg('<path d="M12 2C9.2 2 7 4.2 7 7c0 1.5.6 2.8 1.4 3.8-.2 1.2-.4 2.5-.4 3.2 0 3.3 1.3 5 2.5 5s2-1.2 2-2.4c0-.8-.5-1.8-.5-1.8s-.5 1-.5 1.8c0 .9-.4 1.4-1 1.4S9 16.8 9 14c0-.8.2-2 .4-3.2C10 11.7 10.7 13 12 13s2.1-.3 2.6-2.2c.2 1.1.4 2.2.4 3.2 0 2.8-.8 5-2 5s-1-.5-1-1.4c0-.8-.5-1.8-.5-1.8s-.5 1-.5 1.8c0 1.2 1 2.4 2 2.4s2.5-1.7 2.5-5c0-.8-.2-2-.4-3.2C15.4 9.8 16 8.5 16 7c0-2.8-1.8-5-4-5z"/>'); }
  function iconCal()      { return svg('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'); }
  function iconDoctor()   { return svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'); }
  function iconChat()     { return svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'); }
  function iconSettings() { return svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'); }
  function iconLogout()   { return svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'); }
  function iconReferrals(){ return svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'); }

  function getAdminJwt() {
    for (const k of ['adminToken', 'admin_token', 'token']) {
      const v = localStorage.getItem(k);
      if (typeof v === 'string' && v.split('.').length === 3) return v;
    }
    return null;
  }

  /* ── Build nav item HTML ──────────────────────────────────── */
  function navItem(item, active) {
    const cls = active ? 'al-nav-item active' : 'al-nav-item';
    const badge = item.badge ? `<span class="al-nav-badge" id="${item.badge}"></span>` : '';
    const label = (window.i18n && window.i18n.t) ? (window.i18n.t(item.i18nKey) || item.fallback) : item.fallback;
    return `<a href="${item.href}" class="${cls}">
      <span class="al-nav-icon">${item.icon}</span>
      <span data-i18n="${item.i18nKey}">${label}</span>
      ${badge}
    </a>`;
  }

  /* ── Build full sidebar HTML ─────────────────────────────── */
  function buildSidebar(currentHref) {
    const nav1 = NAV.map(i => navItem(i, currentHref.endsWith(i.key) || currentHref.includes(i.href.replace('/', '')))).join('');
    const nav2 = NAV2.map(i => navItem(i, currentHref.endsWith(i.key) || currentHref.includes(i.href.replace('/', '')))).join('');
    return `
      <a href="/admin.html" class="al-logo" style="text-decoration:none;">
        <div class="al-logo-icon">🦷</div>
        <div>
          <div class="al-logo-brand">Clinifly</div>
          <div class="al-logo-clinic" id="alClinicName">Klinik</div>
        </div>
      </a>
      <nav class="al-nav">
        <div class="al-nav-section" data-i18n="nav.mainMenu">Ana Menü</div>
        ${nav1}
        <div class="al-nav-section" style="margin-top:14px;" data-i18n="nav.management">Yönetim</div>
        ${nav2}
      </nav>
      <div class="al-sidebar-footer">
        <button class="al-logout-btn" onclick="window.__alLogout()">
          <span class="al-nav-icon">${iconLogout()}</span>
          <span data-i18n="nav.logout">Çıkış Yap</span>
        </button>
      </div>
    `;
  }

  /* ── Build topbar HTML ───────────────────────────────────── */
  function buildTopbar(pageTitle) {
    return `
      <div class="al-topbar-left">
        <span class="al-page-title" id="alPageTitle">${pageTitle}</span>
      </div>
      <div class="al-topbar-right">
        <div class="al-lang" id="alLang">
          <span id="lang-tr" onclick="switchLang('tr')">🇹🇷 TR</span>
          <span id="lang-en" onclick="switchLang('en')">🇬🇧 EN</span>
          <span id="lang-ru" onclick="switchLang('ru')">🇷🇺 RU</span>
          <span id="lang-ka" onclick="switchLang('ka')">🇬🇪 KA</span>
        </div>
      </div>
    `;
  }

  window.switchLang = function(lang) {
    if (window.onLanguageChange) window.onLanguageChange(lang);
    ['tr','en','ru','ka'].forEach(l => {
      const el = document.getElementById('lang-' + l);
      if (el) el.classList.toggle('active', l === lang);
    });
  };

  /* ── Inject layout ───────────────────────────────────────── */
  function inject() {
    // Auth guard (login saves adminToken / admin_token / token)
    const token = getAdminJwt();
    const isLikelyJwt = !!token;
    if (!token || !isLikelyJwt) {
      if (!window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
        try {
          localStorage.removeItem('token');
          localStorage.removeItem('adminToken');
          localStorage.removeItem('admin_token');
        } catch {}
        window.location.href = '/admin-login.html';
        return;
      }
    }
    // Already injected?
    if (document.getElementById('alSidebar')) return;

    const href = window.location.pathname;
    const pageTitle = document.title.replace(/ ?[-–|] ?Clinifly.*/i, '').replace(/🦷\s*/,'').trim() || 'Admin';

    // Create sidebar
    const sidebar = document.createElement('aside');
    sidebar.className = 'al-sidebar';
    sidebar.id = 'alSidebar';
    sidebar.innerHTML = buildSidebar(href);

    // Create topbar
    const topbar = document.createElement('header');
    topbar.className = 'al-topbar';
    topbar.id = 'alTopbar';
    topbar.innerHTML = buildTopbar(pageTitle);

    // Create main wrapper
    const main = document.createElement('div');
    main.className = 'al-main';
    main.id = 'alMain';

    // Move existing body children into main
    while (document.body.firstChild) {
      main.appendChild(document.body.firstChild);
    }

    // Prepend topbar inside main
    main.insertBefore(topbar, main.firstChild);

    // Add sidebar + main to body
    document.body.appendChild(sidebar);
    document.body.appendChild(main);
    document.body.classList.add('al-ready');

    // Load clinic name
    loadClinicName();

    // Sync active lang button with saved language
    const savedLang = localStorage.getItem('admin_lang') || 'tr';
    ['tr','en','ru','ka'].forEach(l => {
      const el = document.getElementById('lang-' + l);
      if (el) el.classList.toggle('active', l === savedLang);
    });

    // Apply i18n translations to sidebar after inject
    // (handles the case where i18n initialized before layout was injected)
    if (window.i18n && typeof window.i18n.updatePage === 'function') {
      window.i18n.updatePage();
    }
  }

  /* ── Load clinic name ────────────────────────────────────── */
  async function loadClinicName() {
    try {
      const token = getAdminJwt();
      if (!token) return;
      const res = await fetch('/api/admin/clinic', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        const name = d.branding?.clinicName || d.name || 'Klinik';
        const el = document.getElementById('alClinicName');
        if (el) el.textContent = name;
      }
    } catch (_) {}
  }

  /* ── Logout ──────────────────────────────────────────────── */
  /* ── Wrap onLanguageChange to keep topbar buttons in sync ── */
  const _origOnLangChange = window.onLanguageChange;
  window.onLanguageChange = function(lang) {
    ['tr','en','ru','ka'].forEach(l => {
      const el = document.getElementById('lang-' + l);
      if (el) el.classList.toggle('active', l === lang);
    });
    if (typeof _origOnLangChange === 'function') _origOnLangChange(lang);
  };
  // switchLang is already global (defined above) and calls onLanguageChange

  window.__alLogout = function () {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('adminToken');
      localStorage.removeItem('admin_token');
    } catch (_) {}
    window.location.href = '/admin-login.html';
  };

  /* ── Run ─────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})();
