/* -------------------------------------------------------------
       App Catalog & Categorization Metadata
       ------------------------------------------------------------- */
    let APP_CATALOG = {};

    function formatCategorySlug(slug) {
      if (!slug) return 'Creative App';
      const lower = slug.toLowerCase();
      if (lower === 'cad' || lower === '3d' || lower === '3d & cad') return '3D & CAD';
      if (lower === 'graphics' || lower === 'graphics & photo') return 'Graphics & Photo';
      if (lower === 'vector' || lower === 'vector & design') return 'Vector & Design';
      if (lower === 'documents' || lower === 'docs') return 'Documents';
      if (lower === 'audio' || lower === 'sound') return 'Audio';
      if (/[A-Z\s&]/.test(slug)) return slug;
      return slug
        .replace(/[-_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }

    /* -------------------------------------------------------------
       App Catalog & Dynamic Metadata Generator
       ------------------------------------------------------------- */
    const dynamicAppMetaCache = new Map();
    let nextDynamicNum = 16;

    const PALETTES = [
      { accent: '#6366f1', grad: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }, // Indigo
      { accent: '#ec4899', grad: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)' }, // Pink
      { accent: '#14b8a6', grad: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)' }, // Teal
      { accent: '#f59e0b', grad: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)' }, // Amber
      { accent: '#8b5cf6', grad: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)' }, // Violet
      { accent: '#06b6d4', grad: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)' }, // Cyan
      { accent: '#10b981', grad: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }, // Emerald
      { accent: '#f43f5e', grad: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)' }, // Rose
    ];

    function getAppMeta(appName) {
      const rawKey = (appName || '').trim().toLowerCase();
      const key = rawKey.replace(/^storytold\//, '');
      const keyNoHyphen = key.replace(/-/g, '');
      const item = APP_CATALOG[key] || APP_CATALOG[keyNoHyphen] || APP_CATALOG[rawKey];

      if (item) {
        const title = item.title || appName;
        const cat = item.category ? formatCategorySlug(item.category) : 'Graphics & Photo';
        const accent = item.accentColor || '#2563eb';
        const monogram = item.monogram || title.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2).toUpperCase() || 'AC';
        const gradient = item.gradient || `linear-gradient(135deg, ${accent} 0%, #0d0f17 100%)`;

        return {
          num: item.num || '00',
          title: title,
          category: cat,
          categoryName: cat,
          categoryTag: item.categoryTag || cat.toUpperCase(),
          accentColor: accent,
          tagline: item.tagline || `${title} Creative App`,
          desc: item.desc || `Open-source ${title} creative application.`,
          monogram: monogram,
          gradient: gradient
        };
      }

      if (dynamicAppMetaCache.has(key)) {
        return dynamicAppMetaCache.get(key);
      }

      // Title formatting (supports camelCase, kebab-case, snake_case)
      const cleanTitle = appName
        .replace(/^storytold\//i, '')
        .replace(/[-_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');

      const mono = cleanTitle.substring(0, 2).toUpperCase() || 'AC';

      // Intelligent category detection from keywords
      let category = 'Graphics & Photo';
      let categoryTag = 'CREATIVE STUDIO';

      if (/audio|sound|music|synth|voice|track/i.test(key)) {
        category = 'Audio';
        categoryTag = 'AUDIO WORKBENCH';
      } else if (/cad|3d|mesh|model|render|shape|texture/i.test(key)) {
        category = '3D & CAD';
        categoryTag = '3D WORKBENCH';
      } else if (/doc|word|pdf|text|sheet|page|note|book|publish/i.test(key)) {
        category = 'Documents';
        categoryTag = 'DOCUMENT STUDIO';
      } else if (/vector|svg|draw|design|fig|ui|ux|layout|canvas/i.test(key)) {
        category = 'Vector & Design';
        categoryTag = 'VECTOR & DESIGN';
      }

      // Deterministic palette selection by hashing app name
      let hash = 0;
      for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff;
      const palette = PALETTES[Math.abs(hash) % PALETTES.length];

      const assignedNum = String(nextDynamicNum++).padStart(2, '0');

      const meta = {
        num: assignedNum,
        title: cleanTitle,
        category: category,
        categoryName: category,
        categoryTag: categoryTag,
        accentColor: palette.accent,
        tagline: `${category} Studio App`,
        desc: `High-performance self-hosted ${cleanTitle} creative tool.`,
        monogram: mono,
        gradient: palette.grad
      };

      dynamicAppMetaCache.set(key, meta);
      return meta;
    }

    /* -------------------------------------------------------------
       Generic Preview Image Placeholder Fallback
       ------------------------------------------------------------- */
    function getAppPreviewSvg(app) {
      const cleanId = escapeHtml(app || 'app').replace(/[^a-zA-Z0-9_-]/g, '');
      return `
        <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <rect width="320" height="160" fill="#0d0f17"/>
          <defs>
            <pattern id="placeholder-grid-${cleanId}" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.03"/>
            </pattern>
          </defs>
          <rect width="320" height="160" fill="url(#placeholder-grid-${cleanId})"/>
          <g transform="translate(144, 64)" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.45">
            <rect x="0" y="0" width="32" height="24" rx="3" fill="#141722"/>
            <circle cx="9" cy="8" r="2" fill="#475569"/>
            <path d="M3 21l8-8 6 6"/>
            <path d="M14 17l4-4 11 8"/>
          </g>
        </svg>
      `;
    }

    /* -------------------------------------------------------------
       State Management
       ------------------------------------------------------------- */
    let rawApps = [];
    let currentCategory = 'all';
    let searchQuery = '';
    let isSyncing = false;
    let syncPollTimer = null;
    let pinnedApps = new Set(JSON.parse(localStorage.getItem('artcraft_pinned_apps') || '[]'));

    function savePinnedApps() {
      localStorage.setItem('artcraft_pinned_apps', JSON.stringify([...pinnedApps]));
      fetch('/api/pinned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: [...pinnedApps] })
      }).catch(() => { });
    }

    function togglePin(appName) {
      const meta = getAppMeta(appName);
      if (pinnedApps.has(appName)) {
        pinnedApps.delete(appName);
        showToast('Unpinned', `Removed ${meta.title} from pinned apps`, 'info');
      } else {
        pinnedApps.add(appName);
        showToast('Pinned to Top', `📌 ${meta.title} is now pinned to the top`, 'success');
      }
      savePinnedApps();
      updateCategoryCounts();
      renderGrid();
    }

    /* DOM references */
    const pinnedSection = document.getElementById('pinned-section');
    const pinnedGrid = document.getElementById('pinned-grid');
    const pinnedBadgeCount = document.getElementById('pinned-badge-count');
    const mainSection = document.getElementById('main-section');
    const mainSectionTitle = document.getElementById('main-section-title');
    const mainBadgeCount = document.getElementById('main-badge-count');
    const appsGrid = document.getElementById('apps-grid');
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const searchShortcut = document.getElementById('search-shortcut');
    const categoryPills = document.getElementById('category-pills');
    const btnSyncAll = document.getElementById('btn-sync-all');
    const btnSyncLabel = document.getElementById('btn-sync-label');
    const gridStatusCount = document.getElementById('grid-status-count');
    const toastContainer = document.getElementById('toast-container');

    /* -------------------------------------------------------------
       Toast Notification System
       ------------------------------------------------------------- */
    let lastToastText = '';
    let lastToastTime = 0;

    function showToast(title, message, type = 'success') {
      const now = Date.now();
      const toastKey = `${title}:${message}`;
      if (toastKey === lastToastText && (now - lastToastTime) < 2000) {
        return; // suppress duplicate toast within 2 seconds
      }
      lastToastText = toastKey;
      lastToastTime = now;

      // Keep max 3 toasts visible at a time
      while (toastContainer.children.length >= 3) {
        toastContainer.firstElementChild.remove();
      }

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      const icon = type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '⚠';

      toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
          <div class="toast-title">${escapeHtml(title)}</div>
          <div class="toast-message">${escapeHtml(message)}</div>
        </div>
      `;

      toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'toastIn 0.2s reverse forwards';
        setTimeout(() => toast.remove(), 250);
      }, 3500);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatDate(isoStr) {
      if (!isoStr) return 'Recently';
      try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return 'Recently';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      } catch (e) {
        return 'Recently';
      }
    }

    /* -------------------------------------------------------------
       Global Version Menu Helper
       ------------------------------------------------------------- */
    function closeAllVersionMenus() {
      document.querySelectorAll('.version-menu').forEach(m => {
        m.style.display = 'none';
        m.classList.remove('dropup');
      });
      document.querySelectorAll('.active-version-btn').forEach(b => {
        b.classList.remove('open');
        b.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.app-card').forEach(c => {
        c.classList.remove('has-menu-open');
      });
    }

    /* -------------------------------------------------------------
       Card Builder
       ------------------------------------------------------------- */
    function buildAppCard(appInfo) {
      const meta = getAppMeta(appInfo.app);
      let activeTag = appInfo.active || (appInfo.releases[0] ? appInfo.releases[0].tag : 'latest');
      const releases = appInfo.releases || [];
      const isPinned = pinnedApps.has(appInfo.app);

      // Find release date for active version
      const activeRelease = releases.find(r => r.tag === activeTag) || releases[0] || {};
      const updatedDate = formatDate(activeRelease.downloaded_at);

      const card = document.createElement('div');
      card.className = `app-card ${isPinned ? 'is-pinned' : ''}`;
      card.dataset.app = appInfo.app;
      card.dataset.category = meta.category;


      if (currentTheme === 'artcraft') {
        const previewSvg = getAppPreviewSvg(appInfo.app);
        card.innerHTML = `
          <!-- ArtCraft Theme Top Header (Numbered box + Category Tag) -->
          <div class="artcraft-card-topbar">
            <div class="artcraft-num-box" style="background: ${meta.accentColor || '#2563eb'};">${meta.num || '01'}</div>
            <span class="artcraft-category-tag">${escapeHtml(meta.categoryTag || meta.categoryName.toUpperCase())}</span>
          </div>

          <!-- ArtCraft Theme Preview Graphic -->
          <a href="/${appInfo.app}/" class="artcraft-card-preview" target="_blank" rel="noopener" title="Launch ${meta.title}">
            <img src="/previews/${appInfo.app}.webp" 
                 alt="${meta.title} Interface Preview" 
                 class="artcraft-preview-img" 
                 loading="lazy" 
                 decoding="async"
                 onerror="if (this.dataset.triedOnline !== 'true') { this.dataset.triedOnline = 'true'; this.src = 'https://getartcraft.com/images/apps/${appInfo.app}/${appInfo.app === 'filmcraft' ? 'color' : 'hero'}.webp'; } else { this.style.display='none'; this.nextElementSibling.style.display='block'; }">
            <div class="artcraft-preview-fallback" style="display: none; width: 100%; height: 100%;">
              ${previewSvg}
            </div>
          </a>

          <!-- Card Main Content -->
          <div class="card-inner-content">
            <!-- App Icon overlapping preview -->
            <div class="artcraft-icon-wrapper">
              <a href="/${appInfo.app}/" class="app-icon-link" target="_blank" rel="noopener" title="Launch ${meta.title}">
                <div class="app-icon-slot" style="background: ${meta.accentColor || '#2563eb'};">
                  <img src="/icons/${appInfo.app}.webp" alt="${meta.title} Icon" class="app-icon-img"
                       onerror="if (this.dataset.triedSvg !== 'true') { this.dataset.triedSvg = 'true'; this.src = '/icons/${appInfo.app}.svg'; } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }">
                  <div class="app-icon-fallback" style="background: ${meta.gradient}; display: none;">
                    ${meta.monogram}
                  </div>
                </div>
              </a>
            </div>

            <!-- Title & Description Block -->
            <div class="card-meta">
              <div class="card-title-row">
                <a href="/${appInfo.app}/" class="app-title-link" target="_blank" rel="noopener" title="Launch ${meta.title}">
                  <h3 class="app-title" title="${meta.title}">${meta.title}</h3>
                </a>
                <button class="btn-pin ${isPinned ? 'pinned' : ''}" id="pin-${appInfo.app}" title="${isPinned ? 'Unpin from favorites' : 'Pin to favorites'}">
                  <svg viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22"></line>
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                  </svg>
                </button>
              </div>
              <p class="app-desc">${meta.desc}</p>
            </div>

            <!-- Release Badges (Active Release Dropdown & Updated Date) -->
            <div class="artcraft-badges-row">
              <div class="version-dropdown-container">
                <button type="button" class="active-version-btn artcraft-pill-stage ${releases.length > 1 ? 'has-dropdown' : 'single-version'}" id="chip-${appInfo.app}" title="${releases.length > 1 ? `Click to choose version (${releases.length} installed)` : escapeHtml(activeTag)}" aria-haspopup="${releases.length > 1 ? 'true' : 'false'}" aria-expanded="false" style="border-color: ${meta.accentColor || '#4e7bfb'}; color: ${meta.accentColor || '#4e7bfb'};">
                  <span class="version-tag-text" id="tag-text-${appInfo.app}">${escapeHtml(activeTag)}</span>
                  ${releases.length > 1 ? `
                  <svg class="chip-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>` : ''}
                </button>
                <div class="version-menu" id="menu-${appInfo.app}"></div>
              </div>
              <span class="artcraft-date-text" id="date-${appInfo.app}">UPDATED ${updatedDate.toUpperCase()}</span>
            </div>

            <!-- ArtCraft Bottom Explore / Launch Action Button -->
            <a href="/${appInfo.app}/" class="artcraft-explore-btn" target="_blank" rel="noopener">
              <span>EXPLORE ${meta.title.toUpperCase()}</span>
              <span class="artcraft-arrow">↗</span>
            </a>
          </div>
        `;
      } else {
        // Original Glass Theme Card Layout
        card.innerHTML = `
          <div class="card-top">
            <a href="/${appInfo.app}/" class="app-icon-link" target="_blank" rel="noopener" title="Launch ${meta.title}">
              <div class="app-icon-slot" style="background: ${meta.accentColor || '#2563eb'};">
                <img src="/icons/${appInfo.app}.webp" alt="${meta.title} Icon" class="app-icon-img"
                     onerror="if (this.dataset.triedSvg !== 'true') { this.dataset.triedSvg = 'true'; this.src = '/icons/${appInfo.app}.svg'; } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }">
                <div class="app-icon-fallback" style="background: ${meta.gradient}; display: none;">
                  ${meta.monogram}
                </div>
              </div>
            </a>
            <div class="card-meta">
              <div class="card-title-row">
                <a href="/${appInfo.app}/" class="app-title-link" target="_blank" rel="noopener" title="Launch ${meta.title}">
                  <h3 class="app-title" title="${meta.title}">${meta.title}</h3>
                  <svg class="launch-icon-mini" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
                <div class="card-badge-actions" style="display: flex; align-items: center; gap: 0.45rem;">
                  <span class="app-category-pill">${meta.categoryName}</span>
                  <button class="btn-pin ${isPinned ? 'pinned' : ''}" id="pin-${appInfo.app}" title="${isPinned ? 'Unpin from favorites' : 'Pin to favorites'}">
                    <svg viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="17" x2="12" y2="22"></line>
                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="app-tagline">${meta.tagline}</div>
              <p class="app-desc">${meta.desc}</p>
            </div>
          </div>

          <div class="card-details">
            <div class="release-info">
              <div class="active-badge-group">
                <span style="color: var(--text-muted); font-size: 0.7rem;">Active:</span>
                <div class="version-dropdown-container">
                  <button type="button" class="active-version-btn" id="chip-${appInfo.app}" title="Click to choose version" aria-haspopup="true" aria-expanded="false">
                    <span class="version-tag-text" id="tag-text-${appInfo.app}">${escapeHtml(activeTag)}</span>
                    <svg class="chip-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  <div class="version-menu" id="menu-${appInfo.app}"></div>
                </div>
              </div>
              <span class="updated-date" id="date-${appInfo.app}">Updated ${updatedDate}</span>
            </div>
            <span class="releases-count-badge">${releases.length} ${releases.length === 1 ? 'version' : 'versions'}</span>
          </div>
        `;
      }

      // Pin button handler
      const pinBtn = card.querySelector(`#pin-${appInfo.app}`);
      pinBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePin(appInfo.app);
      });

      // Version switcher elements
      const chipBtn = card.querySelector(`#chip-${appInfo.app}`);
      const menuEl = card.querySelector(`#menu-${appInfo.app}`);
      const tagTextEl = card.querySelector(`#tag-text-${appInfo.app}`);
      const dateEl = card.querySelector(`#date-${appInfo.app}`);

      function renderVersionMenu() {
        menuEl.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'version-menu-header';
        header.textContent = 'Installed Versions';
        menuEl.appendChild(header);

        if (releases.length === 0) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'version-menu-item active';
          item.innerHTML = `<span>${escapeHtml(activeTag)}</span> <span style="color:var(--text-secondary);font-size:0.75rem;">✓</span>`;
          menuEl.appendChild(item);
          return;
        }

        releases.forEach(r => {
          const isCurrent = r.tag === activeTag;
          const item = document.createElement('button');
          item.type = 'button';
          item.className = `version-menu-item ${isCurrent ? 'active' : ''}`;
          item.innerHTML = `
            <span>${escapeHtml(r.tag)}</span>
            ${isCurrent ? '<span style="color:var(--text-secondary);font-size:0.75rem;">✓</span>' : ''}
          `;

          item.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllVersionMenus();

            if (r.tag === activeTag) return;

            chipBtn.disabled = true;
            try {
              const res = await fetch(`/api/${appInfo.app}/switch/${encodeURIComponent(r.tag)}`, {
                method: 'POST'
              });
              const data = await res.json();

              if (data.ok) {
                activeTag = r.tag;
                tagTextEl.textContent = activeTag;
                if (r.downloaded_at && dateEl) {
                  if (currentTheme === 'artcraft') {
                    dateEl.textContent = `UPDATED ${formatDate(r.downloaded_at).toUpperCase()}`;
                  } else {
                    dateEl.textContent = `Updated ${formatDate(r.downloaded_at)}`;
                  }
                }
                renderVersionMenu();
                showToast('Version Activated', `${meta.title} switched to ${r.tag}`, 'success');
              } else {
                showToast('Switch Failed', data.error || 'Could not change active version.', 'error');
              }
            } catch (err) {
              showToast('Network Error', err.message, 'error');
            } finally {
              chipBtn.disabled = false;
            }
          });

          menuEl.appendChild(item);
        });
      }

      renderVersionMenu();

      // Toggle version menu
      chipBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // In ArtCraft theme, do not expand if only one version is installed
        if (currentTheme === 'artcraft' && releases.length <= 1) {
          return;
        }

        const isOpen = menuEl.style.display === 'flex';
        closeAllVersionMenus();

        if (!isOpen) {
          const rect = chipBtn.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          if (spaceBelow < 250 && rect.top > 250) {
            menuEl.classList.add('dropup');
          } else {
            menuEl.classList.remove('dropup');
          }
          menuEl.style.display = 'flex';
          chipBtn.classList.add('open');
          chipBtn.setAttribute('aria-expanded', 'true');
          card.classList.add('has-menu-open');
        }
      });

      return card;
    }

    /* -------------------------------------------------------------
       Rendering & Filtering
       ------------------------------------------------------------- */
    function renderGrid() {
      pinnedGrid.innerHTML = '';
      appsGrid.innerHTML = '';

      const query = searchQuery.trim().toLowerCase();

      const filtered = rawApps.filter(app => {
        const meta = getAppMeta(app.app);

        // Category filter
        if (currentCategory === 'pinned') {
          if (!pinnedApps.has(app.app)) return false;
        } else if (currentCategory !== 'all' && meta.category !== currentCategory) {
          return false;
        }

        // Search query filter
        if (query) {
          const matchName = meta.title.toLowerCase().includes(query) || app.app.toLowerCase().includes(query);
          const matchTagline = meta.tagline.toLowerCase().includes(query);
          const matchDesc = meta.desc.toLowerCase().includes(query);
          const matchCategory = meta.categoryName.toLowerCase().includes(query);
          const matchVersions = (app.releases || []).some(r => r.tag.toLowerCase().includes(query));
          return matchName || matchTagline || matchDesc || matchCategory || matchVersions;
        }

        return true;
      });

      // Split into pinned and unpinned lists
      const pinnedList = filtered.filter(app => pinnedApps.has(app.app));
      const unpinnedList = filtered.filter(app => !pinnedApps.has(app.app));

      // Sort both lists (by official ArtCraft lineup number in ArtCraft theme, or alphabetically in Glass theme)
      if (currentTheme === 'artcraft') {
        pinnedList.sort((a, b) => (getAppMeta(a.app).num || '99').localeCompare(getAppMeta(b.app).num || '99'));
        unpinnedList.sort((a, b) => (getAppMeta(a.app).num || '99').localeCompare(getAppMeta(b.app).num || '99'));
      } else {
        pinnedList.sort((a, b) => getAppMeta(a.app).title.localeCompare(getAppMeta(b.app).title));
        unpinnedList.sort((a, b) => getAppMeta(a.app).title.localeCompare(getAppMeta(b.app).title));
      }

      // Update global count & ArtCraft section headers
      gridStatusCount.textContent = `Showing ${filtered.length} of ${rawApps.length} creative tools`;
      const pinnedMeta = document.getElementById('artcraft-pinned-meta');
      const lineupTitle = document.getElementById('artcraft-lineup-title');

      // 1. Pinned Favorites Section (top)
      if (pinnedList.length > 0) {
        pinnedSection.style.display = 'block';
        pinnedBadgeCount.textContent = pinnedList.length;
        if (pinnedMeta) {
          pinnedMeta.textContent = `${pinnedList.length} ${pinnedList.length === 1 ? 'APP' : 'APPS'} PINNED`;
        }
        if (lineupTitle) {
          lineupTitle.textContent = '02 / THE LINEUP';
        }
        const pinnedFragment = document.createDocumentFragment();
        pinnedList.forEach(app => pinnedFragment.appendChild(buildAppCard(app)));
        pinnedGrid.appendChild(pinnedFragment);
      } else {
        pinnedSection.style.display = 'none';
        if (lineupTitle) {
          lineupTitle.textContent = '01 / THE LINEUP';
        }
      }

      // 2. Main Tools Section (bottom)
      if (currentCategory === 'pinned') {
        // If "Pinned" tab is active, only show pinned section
        mainSection.style.display = 'none';
        if (pinnedList.length === 0) {
          pinnedSection.style.display = 'block';
          if (pinnedMeta) {
            pinnedMeta.textContent = '0 APPS PINNED';
          }
          pinnedGrid.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">📌</div>
              <h3 class="empty-title">No Pinned Applications</h3>
              <p class="empty-desc">
                Click the pin icon on any tool card to add it to your pinned favorites.
              </p>
              <button class="btn-sync" onclick="clearFilters()">View All Tools</button>
            </div>
          `;
        }
        return;
      }

      mainSection.style.display = 'block';
      mainBadgeCount.textContent = unpinnedList.length;

      if (filtered.length === 0) {
        if (rawApps.length === 0) {
          appsGrid.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">🎨</div>
              <h3 class="empty-title">No Applications Found</h3>
              <p class="empty-desc">
                No apps have been downloaded yet. Add your repositories to <code>/config/apps.conf</code> and click "Sync Releases" to fetch them.
              </p>
              <button class="btn-sync" onclick="triggerSync()">Sync Now</button>
            </div>
          `;
        } else {
          appsGrid.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">🔍</div>
              <h3 class="empty-title">No Matching Tools</h3>
              <p class="empty-desc">
                No application matches your current search or category filter.
              </p>
              <button class="btn-sync" onclick="clearFilters()">Reset Filters</button>
            </div>
          `;
        }
        return;
      }

      const appsFragment = document.createDocumentFragment();
      unpinnedList.forEach(app => {
        appsFragment.appendChild(buildAppCard(app));
      });
      appsGrid.appendChild(appsFragment);
    }

    function updateCategoryCounts() {
      // 1. Discover all unique categories
      const categories = new Set();
      for (const key in APP_CATALOG) {
        const item = APP_CATALOG[key];
        if (item && item.category) {
          categories.add(formatCategorySlug(item.category));
        }
      }

      rawApps.forEach(app => {
        const meta = getAppMeta(app.app);
        if (meta.category) {
          categories.add(meta.category);
        }
      });

      const counts = { all: rawApps.length, pinned: 0 };
      categories.forEach(cat => {
        counts[cat] = 0;
      });

      rawApps.forEach(app => {
        const meta = getAppMeta(app.app);
        if (meta.category) {
          counts[meta.category] = (counts[meta.category] || 0) + 1;
        }
        if (pinnedApps.has(app.app)) {
          counts.pinned++;
        }
      });

      renderCategoryPills(categories, counts);

      const footerTotal = document.getElementById('footer-total-apps');
      if (footerTotal) footerTotal.textContent = `${rawApps.length} apps installed`;
    }

    function renderCategoryPills(categories, counts) {
      if (!categoryPills) return;

      let html = `
        <button class="filter-pill ${currentCategory === 'all' ? 'active' : ''}" data-category="all" role="tab" aria-selected="${currentCategory === 'all'}">
          All Tools <span class="pill-count" id="count-all">${counts.all}</span>
        </button>
        <button class="filter-pill ${currentCategory === 'pinned' ? 'active' : ''}" data-category="pinned" role="tab" aria-selected="${currentCategory === 'pinned'}">
          📌 Pinned <span class="pill-count" id="count-pinned">${counts.pinned}</span>
        </button>
      `;

      categories.forEach(cat => {
        const isActive = currentCategory === cat;
        html += `
          <button class="filter-pill ${isActive ? 'active' : ''}" data-category="${escapeHtml(cat)}" role="tab" aria-selected="${isActive}">
            ${escapeHtml(cat)} <span class="pill-count">${counts[cat] || 0}</span>
          </button>
        `;
      });

      categoryPills.innerHTML = html;
    }

    function clearFilters() {
      currentCategory = 'all';
      searchQuery = '';
      searchInput.value = '';
      searchClear.style.display = 'none';
      searchShortcut.style.display = 'block';

      document.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.category === 'all');
      });

      renderGrid();
    }

    /* -------------------------------------------------------------
       API Calls
       ------------------------------------------------------------- */
    async function fetchManifest() {
      try {
        const res = await fetch('/api/manifest');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.catalog && typeof data.catalog === 'object') {
          APP_CATALOG = data.catalog;
          const catalogCount = Object.keys(APP_CATALOG).length;
          if (catalogCount > 0) {
            nextDynamicNum = Math.max(nextDynamicNum, catalogCount + 1);
          }
        }

        // Merge server pinned apps if local storage is empty
        if (data.pinned && Array.isArray(data.pinned) && data.pinned.length > 0 && pinnedApps.size === 0) {
          data.pinned.forEach(p => pinnedApps.add(p));
          localStorage.setItem('artcraft_pinned_apps', JSON.stringify([...pinnedApps]));
        }

        rawApps = data.apps || [];
        updateCategoryCounts();
        renderGrid();

        if (data.system) {
          updateSystemStatus(data.system);
        }
      } catch (err) {
        console.error('Failed to load manifest:', err);
        appsGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <h3 class="empty-title">Unable to Connect to Hub API</h3>
            <p class="empty-desc">
              Could not communicate with the local sidecar API at <code>/api/manifest</code>. Make sure the container is healthy.
            </p>
            <button class="btn-sync" onclick="fetchManifest()">Retry</button>
          </div>
        `;
      }
    }

    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const sys = await res.json();
          updateSystemStatus(sys);
        }
      } catch (e) {
        // quiet ignore on background status check
      }
    }

    function stopSyncPolling() {
      if (syncPollTimer) {
        clearInterval(syncPollTimer);
        syncPollTimer = null;
      }
    }

    function startSyncPolling() {
      stopSyncPolling();
      syncPollTimer = setInterval(pollSyncStatus, 2500);
    }

    function updateSystemStatus(sys) {
      if (!sys) return;

      const active = sys.is_syncing || sys.status === 'syncing';
      isSyncing = active;

      if (active) {
        btnSyncAll.disabled = true;
        btnSyncAll.classList.add('spinning');
        btnSyncLabel.textContent = 'Syncing...';
      } else {
        btnSyncAll.disabled = false;
        btnSyncAll.classList.remove('spinning');
        btnSyncLabel.textContent = 'Sync Releases';
        stopSyncPolling();
      }

      if (sys.last_sync) {
        document.getElementById('footer-last-sync').textContent = `Last checked: ${formatDate(sys.last_sync)}`;
      }
      if (sys.schedule) {
        document.getElementById('footer-cron-schedule').textContent = `Schedule: ${sys.schedule}`;
      }
    }

    async function triggerSync() {
      if (isSyncing) return;

      try {
        btnSyncAll.disabled = true;
        btnSyncAll.classList.add('spinning');
        btnSyncLabel.textContent = 'Starting...';

        const res = await fetch('/api/sync', { method: 'POST' });
        const data = await res.json();

        if (res.ok && data.ok) {
          showToast('Sync Triggered', 'Checking upstream GitHub releases in the background...', 'info');
          isSyncing = true;
          updateSystemStatus({ is_syncing: true });
          startSyncPolling();
        } else {
          showToast('Sync Alert', data.error || 'Could not start sync.', 'error');
          isSyncing = false;
          updateSystemStatus({ is_syncing: false });
        }
      } catch (err) {
        showToast('Error', err.message, 'error');
        isSyncing = false;
        updateSystemStatus({ is_syncing: false });
      }
    }

    let isPollingCheck = false;
    async function pollSyncStatus() {
      if (!isSyncing || isPollingCheck) return;
      isPollingCheck = true;

      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const sys = await res.json();
          const stillRunning = sys.is_syncing || sys.status === 'syncing';
          if (!stillRunning) {
            // Completely finished!
            isSyncing = false;
            stopSyncPolling();
            updateSystemStatus(sys);
            showToast('Sync Complete', 'Applications updated successfully.', 'success');
            await fetchManifest();
          }
        }
      } catch (e) {
        // silent retry on next interval
      } finally {
        isPollingCheck = false;
      }
    }

    /* -------------------------------------------------------------
       Event Listeners
       ------------------------------------------------------------- */
    // Category pill click
    categoryPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;

      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');

      currentCategory = btn.dataset.category || 'all';
      renderGrid();
    });

    // Search input
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      if (searchQuery.length > 0) {
        searchClear.style.display = 'block';
        searchShortcut.style.display = 'none';
      } else {
        searchClear.style.display = 'none';
        searchShortcut.style.display = 'block';
      }
      renderGrid();
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClear.style.display = 'none';
      searchShortcut.style.display = 'block';
      searchInput.focus();
      renderGrid();
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.version-dropdown-container')) {
        closeAllVersionMenus();
      }
    });

    // Keyboard shortcut '/' to search & Escape to dismiss
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (e.key === 'Escape') {
        closeAllVersionMenus();
        if (searchInput === document.activeElement) {
          searchInput.blur();
        }
      }
    });

    // Sync button
    btnSyncAll.addEventListener('click', triggerSync);

    /* -------------------------------------------------------------
       Theme Management (ArtCraft Theme & Glass Themes)
       ------------------------------------------------------------- */
    const THEME_KEY = 'artcraft_hub_theme';
    let currentTheme = localStorage.getItem(THEME_KEY) || 'artcraft';

    function applyTheme(theme, notify = false) {
      currentTheme = (theme === 'glass') ? 'glass' : 'artcraft';
      document.documentElement.setAttribute('data-theme', currentTheme);
      localStorage.setItem(THEME_KEY, currentTheme);
      updateThemeButtonUI();
      if (rawApps && rawApps.length > 0) {
        renderGrid();
      }
      if (notify) {
        const name = currentTheme === 'artcraft' ? 'ArtCraft Theme' : 'Glass Theme';
        showToast('Theme Updated', `Switched to ${name}`, 'info');
      }
    }

    function toggleTheme() {
      const nextTheme = currentTheme === 'artcraft' ? 'glass' : 'artcraft';
      applyTheme(nextTheme, true);
    }

    function updateThemeButtonUI() {
      const label = document.getElementById('theme-btn-label');
      const iconArtcraft = document.querySelector('.theme-icon-artcraft');
      const iconGlass = document.querySelector('.theme-icon-glass');
      const btn = document.getElementById('btn-theme-toggle');
      if (!label) return;

      if (currentTheme === 'artcraft') {
        label.textContent = 'ArtCraft Theme';
        if (iconArtcraft) iconArtcraft.style.display = 'block';
        if (iconGlass) iconGlass.style.display = 'none';
        if (btn) btn.title = 'Active: ArtCraft Theme (Click to switch to Glass Theme)';
      } else {
        label.textContent = 'Glass Theme';
        if (iconArtcraft) iconArtcraft.style.display = 'none';
        if (iconGlass) iconGlass.style.display = 'block';
        if (btn) btn.title = 'Active: Glass Theme (Click to switch to ArtCraft Theme)';
      }
    }

    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', toggleTheme);
    }

    /* -------------------------------------------------------------
       Initialization & Global API Exports
       ------------------------------------------------------------- */
    window.clearFilters = clearFilters;
    window.triggerSync = triggerSync;

    applyTheme(currentTheme, false);
    fetchManifest();

