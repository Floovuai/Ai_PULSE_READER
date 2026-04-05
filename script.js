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
          <div class="modal-grabber"></div>
          <button class="modal-close" onclick="closeModal(event)">✕</button>
          <img id="modalImage" class="modal-image" src="" alt="">
          <div class="modal-body">
            <div class="card-meta" style="margin-bottom: 12px;">
              <span id="modalSource" class="source-badge"></span>
              <span id="modalTime" class="card-time"></span>
            </div>
            <h2 id="modalTitle" class="modal-title"></h2>
            <div id="modalSummary" class="modal-summary-text"></div>
            <div class="modal-actions-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px;">
              <button id="btnTTS" class="modal-btn" onclick="toggleTTS()" style="grid-column: span 2; background: var(--accent); color: white;">
                <span id="ttsIcon">🔊</span> <span id="ttsText">Escuchar Resumen</span>
              </button>
              <button id="btnRate" class="modal-btn" onclick="toggleRate()" style="background: var(--surface2); color: var(--text); border: 1px solid rgba(255,255,255,0.1); box-shadow: none;">
                ⏱️ <span id="rateBtnText">Velocidad: Normal</span>
              </button>
              <a id="modalLink" class="modal-btn" href="#" target="_blank" rel="noopener noreferrer" style="background: var(--surface2); color: var(--text); border: 1px solid rgba(255,255,255,0.1); box-shadow: none;">
                Leer artículo
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
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
    
    // Sync speed button text
    const rateText = document.getElementById('rateBtnText');
    if (rateText) {
      const labels = ["Normal", "Rápida", "Muy Rápida"];
      rateText.textContent = `Velocidad: ${labels[window.rateLevel || 0]}`;
    }

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

  window.bgMusicEnabled = true;
  window.currentTrackIndex = 0;
  window.lofiPlaylist = [
    'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
    'https://cdn.pixabay.com/download/audio/2022/03/15/audio_73149be116.mp3?filename=empty-mind-11897.mp3',
    'https://cdn.pixabay.com/download/audio/2024/02/07/audio_7f53a47833.mp3?filename=lofi-chill-medium-187515.mp3'
  ];
  
  window.toggleMusic = function() {
    const btnText = document.getElementById('musicToggleText');
    const bgMusic = document.getElementById('bgMusic');
    
    // Unlock audio context if needed
    if (!window.audioUnlocked) {
      unlockAudio();
    }
    
    window.bgMusicEnabled = !window.bgMusicEnabled;
    
    if (window.bgMusicEnabled) {
      if (btnText) btnText.textContent = "Mini-Rockola: On";
      if (bgMusic) {
        if (!bgMusic.src || bgMusic.src === "") {
            bgMusic.src = window.lofiPlaylist[window.currentTrackIndex];
        }
        bgMusic.volume = 0.08;
        bgMusic.play().catch(e => {
            console.log('Audio playback delayed or blocked:', e);
            showAudioPrompt();
        });
      }
    } else {
      if (btnText) btnText.textContent = "Mini-Rockola: Off";
      if (bgMusic) bgMusic.pause();
    }
  };

  function showAudioPrompt() {
    let prompt = document.getElementById('audioPrompt');
    if (!prompt) {
      prompt = document.createElement('div');
      prompt.id = 'audioPrompt';
      prompt.textContent = 'Click para Activar Audio 🎵';
      prompt.onclick = () => {
        unlockAudio();
        prompt.style.display = 'none';
      };
      document.body.appendChild(prompt);
    }
    prompt.style.display = 'block';
  }

  function unlockAudio() {
    const bgMusic = document.getElementById('bgMusic');
    if (bgMusic) {
      if (!bgMusic.src || bgMusic.src === "") {
        bgMusic.src = window.lofiPlaylist[window.currentTrackIndex];
      }
      bgMusic.play().then(() => {
        if (!window.bgMusicEnabled) bgMusic.pause();
        window.audioUnlocked = true;
      }).catch(e => console.log("Unlock failed:", e));
    }
    
    // Unlock Speech Synthesis
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(utterance);
    }
    window.audioUnlocked = true;
    const prompt = document.getElementById('audioPrompt');
    if (prompt) prompt.style.display = 'none';
  }

  // Global click to unlock audio
  document.addEventListener('click', function unlockOnFirstClick() {
    if (!window.audioUnlocked) {
      unlockAudio();
      document.removeEventListener('click', unlockOnFirstClick);
    }
  }, { once: true });

  window.nextTrack = function() {
    const bgMusic = document.getElementById('bgMusic');
    if (!bgMusic) return;

    window.currentTrackIndex = (window.currentTrackIndex + 1) % window.lofiPlaylist.length;
    bgMusic.src = window.lofiPlaylist[window.currentTrackIndex];
    bgMusic.load();
    
    if (window.bgMusicEnabled) {
      bgMusic.volume = 0.08;
      bgMusic.play().catch(e => console.log('Next track error:', e));
    }
  };

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
    
    // Intros dinámicas para un efecto más humano
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
    utterance.lang = 'es-ES'; // Prefer Spanish
    
    // Ajustar velocidad basada en el control del usuario
    // Base 1.0 (Normal), offset añade 0.25 o 0.5
    utterance.rate = 1.0 + (window.rateOffset || 0); 
    utterance.pitch = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      // Prioridad 1: Voces Neurales/Online de Google o Microsoft (son las de mejor calidad)
      let bestVoice = voices.find(v => (v.lang.startsWith('es')) && (v.name.includes('Neural') || v.name.includes('Online') || v.name.includes('Google')));
      
      // Prioridad 2: Cualquier voz en español que suene natural
      if (!bestVoice) bestVoice = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Premium')));
      
      // Prioridad 3: Fallback a cualquier voz en español de Argentina o España
      if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('es-AR') || v.lang.includes('es-ES'));

      if (bestVoice) utterance.voice = bestVoice;
    }
    
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
      const bgMusic = document.getElementById('bgMusic');
      if (bgMusic) bgMusic.pause();
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
    
    const bgMusic = document.getElementById('bgMusic');
    if (bgMusic && window.bgMusicEnabled) {
        bgMusic.volume = 0.08;
        bgMusic.play().catch(e => console.log('Audio play error:', e));
    }
    
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
    u1.rate = Math.min(2, 0.95 + window.rateOffset);
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
      u2.rate = Math.min(2, 0.98 + window.rateOffset);
      // Host 2: Si es la misma voz usar 1.0 para separarla, sino 0.9. Ambas graves/masculinas
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
      // Al haber separado las clases a .control-pill, aquí solo entran los filtros reales
      
      // Stop podcast if running when changing filters
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
