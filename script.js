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
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 24px;">
              <button id="btnTTS" class="modal-btn" onclick="toggleTTS()" style="background: var(--surface2); color: var(--text); border: 1px solid rgba(255,255,255,0.1);">
                <span id="ttsIcon">🔊</span> <span id="ttsText">Escuchar Resumen</span>
              </button>
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
    // Reset TTS state before opening
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    window.isSpeaking = false;
    resetTTSButton();

    const item = window.currentNewsList[index];
    if (!item) return;
    const seed = encodeURIComponent((item.title || 'IA').substring(0, 40));
    const fallbackImg = `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}&backgroundColor=18181f`;
    const picsumImg = `https://picsum.photos/seed/${seed}/600/300`;
    const validSrc = item.image_url && item.image_url !== 'null' && item.image_url.startsWith('http') ? item.image_url : null;
    const finalImg = validSrc || picsumImg;
    
    const imgEl = document.getElementById('modalImage');
    imgEl.src = finalImg;
    imgEl.onerror = () => { imgEl.src = fallbackImg; imgEl.onerror = null; };
    
    document.getElementById('modalSource').textContent = getSourceName(item);
    document.getElementById('modalTime').textContent = timeAgo(item.published_at);
    document.getElementById('modalTitle').textContent = item.title;
    document.getElementById('modalSummary').textContent = item.summary || 'Sin resumen disponible.';
    document.getElementById('modalLink').href = item.url;
    
    document.getElementById('newsModal').classList.add('visible');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  function resetTTSButton() {
    const btnText = document.getElementById('ttsText');
    const btnIcon = document.getElementById('ttsIcon');
    if(btnText && btnIcon) {
      btnText.textContent = 'Escuchar Resumen';
      btnIcon.textContent = '🔊';
    }
  }

  window.toggleTTS = function() {
    if (!('speechSynthesis' in window)) {
      alert("Tu navegador no soporta lectura por voz.");
      return;
    }
    
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      window.isSpeaking = false;
      resetTTSButton();
      return;
    }

    const title = document.getElementById('modalTitle').textContent;
    const summary = document.getElementById('modalSummary').textContent;
    const textToRead = "Te cuento: " + title + ". En resumen, " + summary;

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-AR'; // Spanish (Argentina)
    
    // Configuraciones humanizadas
    utterance.rate = 0.95;  // Una velocidad un 5% más lenta suena más reflexiva y humana
    utterance.pitch = 1.05; // Tono ligeramente animado
    
    // Intentar seleccionar una voz masculina de mejor calidad
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const isMale = v => /Tomas|Diego|Jorge|Pablo|Alvaro|Enrique|Raul|Antonio|Male/i.test(v.name);
      
      // 1. Priorizar voz Argentina masculina "Natural" o "Red"
      let bestVoice = voices.find(v => v.lang.includes('es-AR') && isMale(v) && (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Network')));
      // 2. Si no es "Natural", buscar cualquier voz Argentina masculina
      if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('es-AR') && isMale(v));
      // 3. Fallback a voz neutra masculina de alta calidad
      if (!bestVoice) bestVoice = voices.find(v => v.lang.startsWith('es') && isMale(v) && (v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Natural')));
      // 4. Fallback final
      if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('es-AR'));
      
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
    }
    
    utterance.onend = function() {
      window.isSpeaking = false;
      resetTTSButton();
    };

    window.speechSynthesis.speak(utterance);
    window.isSpeaking = true;
    
    document.getElementById('ttsText').textContent = 'Detener Audio';
    document.getElementById('ttsIcon').textContent = '⏹️';
  };

  window.isPodcastMode = false;
  window.podcastIndex = 0;
  window.podcastNewsList = [];

  window.togglePodcast = function() {
    if (!('speechSynthesis' in window)) {
      alert("Tu navegador no soporta lectura por voz.");
      return;
    }
    
    const btn = document.getElementById('podcastBtn');
    const textSpan = document.getElementById('podcastBtnText');
    
    if (window.isPodcastMode) {
      // Stop podcast
      window.isPodcastMode = false;
      window.speechSynthesis.cancel();
      if(btn) {
        btn.style.background = 'rgba(255, 255, 255, 0.1)';
        btn.style.color = 'var(--accent)';
      }
      if(textSpan) textSpan.textContent = "Modo Podcast";
      return;
    }
    
    // Start podcast
    window.isPodcastMode = true;
    window.podcastIndex = 0;
    
    const listToRead = window.currentNewsList || [];
    if (listToRead.length === 0) {
      alert("No hay noticias no leídas para el podcast.");
      window.isPodcastMode = false;
      return;
    }
    
    window.podcastNewsList = listToRead;
    
    if(btn) {
      btn.style.background = 'var(--accent)';
      btn.style.color = 'white';
    }
    if(textSpan) textSpan.textContent = "Detener Podcast";
    
    playNextPodcastItem();
  };

  window.playNextPodcastItem = function() {
    if (!window.isPodcastMode || window.podcastIndex >= window.podcastNewsList.length) {
      window.isPodcastMode = false;
      const btn = document.getElementById('podcastBtn');
      const textSpan = document.getElementById('podcastBtnText');
      if(btn) {
        btn.style.background = 'rgba(255, 255, 255, 0.1)';
        btn.style.color = 'var(--accent)';
      }
      if(textSpan) textSpan.textContent = "Modo Podcast";
      return;
    }
    
    const item = window.podcastNewsList[window.podcastIndex];
    
    const voices = window.speechSynthesis.getVoices();
    const isMale = v => /Tomas|Diego|Jorge|Pablo|Alvaro|Enrique|Raul|Antonio|Male/i.test(v.name);
    
    let host1 = voices.find(v => v.lang.includes('es-AR') && isMale(v) && (v.name.includes('Natural') || v.name.includes('Online')));
    if (!host1) host1 = voices.find(v => v.lang.includes('es-AR') && isMale(v));
    if (!host1) host1 = voices.find(v => v.lang.includes('es-AR'));
    
    let host2 = voices.find(v => v !== host1 && v.lang.includes('es-AR') && isMale(v));
    if (!host2) host2 = voices.find(v => v !== host1 && v.lang.startsWith('es') && isMale(v) && (v.name.includes('Natural') || v.name.includes('Premium')));
    if (!host2) host2 = host1; // Fallback to same voice, will use a low pitch offset to sound like another masculine voice
    
    let utterances = [];
    
    // Host 1: Presenta el título
    let text1 = "";
    if (window.podcastIndex === 0) {
      text1 = "Bienvenidos al resumen de IA. Para empezar, te cuento: " + item.title;
    } else if (window.podcastIndex === window.podcastNewsList.length - 1) {
      text1 = "Y por último, te comento que: " + item.title;
    } else {
      const transiciones = ["Tengo otra noticia: ", "Pasando a otro tema, ", "Escucha esto: ", "Siguiendo con más novedades, ", "A ver qué te parece esta: "];
      text1 = transiciones[window.podcastIndex % transiciones.length] + item.title;
    }
    
    const u1 = new SpeechSynthesisUtterance(text1);
    u1.lang = 'es-AR';
    u1.rate = 0.95;
    // Host 1 pitch grave para sonar masculino
    u1.pitch = 0.85;
    if (host1) u1.voice = host1;
    utterances.push(u1);
    
    // Host 2: Cuenta el resumen como un diálogo
    if (item.summary) {
      const respuestas = ["Claro, y en resumen, ", "Interesante. Básicamente, ", "Así es. Te resumo que ", "Exacto. El punto clave es que "];
      const text2 = respuestas[window.podcastIndex % respuestas.length] + item.summary;
      
      const u2 = new SpeechSynthesisUtterance(text2);
      u2.lang = host2 && host2.lang ? host2.lang : 'es-AR';
      u2.rate = 0.98;
      // Host 2: Si es la misma voz usar 1.0 para separarla, sino 0.9. Ambas graves/masculinas.
      u2.pitch = (host1 === host2) ? 1.0 : 0.9;
      if (host2) u2.voice = host2;
      utterances.push(u2);
    }
    
    function speakSequentially() {
      if (utterances.length === 0 || !window.isPodcastMode) {
        if (window.isPodcastMode) {
          // Marcar como leída y desaparecer de la interfaz
          markAsRead(item.url);
          applyFilter(activeFilter);
          
          window.podcastIndex++;
          setTimeout(() => {
            if (window.isPodcastMode) {
              playNextPodcastItem();
            }
          }, 1200);
        }
        return;
      }
      
      const u = utterances.shift();
      u.onend = function() {
        if (window.isPodcastMode) {
          speakSequentially();
        }
      };
      window.speechSynthesis.speak(u);
    }
    
    speakSequentially();
  };

  window.closeModal = function(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    document.getElementById('newsModal').classList.remove('visible');
    document.body.style.overflow = '';
    
    // Stop speaking when user closes modal
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.isSpeaking = false;
      resetTTSButton();
    }
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
      
      const seed = encodeURIComponent((item.title || 'IA').substring(0, 40));
      const fallbackImg = `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}&backgroundColor=18181f`;
      const picsumImg = `https://picsum.photos/seed/${seed}/600/300`;
      const validSrc = item.image_url && item.image_url !== 'null' && item.image_url.startsWith('http') ? item.image_url : null;
      const imageUrl = validSrc || picsumImg;

      return `
        <div class="card${isFeatured ? ' featured' : ''}" style="animation-delay: ${i * 40}ms" data-url="${item.url}" onclick="openModal(${i})">
          <button class="btn-read" onclick="handleRead(event, '${encodeURIComponent(item.url)}')" title="Marcar como leída">✓</button>
          <img class="card-image" src="${imageUrl}" alt="" loading="lazy" onerror="this.src='${fallbackImg}'; this.onerror=null;">
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
    
    let filtered;
    if (filter === 'all') {
      filtered = allNews;
    } else if (filter === 'tendencias') {
      filtered = allNews.filter(n => (n.category || '').toLowerCase() === 'tendencias');
    } else {
      filtered = allNews.filter(n => getSourceKey(n) === resolved);
    }

    const unread = filtered.filter(item => !isRead(item.url));
    document.getElementById('statusCount').textContent =
      `${unread.length} noticia${unread.length !== 1 ? 's' : ''}`;
    renderCards(filtered);
  }

  // Filter pills
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'podcastBtn') return;
      
      // Stop podcast if running
      if (window.isPodcastMode && 'speechSynthesis' in window) {
        window.isPodcastMode = false;
        window.speechSynthesis.cancel();
        const pBtn = document.getElementById('podcastBtn');
        const pText = document.getElementById('podcastBtnText');
        if (pBtn) {
          pBtn.style.background = 'rgba(255, 255, 255, 0.1)';
          pBtn.style.color = 'var(--accent)';
        }
        if (pText) pText.textContent = "Modo Podcast";
      }

      document.querySelectorAll('.filter-pill:not(#podcastBtn)').forEach(b => b.classList.remove('active'));
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
          allNews.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
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
      allNews.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));

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

  // Auto-refresh every 15 minutes automatically if left open
  setInterval(() => loadNews(), 15 * 60 * 1000);
