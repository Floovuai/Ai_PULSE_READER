  // ─── CONFIG ───────────────────────────────────────────────
  const WEBHOOK_URL = 'https://automatizaciones-vs1-n8n.h5jpeh.easypanel.host/webhook/ai-news'; // Reemplazar
  const API_KEY     = 'Hangar89*';     // Igual que en n8n
  const CACHE_KEY   = 'ainews_cache';
  const CACHE_TTL   = 15 * 60 * 1000; // 15 min
  const READ_KEY    = 'ainews_read';   // IDs de artículos leídos
  // ──────────────────────────────────────────────────────────

  // ─── CATEGORY MAP (agrupa fuentes de n8n por categoría) ──
  const CATEGORY_MAP = {
    'Inteligencia Artificial': ['openai', 'anthropic', 'langchain', 'huggingface', 'googleai', 'deepmind'],
    'Tecnología': ['xataka', 'techcrunch', 'venturebeat', 'technologyreview', 'verge', 'arstechnica', 'wired'],
    'Ciencia': ['nature', 'sciencedaily'],
    'Negocios': ['crunchbase'],
    'Comunidad': ['reddit']
  };

  let activeCategory = 'Todas';
  // ──────────────────────────────────────────────────────────
  
  // Helper centralizado para voces Neurales/Pro - Prioridad Argentina
  function getNeuralVoices() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return { host1: null, host2: null };
    
    // Prioridad 1: Argentina Neural/Pro (Google, Microsoft)
    let h1 = voices.find(v => v.lang.includes('es-AR') && (v.name.includes('Neural') || v.name.includes('Online') || v.name.includes('Google') || v.name.includes('Natural')));
    if (!h1) h1 = voices.find(v => v.lang.includes('es-AR'));
    if (!h1) h1 = voices.find(v => (v.lang.startsWith('es')) && (v.name.includes('Neural') || v.name.includes('Online') || v.name.includes('Google')));

    // Host 2: Preferiblemente una voz distinta de Argentina
    let h2 = voices.find(v => v !== h1 && v.lang.includes('es-AR') && (v.name.includes('Neural') || v.name.includes('Online')));
    if (!h2) h2 = voices.find(v => v !== h1 && v.lang.includes('es-AR'));
    if (!h2) h2 = h1;

    return { host1: h1, host2: h2 };
  }



  let allNews = [];
  let activeFilter = 'all';

  // ─── Read articles management (with auto-cleanup) ──────
  const READ_TTL = 7 * 24 * 60 * 60 * 1000; // 7 días
  const READ_MAX = 500; // Máximo de URLs recordadas

  function getReadMap() {
    // Formato: { url: timestamp, url2: timestamp2, ... }
    try {
      const raw = localStorage.getItem(READ_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // Migración: si es un array viejo, convertir a map
      if (Array.isArray(parsed)) {
        const map = {};
        const now = Date.now();
        parsed.forEach(url => map[url] = now);
        localStorage.setItem(READ_KEY, JSON.stringify(map));
        return map;
      }
      return parsed;
    } catch(e) { return {}; }
  }

  function markAsRead(articleUrl) {
    const map = getReadMap();
    map[articleUrl] = Date.now();
    localStorage.setItem(READ_KEY, JSON.stringify(map));
  }

  function isRead(articleUrl) {
    return articleUrl in getReadMap();
  }

  // Auto-limpieza: elimina leídas > 7 días y recorta si hay > 500
  function cleanupReadArticles() {
    const map = getReadMap();
    const now = Date.now();
    const entries = Object.entries(map);
    let changed = false;

    // 1) Eliminar por TTL (> 7 días)
    for (const [url, ts] of entries) {
      if (now - ts > READ_TTL) {
        delete map[url];
        changed = true;
      }
    }

    // 2) Si aún hay demasiadas, recortar las más antiguas
    const remaining = Object.entries(map);
    if (remaining.length > READ_MAX) {
      remaining.sort((a, b) => a[1] - b[1]); // Más antiguas primero
      const toRemove = remaining.slice(0, remaining.length - READ_MAX);
      for (const [url] of toRemove) {
        delete map[url];
      }
      changed = true;
    }

    if (changed) {
      localStorage.setItem(READ_KEY, JSON.stringify(map));
      console.log(`🧹 Auto-limpieza: ${entries.length - Object.keys(map).length} artículos leídos eliminados`);
    }
  }


  // Ejecutar limpieza al cargar
  cleanupReadArticles();
  // ──────────────────────────────────────────────────────────

  // Source name map
  const sourceNames = {
    xataka: 'Xataka',
    anthropic: 'Anthropic',
    langchain: 'LangChain',
    openai: 'OpenAI',
    techcrunch: 'TechCrunch',
    venturebeat: 'VentureBeat',
    technologyreview: 'MIT Tech Review',
    huggingface: 'HuggingFace',
    reddit: 'Reddit',
    verge: 'The Verge',
    arstechnica: 'Ars Technica',
    wired: 'Wired',
    googleai: 'Google AI',
    deepmind: 'DeepMind',
    nature: 'Nature',
    sciencedaily: 'Science Daily',
    crunchbase: 'Crunchbase',
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

  // Initialize gestures for the static modal
  if (document.getElementById('newsModal')) {
    initSheetGestures();
  }


  function initSheetGestures() {
    const modal = document.querySelector('.modal-content');
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    modal.addEventListener('touchstart', (e) => {
      // Only allow dragging from grabber or if scrolled to top
      const modalBody = modal.querySelector('.modal-body');
      if (modalBody.scrollTop > 0 && !e.target.classList.contains('modal-grabber')) return;

      startY = e.touches[0].clientY;
      isDragging = true;
    }, { passive: true });

    modal.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0) {
        modal.classList.add('dragging');
        modal.style.transform = `translateY(${diff}px)`;
      }
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      modal.classList.remove('dragging');
      
      const diff = currentY - startY;
      if (diff > 120) { // Threshold to close
        closeModal();
      } else {
        modal.style.transform = ''; // Snap back
      }
      startY = 0;
      currentY = 0;
    });
  }

  window.closeModal = function() {
    const modal = document.getElementById('newsModal');
    if (!modal) return;
    modal.classList.remove('visible');
    document.body.style.overflow = '';
    // Stop TTS
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    window.isSpeaking = false;
    resetTTSButton();
    // Reset drag transform
    const content = modal.querySelector('.modal-content');
    if (content) content.style.transform = '';
  }

  window.currentModalIndex = -1;


  window.openModal = function(index) {
    // Reset TTS state before opening
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    window.isSpeaking = false;
    resetTTSButton();

    const item = window.currentNewsList[index];
    if (!item) return;
    window.currentModalIndex = index;

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
    
    // Sync speed button text
    const rateText = document.getElementById('rateBtnText');
    if (rateText) {
      const labels = ["Normal", "Rápida", "Muy Rápida"];
      rateText.textContent = `Velocidad: ${labels[window.rateLevel || 0]}`;
    }

    // Sync read button state
    syncReadButton(item.url);

    document.getElementById('newsModal').classList.add('visible');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  function syncReadButton(articleUrl) {
    const icon = document.getElementById('markReadIcon');
    const text = document.getElementById('markReadText');
    if (!icon || !text) return;
    const read = isRead(articleUrl);
    icon.textContent = read ? '↩' : '✓';
    text.textContent = read ? 'Desmarcar como leída' : 'Marcar como leída';
  }

  window.toggleReadFromModal = function() {
    const item = window.currentNewsList[window.currentModalIndex];
    if (!item) return;

    if (isRead(item.url)) {
      // Unmark: remove from read map
      const map = getReadMap();
      delete map[item.url];
      localStorage.setItem(READ_KEY, JSON.stringify(map));
    } else {
      markAsRead(item.url);
    }

    // Update button state
    syncReadButton(item.url);

    // Re-render card list so the read state is reflected
    renderCards(allNews.filter(n => {
      const key = getSourceKey(n);
      const resolved = resolveFilter(activeFilter);
      if (resolved !== 'all' && key !== resolved) return false;
      if (activeCategory !== 'Todas') {
        const catSources = CATEGORY_MAP[activeCategory] || [];
        if (!catSources.includes(key)) return false;
      }
      return true;
    }));
  }

  function resetTTSButton() {
    const btnText = document.getElementById('ttsText');
    const btnIcon = document.getElementById('ttsIcon');
    if(btnText && btnIcon) {
      btnText.textContent = 'Escuchar Resumen';
      btnIcon.textContent = '🔊';
    }
  }

  // Unlock Speech Synthesis on first click
  document.addEventListener('click', function unlockOnFirstClick() {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(utterance);
    }
    document.removeEventListener('click', unlockOnFirstClick);
  }, { once: true });

  window.rateOffset = 0;
  window.rateLevel = 0; // 0: Normal, 1: Rápida, 2: Muy Rápida
  
  window.toggleRate = function() {
    window.rateLevel = (window.rateLevel + 1) % 3;
    const btnText = document.getElementById('rateBtnText');
    if (window.rateLevel === 0) {
      window.rateOffset = 0;
      if (btnText) btnText.textContent = "Velocidad: Normal";
    } else if (window.rateLevel === 1) {
      window.rateOffset = 0.25;
      if (btnText) btnText.textContent = "Velocidad: Rápida";
    } else {
      window.rateOffset = 0.55;
      if (btnText) btnText.textContent = "Velocidad: Muy Rápida";
    }
    
    // Si está hablando en el resumen del modal en este momento, reiniciarlo para aplicar la velocidad
    if (window.speechSynthesis.speaking && !window.isPodcastMode && window.isSpeaking) {
        window.speechSynthesis.cancel();
        // Esperamos un momento a que el cancel surta efecto antes de reiniciar
        setTimeout(() => {
            window.isSpeaking = false;
            window.toggleTTS();
        }, 300);
    }
  };

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
    
    const intros = [
      "Escucha esta novedad: ",
      "Aquí tienes los detalles: ",
      "Te cuento lo más importante: ",
      "Atención a esta noticia: ",
      "Esto es lo que está pasando: "
    ];
    const randomIntro = intros[Math.floor(Math.random() * intros.length)];
    const textToRead = randomIntro + title + ". ... " + summary;

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-AR';
    utterance.rate = 0.95 + (window.rateOffset || 0); // Un poco más humano para es-AR
    utterance.pitch = 1.0; 
    
    const { host1 } = getNeuralVoices();
    if (host1) utterance.voice = host1;
    

    utterance.onend = function() {
      window.isSpeaking = false;
      resetTTSButton();
    };


    window.speechSynthesis.speak(utterance);
    window.isSpeaking = true;
    
    const ttsText = document.getElementById('ttsText');
    const ttsIcon = document.getElementById('ttsIcon');
    if (ttsText) ttsText.textContent = 'Detener Audio';
    if (ttsIcon) ttsIcon.textContent = '⏹️';
  };

  window.playNextPodcastItem = function() {
    if (!window.isPodcastMode || window.podcastIndex >= window.podcastNewsList.length) {
      window.isPodcastMode = false;
      resetPodcastButtonUI();
      return;
    }
    
    const item = window.podcastNewsList[window.podcastIndex];
    if (isRead(item.url)) { // Saltar si ya se leyó
      window.podcastIndex++;
      playNextPodcastItem();
      return;
    }

    const { host1, host2 } = getNeuralVoices();
    let utterances = [];
    
    // --- DIÁLOGO HOST 1 (Intro & Título) ---
    let text1 = "";
    const introsH1 = [
      "¡Hola! Bienvenidos. Hoy tenemos una noticia interesante: ",
      "Atención a lo siguiente: ",
      "Me ha llamado mucho la atención esto: ",
      "Pasando a otros temas, mira lo que está pasando: ",
      "Y no te pierdas esta última hora: "
    ];
    if (window.podcastIndex === 0) {
      text1 = "¡Comenzamos nuestro resumen diario de IA! El primer tema de hoy es: " + item.title;
    } else {
      text1 = introsH1[Math.floor(Math.random() * introsH1.length)] + item.title;
    }
    
    const u1 = new SpeechSynthesisUtterance(text1 + "...");
    if (host1) u1.voice = host1;
    u1.rate = 0.95 + (window.rateOffset || 0);
    u1.pitch = 1.02; // Tono ligeramente más alto para el host 1
    utterances.push(u1);
    
    // --- DIÁLOGO HOST 2 (Reacción & Resumen) ---
    if (item.summary) {
      const reactionsH2 = [
        "¡Uf, eso suena impactante! ... Según entiendo, ",
        "Es un tema clave. ... Lo que se comenta es que ",
        "Vaya, no lo sabía. ... El resumen es básicamente que ",
        "Claro, y lo más importante es que ",
        "¡Interesante! ... Mira, para los que nos escuchan, el punto central es que "
      ];
      const text2 = reactionsH2[Math.floor(Math.random() * reactionsH2.length)] + item.summary;
      
      const u2 = new SpeechSynthesisUtterance(text2);
      if (host2) u2.voice = host2;
      u2.rate = 0.98 + (window.rateOffset || 0);
      // Si es la misma voz que H1, cambiar pitch para diferenciar
      u2.pitch = (host1 === host2) ? 0.88 : 0.95; 
      utterances.push(u2);
    }
    
    function speakSequentially() {
      if (utterances.length === 0) {

        markAsRead(item.url);
        applyFilter(activeFilter);
        
        window.podcastIndex++;
        setTimeout(() => {
          if (window.isPodcastMode) playNextPodcastItem();
        }, 1500);
        return;
      }
      
      const u = utterances.shift();

      u.onend = () => {
        if (window.isPodcastMode) speakSequentially();
      };
      u.onerror = (e) => {
        console.error("Audio playback error:", e);

        if (window.isPodcastMode) speakSequentially();
      };
      window.speechSynthesis.speak(u);
    }
    
    speakSequentially();
  };

  function resetPodcastButtonUI() {
    const btn = document.getElementById('podcastBtn');
    const textSpan = document.getElementById('podcastBtnText');
    if(btn) {
      btn.style.background = 'rgba(255, 255, 255, 0.1)';
      btn.style.color = 'var(--accent)';
    }
    if(textSpan) textSpan.textContent = "Modo Podcast";
  }

  window.togglePodcast = function() {
    if (!('speechSynthesis' in window)) {
      alert("Tu navegador no soporta lectura por voz.");
      return;
    }
    
    if (window.isPodcastMode) {
      window.isPodcastMode = false;
      window.speechSynthesis.cancel();
      resetPodcastButtonUI();
      return;
    }
    
    // Obtener noticias NO leídas para el podcast
    const unreadList = (window.currentNewsList || []).filter(item => !isRead(item.url));
    if (unreadList.length === 0) {
      alert("No hay noticias nuevas para el podcast.");
      return;
    }
    
    window.isPodcastMode = true;
    window.podcastIndex = 0;
    window.podcastNewsList = unreadList;
    
    const btn = document.getElementById('podcastBtn');
    const textSpan = document.getElementById('podcastBtnText');
    if(btn) {
      btn.style.background = 'var(--accent)';
      btn.style.color = 'white';
    }
    if(textSpan) textSpan.textContent = "Detener Podcast";
    
    playNextPodcastItem();
  };

  window.closeModal = function(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const modal = document.getElementById('newsModal');
    const content = modal.querySelector('.modal-content');
    
    modal.classList.remove('visible');
    content.style.transform = ''; // Reset gesture transform
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
    window.currentNewsList = news; // Save for modal

    if (!news.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="pulse-dot"></div>
          <div class="error-title">Sin noticias aún</div>
          <div class="error-msg">El workflow de n8n todavía no ha<br>recopilado artículos. Vuelve pronto.</div>
        </div>`;
      return;
    }

    list.innerHTML = news.map((item, i) => {
      const isFeatured = i === 0 && activeFilter === 'all';
      const sourceName = getSourceName(item);
      const time = timeAgo(item.published_at);
      const read = isRead(item.url);
      
      const seed = encodeURIComponent((item.title || 'IA').substring(0, 40));
      const fallbackImg = `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}&backgroundColor=18181f`;
      const picsumImg = `https://picsum.photos/seed/${seed}/600/300`;
      const validSrc = item.image_url && item.image_url !== 'null' && item.image_url.startsWith('http') ? item.image_url : null;
      const imageUrl = validSrc || picsumImg;

      return `
        <div class="card${isFeatured ? ' featured' : ''}${read ? ' read' : ''}" style="animation-delay: ${i * 40}ms" data-url="${item.url}" onclick="openModal(${i})">

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
    
    // First apply category filter
    let categoryFiltered = allNews;
    if (activeCategory !== 'Todas') {
      const catSources = CATEGORY_MAP[activeCategory] || [];
      categoryFiltered = allNews.filter(n => catSources.includes(getSourceKey(n)));
    }
    
    let filtered;
    if (filter === 'all') {
      filtered = categoryFiltered;
    } else if (filter === 'tendencias') {
      filtered = categoryFiltered.filter(n => (n.category || '').toLowerCase() === 'tendencias');
    } else {
      filtered = categoryFiltered.filter(n => getSourceKey(n) === resolved);
    }

    const unread = filtered.filter(item => !isRead(item.url));
    document.getElementById('statusCount').textContent =
      `${unread.length} noticia${unread.length !== 1 ? 's' : ''}`;
    renderCards(filtered);
  }

  // ─── CATEGORY BAR LOGIC ────────────────────────────────────
  function renderCategoryBar() {
    const bar = document.getElementById('categoryBar');
    if (!bar) return;
    const categories = ['Todas', ...Object.keys(CATEGORY_MAP)];
    bar.innerHTML = categories.map(cat => 
      `<button class="category-pill${cat === activeCategory ? ' active' : ''}" data-category="${cat}">${cat}</button>`
    ).join('');
    
    bar.querySelectorAll('.category-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.category;
        bar.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderSourcePills();
        applyFilter('all');
      });
    });
  }

  function renderSourcePills() {
    const container = document.getElementById('sourcePills');
    if (!container) return;
    
    let pills = '<button class="filter-pill active" data-filter="all">Todas</button>';
    pills += '<button class="filter-pill" data-filter="tendencias" style="color: var(--accent2); font-weight: 700;">🔥 Tendencias</button>';
    
    let sourcesToShow = [];
    if (activeCategory === 'Todas') {
      sourcesToShow = Object.keys(sourceNames);
    } else {
      sourcesToShow = CATEGORY_MAP[activeCategory] || [];
    }
    
    for (const key of sourcesToShow) {
      const name = sourceNames[key] || key;
      const filterKey = key === 'technologyreview' ? 'mittech' : key;
      pills += `<button class="filter-pill" data-filter="${filterKey}">${name}</button>`;
    }
    
    container.innerHTML = pills;
    
    // Re-attach filter pill event listeners
    container.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        stopPodcastIfRunning();
        container.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilter(btn.dataset.filter);
      });
    });
  }

  function stopPodcastIfRunning() {
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
  }

  // Legacy filter pill listeners (for static pills if any remain)
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPodcastIfRunning();
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
          allNews.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
          applyFilter(activeFilter);
          document.getElementById('lastUpdate').textContent = 'caché';
          btn.classList.remove('spinning');
          return;
        }
      } catch(e) {}
    }

    try {
      // 1. Fetch from n8n (main sources)
      const res = await fetch(WEBHOOK_URL + '?apiKey=' + encodeURIComponent(API_KEY));

      if (res.status === 401) {
        throw new Error('API Key inválida. Revisa la configuración.');
      }

      if (!res.ok) throw new Error(`Error ${res.status}`);

      let payload = await res.json();
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
  renderCategoryBar();
  renderSourcePills();
  loadNews();

  // Auto-refresh when tab gets focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadNews();
  });

  // Auto-refresh every 15 minutes automatically if left open
  setInterval(() => loadNews(), 15 * 60 * 1000);

  // ─── Utility Functions for Header Actions ─────────────────

  window.toggleFontSize = function(size) {
    const scales = { small: 0.9, medium: 1, large: 1.1 };
    // Apply scale directly to root so rem units pick it up
    document.documentElement.style.setProperty('--scale', scales[size]);
    // Keep body class for backward compat
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add(`font-${size}`);
    // Update button states
    document.querySelectorAll('.font-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === size);
    });
    // Persist
    localStorage.setItem('ainews_font_size', size);
  };

  window.openInBrowser = function() {
    const currentUrl = window.location.href;
    // In many APK/Webview environments, this helps breakout
    window.open(currentUrl, '_system');
    // Fallback if _system isn't supported
    setTimeout(() => {
        window.location.href = currentUrl;
    }, 100);
  };

  // Restore Font Size on Init
  (function initFontSize() {
    const savedSize = localStorage.getItem('ainews_font_size') || 'medium';
    toggleFontSize(savedSize);
  })();

