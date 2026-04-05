  // ─── CONFIG ───────────────────────────────────────────────
  const WEBHOOK_URL = 'https://automatizaciones-vs1-n8n.h5jpeh.easypanel.host/webhook/ai-news'; // Reemplazar
  const API_KEY     = 'Hangar89*';     // Igual que en n8n
  const CACHE_KEY   = 'ainews_cache';
  const CACHE_TTL   = 15 * 60 * 1000; // 15 min
  const READ_KEY    = 'ainews_read';   // IDs de artículos leídos
  // ──────────────────────────────────────────────────────────

  let allNews = [];
  let activeFilter = 'all';

  // Read articles management
  function getReadIds() {
    try { return JSON.parse(localStorage.getItem(READ_KEY) || '[]'); } catch(e) { return []; }
  }

  function markAsRead(articleUrl) {
    const readIds = getReadIds();
    if (!readIds.includes(articleUrl)) {
      readIds.push(articleUrl);
      localStorage.setItem(READ_KEY, JSON.stringify(readIds));
    }
  }

  function isRead(articleUrl) {
    return getReadIds().includes(articleUrl);
  }

  // Source name map
  const sourceNames = {
    simonwillison: 'Simon Willison',
    anthropic: 'Anthropic',
    langchain: 'LangChain',
    openai: 'OpenAI',
    techcrunch: 'TechCrunch',
    venturebeat: 'VentureBeat',
    technologyreview: 'MIT Tech Review',
    huggingface: 'HuggingFace',
    reddit: 'Reddit',
  };

  // Alias map for MIT Tech Review filter pill
  const sourceAliases = {
    mittech: 'technologyreview',
  };

  function getSourceName(item) {
    const url = (item.url || '').toLowerCase();
    const source = (item.source || '').toLowerCase();
    for (const [key, name] of Object.entries(sourceNames)) {
      if (url.includes(key) || source.includes(key)) return name;
    }
    return 'IA';
  }

  function getSourceKey(item) {
    const url = (item.url || '').toLowerCase();
    const source = (item.source || '').toLowerCase();
    for (const key of Object.keys(sourceNames)) {
      if (url.includes(key) || source.includes(key)) return key;
    }
    return 'other';
  }

  // Resolve alias for filter matching (e.g. 'mittech' -> 'technologyreview')
  function resolveFilter(filter) {
    return sourceAliases[filter] || filter;
  }

  function timeAgo(dateStr) {
    const date = new Date(dateStr);
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `${Math.floor(diff/60)}m`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h`;
    return `${Math.floor(diff/86400)}d`;
  }

  // Store current list for the modal
  window.currentNewsList = [];

  // Create Modal once
  if (!document.getElementById('newsModal')) {
    const modalHtml = `
      <div id="newsModal" class="modal-overlay" onclick="closeModal(event)">
        <div class="modal-content" onclick="event.stopPropagation()">
          <button class="modal-close" onclick="closeModal(event)">✕</button>
          <img id="modalImage" class="modal-image" src="" alt="">
          <div class="modal-body">
            <div class="card-meta" style="margin-bottom: 12px;">
              <span id="modalSource" class="source-badge"></span>
              <span id="modalTime" class="card-time"></span>
            </div>
            <h2 id="modalTitle" class="modal-title"></h2>
            <div id="modalSummary" class="modal-summary-text"></div>
            <a id="modalLink" class="modal-btn" href="#" target="_blank" rel="noopener noreferrer">
              Leer artículo original
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  window.openModal = function(index) {
    const item = window.currentNewsList[index];
    if (!item) return;
    
    document.getElementById('modalImage').src = item.image_url && item.image_url !== 'null' ? item.image_url : `https://picsum.photos/seed/${encodeURIComponent(item.title)}/600/300`;
    document.getElementById('modalSource').textContent = getSourceName(item);
    document.getElementById('modalTime').textContent = timeAgo(item.published_at);
    document.getElementById('modalTitle').textContent = item.title;
    document.getElementById('modalSummary').textContent = item.summary || 'Sin resumen disponible.';
    document.getElementById('modalLink').href = item.url;
    
    document.getElementById('newsModal').classList.add('visible');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  window.closeModal = function(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    document.getElementById('newsModal').classList.remove('visible');
    document.body.style.overflow = '';
  }

  function renderCards(news) {
    const list = document.getElementById('newsList');

    // Filter out read articles
    const unread = news.filter(item => !isRead(item.url));
    window.currentNewsList = unread; // Save for modal

    if (!unread.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="pulse-dot"></div>
          <div class="error-title">${news.length ? 'Todo leído ✓' : 'Sin noticias aún'}</div>
          <div class="error-msg">${news.length
            ? 'Has marcado todas las noticias como leídas.<br>Nuevas noticias llegarán cada 30 min.'
            : 'El workflow de n8n todavía no ha<br>recopilado artículos. Vuelve pronto.'
          }</div>
        </div>`;
      return;
    }

    list.innerHTML = unread.map((item, i) => {
      const isFeatured = i === 0 && activeFilter === 'all';
      const sourceName = getSourceName(item);
      const time = timeAgo(item.published_at);
      const imageUrl = item.image_url && item.image_url !== 'null' ? item.image_url : `https://picsum.photos/seed/${encodeURIComponent(item.title)}/600/300`;

      return `
        <div class="card${isFeatured ? ' featured' : ''}" style="animation-delay: ${i * 40}ms" data-url="${item.url}" onclick="openModal(${i})">
          <button class="btn-read" onclick="handleRead(event, '${encodeURIComponent(item.url)}')" title="Marcar como leída">✓</button>
          <img class="card-image" src="${imageUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="card-body">
            <div class="card-meta">
              <span class="source-badge">${sourceName}</span>
              <span class="card-time">${time}</span>
            </div>
            <div class="card-title">${item.title}</div>
            ${item.summary ? `<div class="card-summary">${item.summary}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // Handle read button click
  function handleRead(event, encodedUrl) {
    event.preventDefault();
    event.stopPropagation();

    const url = decodeURIComponent(encodedUrl);
    const btn = event.currentTarget;
    const card = btn.closest('.card');

    // Animate button
    btn.classList.add('done');

    // Save read state
    markAsRead(url);

    // Fade out card then re-render
    setTimeout(() => {
      card.classList.add('read-fade');
      setTimeout(() => {
        applyFilter(activeFilter);
      }, 400);
    }, 300);
  }

  function applyFilter(filter) {
    activeFilter = filter;
    const resolved = resolveFilter(filter);
    const filtered = filter === 'all'
      ? allNews
      : allNews.filter(n => getSourceKey(n) === resolved);

    const unread = filtered.filter(item => !isRead(item.url));
    document.getElementById('statusCount').textContent =
      `${unread.length} noticia${unread.length !== 1 ? 's' : ''}`;
    renderCards(filtered);
  }

  // Filter pills
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.filter);
    });
  });

  async function loadNews(forceRefresh = false) {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');

    // Check cache
    if (!forceRefresh) {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        if (cached.ts && Date.now() - cached.ts < CACHE_TTL && cached.data?.length) {
          allNews = cached.data;
          applyFilter(activeFilter);
          document.getElementById('lastUpdate').textContent = 'caché';
          btn.classList.remove('spinning');
          return;
        }
      } catch(e) {}
    }

    try {
      const res = await fetch(WEBHOOK_URL + '?apiKey=' + encodeURIComponent(API_KEY));

      if (res.status === 401) {
        throw new Error('API Key inválida. Revisa la configuración.');
      }

      if (!res.ok) throw new Error(`Error ${res.status}`);

      let payload = await res.json();
      // Handle case where n8n double-stringifies
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e) {}
      }
      allNews = payload.data || payload || [];

      // Save cache
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: allNews }));

      applyFilter(activeFilter);
      document.getElementById('lastUpdate').textContent = 'actualizado';

    } catch (err) {
      const list = document.getElementById('newsList');

      // Show cached data if available, even if stale
      if (allNews.length) {
        document.getElementById('lastUpdate').textContent = 'sin conexión';
      } else {
        list.innerHTML = `
          <div class="error-state">
            <div class="error-icon">⚡</div>
            <div class="error-title">No se pudo conectar</div>
            <div class="error-msg">${err.message}<br><br>Verifica que el webhook de n8n<br>esté activo y la URL sea correcta.</div>
          </div>`;
        document.getElementById('statusCount').textContent = 'Error';
      }
    } finally {
      btn.classList.remove('spinning');
    }
  }

  // Init
  loadNews();

  // Auto-refresh when tab gets focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadNews();
  });
