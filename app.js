document.addEventListener('DOMContentLoaded', () => {

    // Views
    const loginView = document.getElementById('loginView');
    const hubView = document.getElementById('hubView');
    const playerView = document.getElementById('playerView');

    // Login Elements
    const inputServer = document.getElementById('inputServer');
    const inputUser = document.getElementById('inputUser');
    const inputPass = document.getElementById('inputPass');
    const btnLogin = document.getElementById('btnLogin');
    const loginErrorMsg = document.getElementById('loginErrorMsg');
    
    // Hub Elements
    const btnLogout = document.getElementById('btnLogout');
    const profileName = document.getElementById('profileName');
    const gridContainer = document.getElementById('gridContainer');
    const hubTitle = document.getElementById('hubTitle');
    const btnBackToCat = document.getElementById('btnBackToCat');
    const globalSearch = document.getElementById('globalSearch');
    
    // Nav Elements
    const navButtons = {
        'live': document.getElementById('navLive'),
        'catchup': document.getElementById('navCatchup'),
        'tvGuide': document.getElementById('navTvGuide'),
        'vod': document.getElementById('navVod'),
        'series': document.getElementById('navSeries'),
        'favorites': document.getElementById('navFavorites'),
        'history': document.getElementById('navHistory')
    };

    // Player Elements
    const playerControlsContainer = document.getElementById('playerControlsContainer');
    const videoElement = document.getElementById('videoElement');
    const btnClosePlayer = document.getElementById('btnClosePlayer');
    const playerStreamTitle = document.getElementById('playerStreamTitle');
    const playerLoading = document.getElementById('playerLoading');
    const playerStatusText = document.getElementById('playerStatusText');
    const playerBadgeText = document.getElementById('playerBadgeText');
    const playerBadge = document.getElementById('playerBadge');
    const centerFeedbackIcon = document.getElementById('centerFeedbackIcon');
    const playerEpgContainer = document.getElementById('playerEpgContainer');
    const playerEpgText = document.getElementById('playerEpgText');
    const playerBadgeContainer = document.getElementById('playerBadgeContainer');

    // Resume Prompt Elements
    const resumePromptOverlay = document.getElementById('resumePromptOverlay');
    const resumePromptText = document.getElementById('resumePromptText');
    const btnPlayerResume = document.getElementById('btnPlayerResume');
    const btnPlayerRestart = document.getElementById('btnPlayerRestart');

    // Drawer Elements
    const btnToggleEpgDrawer = document.getElementById('btnToggleEpgDrawer');
    const btnCloseEpgDrawer = document.getElementById('btnCloseEpgDrawer');
    const playerChannelsDrawer = document.getElementById('playerChannelsDrawer');
    const drawerChannelsList = document.getElementById('drawerChannelsList');
    const drawerSearch = document.getElementById('drawerSearch');

    // Player Bottom Controls
    const btnPlayPause = document.getElementById('btnPlayPause');
    const btnRewind = document.getElementById('btnRewind');
    const btnForward = document.getElementById('btnForward');
    const btnVolumeToggle = document.getElementById('btnVolumeToggle');
    const volumeSlider = document.getElementById('volumeSlider');
    const btnFullscreen = document.getElementById('btnFullscreen');
    const timeCurrent = document.getElementById('timeCurrent');
    const timeTotal = document.getElementById('timeTotal');
    const progressTrack = document.getElementById('progressTrack');
    const progressFill = document.getElementById('progressFill');
    const progressThumb = document.getElementById('progressThumb');
    const progressBuffer = document.getElementById('progressBuffer');
    
    // Global State
    let hls = null;
    let currentMpegtsPlayer = null;
    let credentials = null;
    let currentMode = 'live'; // 'live', 'vod', 'series'
    let currentCategoryId = null; // null = viewing categories, string = viewing streams in category
    let currentCategoryName = '';
    
    // Favorites Tracking Array
    let favoritesList = [];
    try {
        const savedFavs = localStorage.getItem('xtream_favorites_v2');
        if(savedFavs) favoritesList = JSON.parse(savedFavs);
    } catch(e) {}
    
    // History Tracking Array
    let historyList = [];
    try {
        const savedHist = localStorage.getItem('xtream_history');
        if(savedHist) historyList = JSON.parse(savedHist);
    } catch(e) {}

    // Playback Progress Tracking Dictionary
    let playbackProgress = {};
    try {
        const savedProg = localStorage.getItem('xtream_progress');
        if(savedProg) playbackProgress = JSON.parse(savedProg);
    } catch(e) {}

    let currentPlayingStreamId = null;
    let currentPlayingMode = null;

    function pushToHistory(stream) {
        // Remove if exists to push it to the top
        const uniqueId = String(stream.stream_id || stream.id);
        const existsIndex = historyList.findIndex(f => String(f.stream_id || f.id) === uniqueId);
        if(existsIndex > -1) {
            historyList.splice(existsIndex, 1);
        }
        // Save necessary data
        stream._originalMode = currentMode;
        stream._watchedAt = Date.now();
        historyList.unshift(stream);
        // keep only 50
        historyList = historyList.slice(0, 50);
        localStorage.setItem('xtream_history', JSON.stringify(historyList));
    }

    function toggleFavorite(stream, e) {
        e.stopPropagation(); // Prevent opening player
        const uniqueId = String(stream.stream_id || stream.id);
        const existsIndex = favoritesList.findIndex(f => String(f.stream_id || f.id) === uniqueId);
        
        let heartIcon = e.currentTarget.querySelector('span');

        if (existsIndex > -1) {
            favoritesList.splice(existsIndex, 1);
            heartIcon.textContent = 'favorite_border';
            heartIcon.style.fontVariationSettings = "'FILL' 0";
            e.currentTarget.classList.remove('text-rose-500');
            e.currentTarget.classList.add('text-white/50');
            
            // If we are currently IN the favorites view, we should remove the card
            if (currentMode === 'favorites') {
                e.currentTarget.closest('.group.cursor-pointer').remove();
                if(favoritesList.length === 0) gridContainer.innerHTML = `<div class="col-span-full text-zinc-500 text-center">אין מועדפים שמורים עדיין.</div>`;
            }

        } else {
            // Determine type before saving so we can play it instantly later
            stream._originalMode = currentMode; 
            favoritesList.push(stream);
            heartIcon.textContent = 'favorite';
            heartIcon.style.fontVariationSettings = "'FILL' 1";
            e.currentTarget.classList.remove('text-white/50');
            e.currentTarget.classList.add('text-rose-500');
        }
        localStorage.setItem('xtream_favorites_v2', JSON.stringify(favoritesList));
    }

    // Memory Cache so we don't spam the server on every click back and forth
    const cache = {
        live_categories: [], live_streams: {},
        vod_categories: [], vod_streams: {},
        series_categories: [], series_streams: {},
        // flat all item caches for Global Search
        live_flat_all: null, vod_flat_all: null, series_flat_all: null
    };

    // Local Storage Check
    function checkLogin() {
        // Disable MPEGTS.js debug spam in console
        try { mpegts.LoggingControl.enableAll = false; } catch(e){}
        
        const stored = localStorage.getItem('xtream_creds');
        if (stored) {
            credentials = JSON.parse(stored);
            loginView.classList.add('hidden');
            hubView.classList.remove('hidden');
            profileName.textContent = credentials.username;
            
            // Parse SPA URL for initial routing
            const path = window.location.pathname.toLowerCase().replace(/^\//, ''); // Remove leading slash
            const validModes = ['live', 'catchup', 'tvguide', 'vod', 'series', 'favorites', 'history'];
            let initialMode = 'live';
            if(validModes.includes(path)) initialMode = path === 'tvguide' ? 'tvGuide' : path;
            
            setAppMode(initialMode); // Start in targeted view or Live TV
            loadServerStats(); // Fetch sidebar database numbers asynchronously
        } else {
            loginView.classList.remove('hidden');
            hubView.classList.add('hidden');
            playerView.classList.add('hidden');
        }
    }
    checkLogin();

    // Async Fetch Server Stats
    async function loadServerStats() {
        if(!credentials) return;
        try {
            const fetchCount = async (action) => {
                const url = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=${action}`;
                const res = await fetch(`/proxy.api?url=${encodeURIComponent(url)}`);
                const data = await res.json();
                return Array.isArray(data) ? data.length : Object.keys(data).length;
            };

            const [liveCt, vodCt, seriesCt] = await Promise.all([
                fetchCount('get_live_streams'),
                fetchCount('get_vod_streams'),
                fetchCount('get_series')
            ]);
            
            document.getElementById('statLive').textContent = liveCt;
            document.getElementById('statVod').textContent = vodCt;
            document.getElementById('statSeries').textContent = seriesCt;
            document.getElementById('statTotal').textContent = liveCt + vodCt + seriesCt;
        } catch(e) {
            console.error("Stats fetch error:", e);
        }
    }

    // Login Auth
    btnLogin.addEventListener('click', async () => {
        let server = inputServer.value.trim();
        const user = inputUser.value.trim();
        const pass = inputPass.value.trim();
        
        if (!server || !user || !pass) {
            loginErrorMsg.textContent = 'Please enter all details';
            loginErrorMsg.classList.remove('hidden'); return;
        }

        if (server.endsWith('/')) server = server.slice(0, -1);
        if (!server.startsWith('http')) server = 'http://' + server;

        const authUrl = `${server}/player_api.php?username=${user}&password=${pass}`;
        
        try {
            btnLogin.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span><span>Connecting...</span>`;
            const res = await fetch(`/proxy.api?url=${encodeURIComponent(authUrl)}`);
            const data = await res.json();
            
            if (data && data.user_info && data.user_info.auth === 1) {
                credentials = { server, username: user, password: pass };
                localStorage.setItem('xtream_creds', JSON.stringify(credentials));
                loginErrorMsg.classList.add('hidden');
                checkLogin();
            } else {
                loginErrorMsg.textContent = 'Invalid username or password';
                loginErrorMsg.classList.remove('hidden');
            }
        } catch (err) {
            loginErrorMsg.textContent = 'Network error. Check server connection.';
            loginErrorMsg.classList.remove('hidden');
        } finally {
            btnLogin.innerHTML = `<span class="material-symbols-outlined">play_circle</span><span>Start Watching</span>`;
        }
    });

    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('xtream_creds');
        closePlayer();
        checkLogin();
    });

    // Sidebar Navigation Click
    Object.keys(navButtons).forEach(mode => {
        navButtons[mode].addEventListener('click', () => {
            setAppMode(mode);
        });
    });

    // Update Sidebar Styling and Route
    function setAppMode(mode) {
        currentMode = mode;
        currentCategoryId = null; // Always reset to categories
        
        // SPA Deep Linking - Push State
        const urlMode = mode === 'tvGuide' ? 'tvguide' : mode;
        if (window.location.pathname !== `/${urlMode}`) {
            window.history.pushState({ mode }, "", `/${urlMode}`);
        }
        
        // Update Sidebar Active state
        Object.keys(navButtons).forEach(key => {
            const btn = navButtons[key];
            if (key === mode) {
                // Highlight color depending on mode
                let focusColor = '';
                if(mode === 'favorites') focusColor = 'md:from-rose-500/10 md:border-rose-400 text-rose-400 rounded-lg md:rounded-xl bg-white/5 md:bg-transparent';
                else if(mode === 'history') focusColor = 'md:from-amber-500/10 md:border-amber-400 text-amber-500 rounded-lg md:rounded-xl bg-white/5 md:bg-transparent';
                else focusColor = 'md:from-primary/10 md:border-primary text-primary rounded-lg md:rounded-xl bg-white/5 md:bg-transparent';
                
                btn.className = `flex-1 md:flex-none flex flex-col md:flex-row-reverse items-center justify-center md:justify-start gap-1 md:gap-4 md:px-4 py-2 md:py-3 bg-gradient-to-l ${focusColor} md:border-r-4 font-headline font-semibold transition-all shadow-inner md:shadow-md`;
            } else {
                btn.className = "flex-1 md:flex-none flex flex-col md:flex-row-reverse items-center justify-center md:justify-start gap-1 md:gap-4 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl text-zinc-500 hover:text-white md:hover:bg-white/5 font-semibold transition-all md:border-r-4 border-transparent";
            }
        });

        if (mode === 'favorites') loadFavoritesView();
        else if (mode === 'history') loadHistoryView();
        else if (mode === 'tvGuide') loadTvGuideView();
        else if (mode === 'catchup') loadCatchupView();
        else loadCategoriesView();
        
        globalSearch.value = ''; // Reset search on nav
        document.getElementById('heroBannerContainer').classList.add('hidden');
    }

    function extractTime(ms) {
        if(!ms) return '';
        const date = new Date(ms);
        return date.toLocaleDateString('he-IL') + " " + date.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
    }

    function loadFavoritesView() {
        btnBackToCat.classList.add('hidden');
        hubTitle.innerHTML = `<span class="material-symbols-outlined text-rose-400 text-4xl">favorite</span> My Favorites`;
        renderGroupedStreams(favoritesList, "You don't have any favorite items yet.");
    }

    // ==========================================
    // CATCHUP SYSTEM
    // ==========================================
    async function loadCatchupView() {
        btnBackToCat.classList.add('hidden');
        hubTitle.innerHTML = `<span class="material-symbols-outlined text-primary text-4xl">update</span> Catchup TV (Timeshift)`;
        showGridLoader('Scanning Live Channels for Catchup support...');

        if (!cache['live_flat_all']) {
            try {
                const url = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=get_live_streams`;
                const res = await fetch(`/proxy.api?url=${encodeURIComponent(url)}`);
                cache['live_flat_all'] = await res.json();
            } catch (e) {
                gridContainer.innerHTML = `<div class="col-span-full text-zinc-500 text-center">Failed to fetch Live library</div>`;
                return;
            }
        }

        const catchups = (cache['live_flat_all'] || []).filter(s => s.tv_archive == 1 || s.tv_archive === "1");
        
        gridContainer.innerHTML = '';
        if(catchups.length === 0) {
            gridContainer.innerHTML = `<div class="col-span-full text-zinc-500 text-center font-bold p-10">Your provider does not support any Catchup channels.</div>`;
            return;
        }

        catchups.forEach(stream => {
            const card = createStreamCard(stream, 'live', false);
            // Override play behavior to open Programs List
            card.onclick = () => openCatchupChannel(stream);
            gridContainer.appendChild(card);
        });
    }

    async function openCatchupChannel(stream) {
        btnBackToCat.classList.remove('hidden'); // allow going back to Catchup grid
        hubTitle.innerHTML = `<span class="material-symbols-outlined text-primary text-4xl">inventory_2</span> Archive: ${stream.name}`;
        showGridLoader(`Fetching past broadcasts for ${stream.name}...`);

        const url = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=get_simple_data_table&stream_id=${stream.stream_id || stream.id}`;
        try {
            const res = await fetch(`/proxy.api?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            
            gridContainer.innerHTML = '';
            
            const epg = data && data.epg_listings ? data.epg_listings : [];
            const nowTime = new Date(); // To only show PAST broadcasts
            const pastPrograms = epg.filter(p => p.has_archive == 1 || p.has_archive === "1");
            
            if(pastPrograms.length === 0) {
                gridContainer.innerHTML = `<div class="col-span-full text-zinc-500 text-center p-10 font-bold">No 7-Day archive available for this channel.</div>`;
                return;
            }

            // Create Program List instead of grid cards
            const listContainer = document.createElement('div');
            listContainer.className = "col-span-full w-full flex flex-col gap-3 max-w-4xl mx-auto";

            pastPrograms.reverse().forEach(prog => { // Newest first
                const b64DecodedName = prog.title ? decodeURIComponent(escape(atob(prog.title))).replace(/\+/g, ' ') : "Unknown Program";
                const b64DecodedDesc = prog.description ? decodeURIComponent(escape(atob(prog.description))).replace(/\+/g, ' ') : "";
                
                const startStr = prog.start; // usually "2023-10-05 14:00:00"
                const dateObj = new Date(startStr);
                const isPast = dateObj < nowTime;
                
                const progBtn = document.createElement('div');
                progBtn.className = `bg-surface-container rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between border border-white/5 hover:border-primary/50 cursor-pointer hover:bg-surface-container-high transition-colors ${!isPast ? 'opacity-50 pointer-events-none' : ''}`;
                
                progBtn.innerHTML = `
                    <div class="flex flex-col w-full text-left flex-1">
                        <span class="text-xs text-primary font-bold tracking-widest uppercase mb-1">${startStr}</span>
                        <h4 class="text-white font-bold text-lg leading-tight">${b64DecodedName}</h4>
                        <p class="text-zinc-500 text-sm line-clamp-2 mt-1 w-full max-w-2xl">${b64DecodedDesc}</p>
                    </div>
                    <button class="bg-white/10 text-white hover:bg-primary hover:text-black px-6 py-2 rounded-full font-bold whitespace-nowrap transition-colors flex items-center gap-2 shrink-0">
                        <span class="material-symbols-outlined">history</span> Play Archive
                    </button>
                `;
                
                progBtn.onclick = () => {
                    playTimeshift(stream, startStr, prog.end);
                };
                listContainer.appendChild(progBtn);
            });
            
            gridContainer.appendChild(listContainer);
            
        } catch(e) {
            gridContainer.innerHTML = `<div class="col-span-full text-error text-center p-10 font-bold">Broadcast error: ${e.message}</div>`;
        }
    }

    function playTimeshift(stream, startTimestamp, endTimestamp) {
        // startTimestamp is format: "2023-11-20 18:00:00"
        // We calculate duration in minutes
        const start = new Date(startTimestamp);
        const end = new Date(endTimestamp);
        const durationMins = Math.round((end - start) / 60000);
        
        // M3U8 Timeshift standard routing
        // URL Format: /timeshift/U/P/DURATION/YYYY-MM-DD:HH-mm/STREAMID.m3u8
        
        const yr = start.getFullYear();
        const mo = String(start.getMonth() + 1).padStart(2, '0');
        const da = String(start.getDate()).padStart(2, '0');
        const hr = String(start.getHours()).padStart(2, '0');
        const mi = String(start.getMinutes()).padStart(2, '0');
        const formattedStart = `${yr}-${mo}-${da}:${hr}-${mi}`;
        
        // Use the native M3U8 output to stream it
        const tsUrl = `${credentials.server}/timeshift/${credentials.username}/${credentials.password}/${durationMins}/${formattedStart}/${stream.stream_id || stream.id}.m3u8`;
        
        // Use the unified Player function but pass the forced Catchup URL explicitly!
        // Wait, playVideoFile computes the URL dynamically. We need to pass the override URL.
        // Let's modify playVideoFile below to accept a third argument.
        playVideoFile(stream, 'catchup', tsUrl);
    }
    // ==========================================

    function loadHistoryView() {
        btnBackToCat.classList.add('hidden');
        hubTitle.innerHTML = `<span class="material-symbols-outlined text-amber-500 text-4xl">history</span> Recently Watched`;
        renderGroupedStreams(historyList, "You haven't watched anything yet. Start playing movies and channels to build your history!");
    }

    function renderGroupedStreams(list, emptyMessage) {
        gridContainer.innerHTML = '';
        
        // Add Clear History button if we are viewing the History mode and it has items!
        if(currentMode === 'history' && list.length > 0) {
            const clearBtn = document.createElement('button');
            clearBtn.className = "col-span-full mb-6 px-6 py-3 bg-red-500/10 text-red-500 font-bold rounded-xl border border-red-500/30 hover:bg-red-500/80 border-dashed hover:text-white transition-all flex items-center justify-center gap-2 w-max shadow-lg";
            clearBtn.innerHTML = '<span class="material-symbols-outlined pb-1">delete_sweep</span> Clear Watch History';
            clearBtn.onclick = () => {
                if(confirm('Are you absolutely sure you want to clear your entire watch history?')) {
                    historyList = [];
                    localStorage.removeItem('xtream_history');
                    loadHistoryView();
                }
            };
            gridContainer.appendChild(clearBtn);
        }

        if(list.length === 0) {
            gridContainer.innerHTML = `<div class="col-span-full pt-10 text-zinc-500 text-center font-medium">${emptyMessage}</div>`;
            return;
        }

        // Group by original mode
        const live = list.filter(item => item._originalMode === 'live');
        const vod = list.filter(item => item._originalMode === 'vod');
        const series = list.filter(item => item._originalMode === 'series' || item._originalMode === 'series_episode');

        // Helper render sections
        if(live.length > 0) appendSectionHeader("Live Channels");
        live.forEach(item => gridContainer.appendChild(createStreamCard(item, 'live', true)));
        
        if(vod.length > 0) appendSectionHeader("Movies");
        vod.forEach(item => gridContainer.appendChild(createStreamCard(item, 'vod', true)));
        
        if(series.length > 0) appendSectionHeader("Series & Episodes");
        series.forEach(item => gridContainer.appendChild(createStreamCard(item, 'series_episode', true)));
    }

    function appendSectionHeader(title) {
        const hdr = document.createElement('div');
        hdr.className = "col-span-full mt-6 mb-2 border-b border-white/5 pb-2 font-bold text-lg text-primary/80 w-full text-left";
        hdr.textContent = title;
        gridContainer.appendChild(hdr);
    }

    // Helper: Show Loader in Grid
    function showGridLoader(text) {
        gridContainer.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center p-20 text-primary opacity-60">
            <span class="material-symbols-outlined text-6xl animate-spin mb-4 scale-x-[-1]">autorenew</span>
            <p class="font-bold text-lg tracking-widest">${text}</p>
        </div>`;
    }

    // LEVEL 1: Render Category Boxes
    async function loadCategoriesView() {
        btnBackToCat.classList.add('hidden'); // We are at top level
        
        // Set Titles
        let modeTitle = currentMode === 'live' ? 'Live TV' : (currentMode === 'vod' ? 'Movies VOD' : 'TV Series');
        let iconName = currentMode === 'live' ? 'live_tv' : (currentMode === 'vod' ? 'movie' : 'theaters');
        
        hubTitle.innerHTML = `<span class="material-symbols-outlined text-primary text-4xl">${iconName}</span> Categories - ${modeTitle}`;

        if (cache[`${currentMode}_categories`].length > 0) {
            renderCategoriesGrid(cache[`${currentMode}_categories`]);
            return;
        }

        showGridLoader('Fetching categories from server...');

        const url = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=get_${currentMode}_categories`;
        
        try {
            const res = await fetch(`/proxy.api?url=${encodeURIComponent(url)}`);
            const cats = await res.json();
            // Filter empty or undefined generally if API is gross
            const validCats = cats.filter(c => c && c.category_name);
            cache[`${currentMode}_categories`] = validCats;
            renderCategoriesGrid(validCats);
        } catch (err) {
            gridContainer.innerHTML = `<div class="col-span-full text-error font-bold p-10 text-center">Error loading categories: ${err.message}</div>`;
        }
    }

    function renderCategoriesGrid(categories) {
        gridContainer.innerHTML = '';
        document.getElementById('heroBannerContainer').classList.add('hidden');
        
        if(categories.length === 0) {
            gridContainer.innerHTML = `<div class="col-span-full text-zinc-500 text-center">No categories available.</div>`;
            return;
        }

        categories.forEach(cat => {
            const box = document.createElement('div');
            // Realistic styling UI (Stremio/Netflix style dark unified cards):
            // We use surface-container with a sleek hover border rather than garish glowing gradients.
            box.className = "group relative w-full aspect-video rounded-2xl overflow-hidden bg-surface-container hover:bg-surface-container-high border border-white/5 hover:border-white/20 shadow-md cursor-pointer transition-all duration-300 transform hover:-translate-y-1 flex flex-col items-center justify-center p-4 text-center ring-inset ring-1 ring-white/0 hover:ring-white/10";
            
            box.innerHTML = `
                <!-- Darkened Underlay Pattern -->
                <div class="absolute inset-0 opacity-10 group-hover:opacity-30 transition-opacity bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-700 to-transparent"></div>
                
                <!-- Netflix Style Folder Icon -->
                <div class="mb-3 text-zinc-500 group-hover:text-primary transition-colors duration-300 transform group-hover:scale-110 drop-shadow flex items-center justify-center bg-black/20 group-hover:bg-primary/10 rounded-full h-14 w-14 z-10 border border-white/5">
                    <span class="material-symbols-outlined text-3xl">folder_shared</span>
                </div>
                
                <!-- Category Text -->
                <h3 class="font-headline font-bold text-zinc-300 group-hover:text-white text-[15px] md:text-lg z-20 leading-tight line-clamp-2 md:px-2 drop-shadow-md pb-1">${cat.category_name}</h3>
                
                <div class="absolute bottom-0 inset-x-0 h-1 bg-primary transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
            `;
            
            box.onclick = () => loadStreamsView(cat.category_id, cat.category_name);
            gridContainer.appendChild(box);
        });
    }

    // LEVEL 2: Render Streams / VODs / Series inside the Category
    async function loadStreamsView(catId, catName) {
        currentCategoryId = catId;
        currentCategoryName = catName;
        btnBackToCat.classList.remove('hidden'); // We are deep in a category
        
        let iconName = currentMode === 'live' ? 'live_tv' : (currentMode === 'vod' ? 'movie' : 'theaters');
        hubTitle.innerHTML = `<span class="material-symbols-outlined text-primary text-4xl">${iconName}</span> ${catName}`;
        
        const cacheKey = `${currentMode}_streams`;
        if (cache[cacheKey][catId]) {
            renderStreamsGrid(cache[cacheKey][catId]);
            return;
        }

        showGridLoader(`Fetching content for ${catName}...`);

        let action = `get_${currentMode}_streams`;
        if (currentMode === 'series') action = `get_series`; // the API mapping for series is annoying

        const url = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=${action}&category_id=${catId}`;
        
        try {
            const res = await fetch(`/proxy.api?url=${encodeURIComponent(url)}`);
            const streams = await res.json();
            cache[cacheKey][catId] = streams;
            renderStreamsGrid(streams);
        } catch (err) {
            gridContainer.innerHTML = `<div class="col-span-full text-error font-bold p-10 text-center">Error loading streams: ${err.message}</div>`;
        }
    }

    function renderStreamsGrid(originalStreams, isSearchHit = false) {
        gridContainer.innerHTML = '';
        const heroContainer = document.getElementById('heroBannerContainer');
        
        if(!originalStreams || originalStreams.length === 0) {
            heroContainer.classList.add('hidden');
            gridContainer.innerHTML = `<div class="col-span-full text-zinc-500 text-center">No items found in this category.</div>`;
            return;
        }

        let streamsToRender = [...originalStreams];

        // TRUE NETFLIX HERO BANNER LOGIC
        if ((currentMode === 'vod' || currentMode === 'series') && streamsToRender.length > 0 && !isSearchHit) {
            const hero = streamsToRender[0];
            const logoUrl = hero.stream_icon || hero.cover || "";
            // Only show hero if there is a cover image available
            if (logoUrl) {
                heroContainer.classList.remove('hidden');
                const cleanName = hero.name || hero.title;
                
                heroContainer.innerHTML = `
                    <div class="relative w-full min-h-[40vh] md:aspect-[21/9] bg-surface-container overflow-hidden rounded-3xl shadow-2xl flex items-center mb-8 border border-white/5 group">
                        <!-- Right aligned giant backdrop image -->
                        <div class="absolute right-0 top-0 h-full w-full md:w-3/4 opacity-40 md:opacity-100 z-0">
                            <img src="${logoUrl}" class="w-full h-full object-cover object-top filter group-hover:scale-105 transition-transform duration-1000 ease-in-[cubic-bezier(0.2,1,0.2,1)]" onerror="this.style.display='none'">
                            <div class="absolute inset-0 bg-gradient-to-r from-background via-background/80 md:via-background/40 to-transparent"></div>
                            <div class="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
                        </div>
                        
                        <div class="relative z-10 w-full md:w-2/3 p-8 md:p-14 md:pl-16 flex flex-col justify-center h-full">
                            <span class="text-primary font-bold tracking-[0.2em] text-xs md:text-sm uppercase mb-2">Featured ${currentMode === 'vod' ? 'Movie' : 'Series'}</span>
                            <h2 class="text-3xl md:text-6xl font-black font-headline text-white mb-4 drop-shadow-lg leading-tight line-clamp-3">${cleanName}</h2>
                            <p class="text-zinc-400 text-sm md:text-base max-w-xl line-clamp-2 md:line-clamp-3 mb-8 leading-relaxed font-medium">Experience cinema like never before. Dive into amazing storylines and visual masterpieces.</p>
                            
                            <div class="flex items-center gap-4">
                                <button id="btnHeroPlay" class="bg-white text-black hover:bg-zinc-200 transition-colors px-6 md:px-8 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 text-sm md:text-base">
                                    <span class="material-symbols-outlined text-2xl" style="font-variation-settings: 'FILL' 1;">play_arrow</span> Play
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                document.getElementById('btnHeroPlay').onclick = () => openStreamOrSeries(hero);
                streamsToRender.shift(); // Remove the hero from the grid below
            } else {
                heroContainer.classList.add('hidden');
            }
        } else {
            heroContainer.classList.add('hidden');
        }

        streamsToRender.forEach(stream => {
            // Because createStreamCard handles formatting to DOM!
            const card = createStreamCard(stream, currentMode, false);
            gridContainer.appendChild(card);
        });
    }

    // Abstraction so we can reuse a pure stream card logic across grid and Favorites
    function createStreamCard(stream, overrideModeType = false, showDate = false) {
        const card = document.createElement('div');
        const internalMode = overrideModeType || currentMode;
        card.className = "group relative cursor-pointer flex flex-col gap-2 w-full";
            
        // "stream_icon" for Live/VOD, "cover" for series
        const logoUrl = stream.stream_icon || stream.cover || (stream.info && stream.info.movie_image) || "";
        const fallbackIcon = internalMode === 'live' ? 'live_tv' : (internalMode === 'vod' ? 'movie' : 'theaters');
        const cleanName = stream.name || stream.title;
        const uniqueId = String(stream.stream_id || stream.id);
        const isFav = favoritesList.some(f => String(f.stream_id || f.id) === uniqueId);
        
        // Individual History Delete Button
        let historyDeleteBtn = '';
        if (currentMode === 'history' || currentMode === 'catchup') {
            if (currentMode === 'history') {
                historyDeleteBtn = `<button class="btnRmvHist absolute top-2 right-2 z-20 bg-black/80 hover:bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all border border-white/10 shadow hover:scale-110 flex items-center justify-center" aria-label="Remove from history" title="Remove from history">
                    <span class="material-symbols-outlined text-sm">close</span>
                </button>`;
            }
        }
        
        // TRUE NETFLIX ARCHITECTURE: Posters vs Horizontal Video cards
        const isPoster = (internalMode === 'vod' || internalMode === 'series' || internalMode === 'series_episode');
        const ratioClass = isPoster ? "aspect-[2/3]" : "aspect-video"; 
        
        card.innerHTML = `
            ${historyDeleteBtn}
            <div class="relative w-full ${ratioClass} rounded-2xl overflow-hidden bg-surface-container border border-white/5 hover:border-zinc-500 shadow-md transition-all duration-300 ease-out flex items-center justify-center -z-0">
                
                <div class="absolute inset-0 flex flex-col items-center justify-center opacity-40 group-hover:opacity-70 transition-opacity -z-10">
                    <span class="material-symbols-outlined text-4xl text-primary/50 drop-shadow-md" style="font-variation-settings: 'FILL' 1;">${fallbackIcon}</span>
                </div>
                
                <img src="${logoUrl}" 
                     class="absolute inset-0 w-full h-full ${isPoster ? 'object-cover' : 'object-contain'} z-10 transition-all duration-300 opacity-90 group-hover:opacity-100 group-hover:scale-105" 
                     onerror="this.classList.add('opacity-0', 'scale-90'); this.classList.remove('group-hover:scale-105');">
                
                <!-- Solid Dark Overlay for icons -->
                <div class="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20"></div>

                <button class="favorite-btn absolute top-2 right-2 z-40 ${isFav ? 'text-rose-500' : 'text-white/50 hover:text-white'} transition-colors transform hover:scale-110 opacity-0 group-hover:opacity-100 bg-black/20 p-1.5 rounded-full backdrop-blur-sm">
                    <span class="material-symbols-outlined text-2xl drop-shadow-md" style="font-variation-settings: 'FILL' ${isFav ? 1 : 0};">${isFav ? 'favorite' : 'favorite_border'}</span>
                </button>

                <div class="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-30 pointer-events-none">
                    <div class="bg-primary/20 p-2.5 rounded-full backdrop-blur-md flex items-center justify-center border border-primary/50 text-white shadow-[0_0_15px_rgba(45,212,191,0.5)] transform scale-75 group-hover:scale-100 transition-transform">
                        <span class="material-symbols-outlined text-[40px] pl-1" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                    </div>
                </div>
            </div>
            
            <div class="flex flex-col mt-1">
                <h4 class="font-bold text-zinc-200 group-hover:text-primary transition-colors text-left line-clamp-2 px-1 text-[13px] md:text-[14px] leading-snug" dir="auto">
                    ${cleanName}
                </h4>
                ${showDate && stream._watchedAt ? `<span class="text-[10px] text-zinc-500 text-left px-1 mt-0.5">${extractTime(stream._watchedAt)}</span>` : ''}
            </div>
        `;
        
        card.onclick = () => openStreamOrSeries(stream);
        card.querySelector('.favorite-btn').onclick = (e) => toggleFavorite(stream, e);
        
        return card;
    }

    // TRUE TV GUIDE (Now & Next Horizontal Timeline)
    async function loadTvGuideView() {
        btnBackToCat.classList.add('hidden');
        document.getElementById('heroBannerContainer').classList.add('hidden');
        hubTitle.innerHTML = `<span class="material-symbols-outlined text-primary text-4xl">calendar_month</span> TV Guide`;
        
        if (cache['live_categories'].length === 0) {
            showGridLoader('Fetching Live TV architecture...');
            const url = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=get_live_categories`;
            try {
                const res = await fetch(`/proxy.api?url=${encodeURIComponent(url)}`);
                const cats = await res.json();
                cache['live_categories'] = cats.filter(c => c && c.category_name);
            } catch(e) {
                gridContainer.innerHTML = `<div class="col-span-full text-error font-bold p-10 text-center">Error: ${e.message}</div>`;
                return;
            }
        }
        
        const guideCats = cache['live_categories'];
        if(guideCats.length === 0) {
            gridContainer.innerHTML = `<div class="col-span-full text-zinc-500 text-center">No TV Networks Found.</div>`;
            return;
        }

        // We build a special UI: A Category Selector, and a massive list of channels with horizontal EPG
        gridContainer.innerHTML = '';
        
        const headerTools = document.createElement('div');
        headerTools.className = "col-span-full w-full flex flex-col md:flex-row gap-4 mb-6 justify-between items-center bg-surface-container p-4 rounded-2xl border border-white/5 shadow-lg";
        headerTools.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-zinc-400">filter_list</span>
                <span class="text-white font-bold">Select Network:</span>
            </div>
            <select id="guideCatSelect" class="bg-black/50 border border-white/10 text-white rounded-xl px-4 py-2 outline-none focus:border-primary/50 cursor-pointer w-full md:w-auto min-w-[200px]">
                ${guideCats.map(c => `<option value="${c.category_id}">${c.category_name}</option>`).join('')}
            </select>
        `;
        gridContainer.appendChild(headerTools);

        const listContainer = document.createElement('div');
        listContainer.className = "col-span-full w-full flex flex-col gap-4 pb-20";
        gridContainer.appendChild(listContainer);

        async function renderGuideCategory(catId) {
            listContainer.innerHTML = `<div class="text-center p-10 w-full text-primary animate-pulse font-bold tracking-widest"><span class="material-symbols-outlined animate-spin text-4xl mb-2">sync</span><br>Loading Timeline Matrix...</div>`;
            
            // Get Streams for this cat
            if(!cache['live_streams'][catId]) {
                const url = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=get_live_streams&category_id=${catId}`;
                try {
                    const res = await fetch(`/proxy.api?url=${encodeURIComponent(url)}`);
                    cache['live_streams'][catId] = await res.json();
                } catch(e) {
                    listContainer.innerHTML = `<div class="text-error">Failed to fetch streams.</div>`; return;
                }
            }
            
            const streams = cache['live_streams'][catId] || [];
            listContainer.innerHTML = '';
            
            if(streams.length === 0) {
                listContainer.innerHTML = `<div class="text-zinc-500 text-center">No channels in this network.</div>`;
                return;
            }

            // Render limit to avoid crashing browser with massive DOM
            const limitStreams = streams.slice(0, 30);
            
            for(const channel of limitStreams) {
                const row = document.createElement('div');
                row.className = "bg-surface-container rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-stretch border border-white/5 shadow-md hover:border-white/10 transition-colors w-full";
                
                const logo = channel.stream_icon ? `<img src="${channel.stream_icon}" class="w-16 h-16 object-contain" onerror="this.outerHTML='<span class=\\'material-symbols-outlined text-zinc-500 text-3xl\\'>live_tv</span>'"/>` : `<span class="material-symbols-outlined text-zinc-500 text-3xl">live_tv</span>`;
                
                row.innerHTML = `
                    <div class="flex items-center gap-4 w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-white/10 pb-4 md:pb-0 pr-0 md:pr-4 cursor-pointer group" onclick="document.getElementById('play_${channel.stream_id}').click()">
                        <div class="bg-black/40 p-2 rounded-xl flex-shrink-0 w-20 h-20 flex items-center justify-center border border-white/5 group-hover:border-primary/50 transition-colors">${logo}</div>
                        <div class="overflow-hidden">
                            <h3 class="text-white font-bold text-md truncate group-hover:text-primary transition-colors">${channel.name}</h3>
                            <button id="play_${channel.stream_id}" class="mt-2 text-[11px] font-bold bg-white/10 hover:bg-white text-white hover:text-black transition-colors px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 w-fit"><span class="material-symbols-outlined text-sm">play_arrow</span> Tune In</button>
                        </div>
                    </div>
                    <!-- EPG Timeline Scroll Container -->
                    <div class="flex-1 overflow-x-auto hide-scrollbar flex items-center gap-3 relative" id="epg_scroll_${channel.stream_id}">
                        <div class="text-zinc-600 text-sm italic py-4 animate-pulse">Loading schedule...</div>
                    </div>
                `;
                
                // Play behavior
                row.querySelector(`#play_${channel.stream_id}`).onclick = (e) => {
                    e.stopPropagation();
                    playVideoFile(channel, 'live');
                };
                
                listContainer.appendChild(row);
                
                // Fetch EPG for this row asynchronously
                fetch(`/proxy.api?url=${encodeURIComponent(credentials.server + '/player_api.php?username=' + credentials.username + '&password=' + credentials.password + '&action=get_short_epg&stream_id=' + channel.stream_id)}`)
                .then(r => r.json())
                .then(epgData => {
                    const scrollBox = document.getElementById(`epg_scroll_${channel.stream_id}`);
                    if(!scrollBox) return;
                    
                    const listings = epgData.epg_listings || [];
                    if(listings.length === 0) {
                        scrollBox.innerHTML = `<div class="text-zinc-500 text-sm px-4">Schedule unavailable</div>`;
                        return;
                    }
                    
                    scrollBox.innerHTML = '';
                    const now = new Date();
                    
                    listings.forEach((prog, index) => {
                        // Decode b64
                        let title = prog.title;
                        try{ title = decodeURIComponent(escape(atob(title))).replace(/\+/g, ' '); } catch(e){}
                        
                        // Parse time strings (e.g., "2023-10-05 14:00:00")
                        const startTime = new Date(prog.start);
                        const endTime = new Date(prog.end);
                        const isNow = now >= startTime && now <= endTime;
                        const isPast = now > endTime;
                        
                        const timeStr = startTime.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit', hour12: false});
                        
                        const progCard = document.createElement('div');
                        // Styling: Now Playing gets a glowing primary border
                        let styleClass = isNow ? 'border-primary/60 bg-primary/10' : (isPast ? 'border-white/5 opacity-50 bg-black/20' : 'border-white/10 bg-black/40 hover:bg-black/60');
                        
                        progCard.className = `flex flex-col justify-center min-w-[200px] max-w-[280px] h-full rounded-xl p-3 border ${styleClass} transition-colors gap-1 shrink-0`;
                        
                        progCard.innerHTML = `
                            <div class="flex justify-between items-center text-[10px] font-bold tracking-widest uppercase">
                                <span class="${isNow ? 'text-primary' : 'text-zinc-500'}">${timeStr}</span>
                                ${isNow ? '<span class="bg-primary text-black px-1.5 rounded text-[9px] animate-pulse">NOW</span>' : ''}
                            </div>
                            <h4 class="${isNow ? 'text-white' : 'text-zinc-300'} font-bold text-sm line-clamp-2 leading-tight">${title}</h4>
                        `;
                        scrollBox.appendChild(progCard);
                    });
                }).catch(() => {
                    const scrollBox = document.getElementById(`epg_scroll_${channel.stream_id}`);
                    if(scrollBox) scrollBox.innerHTML = `<div class="text-zinc-500 text-sm px-4">Failed to load schedule</div>`;
                });
            }
        }

        const selector = document.getElementById('guideCatSelect');
        selector.onchange = (e) => renderGuideCategory(e.target.value);
        
        // Render Initial target
        if(guideCats.length > 0) {
            selector.value = guideCats[0].category_id;
            renderGuideCategory(guideCats[0].category_id);
        }
    }

    // SEARCH IMPLEMENTATION WITH GLOBAL FLAT SEARCH
    let searchDebounce;
    globalSearch.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        const query = e.target.value.trim().toLowerCase();
        
        if (currentMode === 'favorites' || currentMode === 'history') {
            const list = currentMode === 'favorites' ? favoritesList : historyList;
            if (!query) return renderGroupedStreams(list, "No items found.");
            const filtered = list.filter(item => {
                const name = (item.name || item.title || '').toLowerCase();
                return name.includes(query);
            });
            renderGroupedStreams(filtered, "No search results match.");
            return;
        }

        if (currentMode === 'tvGuide') {
            const list = cache['live_categories'] || [];
            if (!query) { loadTvGuideView(); return; }
            gridContainer.innerHTML = '';
            const tvContainer = document.createElement('div');
            tvContainer.className = "col-span-full w-full flex flex-col gap-4 max-w-5xl mx-auto";
            list.filter(c => c.category_name.toLowerCase().includes(query)).forEach(cat => {
                // (Using same render block as tvGuide list)
                const row = document.createElement('div');
                row.className = "bg-surface-container rounded-2xl p-4 md:p-6 flex flex-col md:flex-row items-center gap-4 justify-between border border-white/5 shadow cursor-pointer hover:bg-surface-container-high transition-colors hover:border-white/20";
                row.innerHTML = `
                    <div class="flex items-center gap-4 md:gap-6 w-full md:w-auto">
                        <div class="bg-black/40 p-2 rounded-xl flex-shrink-0 w-16 h-16 flex items-center justify-center border border-white/5"><span class="material-symbols-outlined text-3xl text-zinc-400">live_tv</span></div>
                        <div class="text-left w-full"><h3 class="text-white font-bold text-xl md:text-2xl">${cat.category_name}</h3></div>
                    </div>
                `;
                row.onclick = () => { setAppMode('live'); loadStreamsView(cat.category_id, cat.category_name); };
                tvContainer.appendChild(row);
            });
            gridContainer.appendChild(tvContainer);
            return;
        }

        searchDebounce = setTimeout(async () => {
            if (currentCategoryId === null) {
                // TRUE GLOBAL SEARCH: Fetch everything dynamically
                if (!query) {
                    document.getElementById('globalSearchLoader').classList.add('hidden');
                    return renderCategoriesGrid(cache[`${currentMode}_categories`]);
                }

                document.getElementById('globalSearchLoader').classList.remove('hidden');
                document.getElementById('heroBannerContainer').classList.add('hidden');
                
                const flatCacheKey = `${currentMode}_flat_all`;
                if (!cache[flatCacheKey]) {
                    let action = `get_${currentMode}_streams`;
                    if (currentMode === 'series') action = `get_series`;
                    const url = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=${action}`;
                    try {
                        const res = await fetch(`/proxy.api?url=${encodeURIComponent(url)}`);
                        cache[flatCacheKey] = await res.json();
                    } catch (e) {
                        document.getElementById('globalSearchLoader').classList.add('hidden');
                        return;
                    }
                }
                
                document.getElementById('globalSearchLoader').classList.add('hidden');
                
                const allList = cache[flatCacheKey] || [];
                const filtered = allList.filter(item => {
                    const name = (item.name || item.title || '').toLowerCase();
                    return name.includes(query);
                });
                
                // Show flat exact search output
                hubTitle.innerHTML = `<span class="material-symbols-outlined text-primary text-4xl">search</span> Global Search (${filtered.length})`;
                renderStreamsGrid(filtered, true);

            } else {
                // Local deep category search
                const allStreams = cache[`${currentMode}_streams`][currentCategoryId] || [];
                if (!query) return renderStreamsGrid(allStreams);
                const filtered = allStreams.filter(strm => {
                    const name = (strm.name || strm.title || '').toLowerCase();
                    return name.includes(query);
                });
                renderStreamsGrid(filtered, true);
            }
        }, 300); // 300ms debounce
    });

    // Back Button Logic
    btnBackToCat.addEventListener('click', () => {
        if (currentMode === 'favorites') return;
        loadCategoriesView();
    });

    // OPEN PLAYER / DRILL DOWN SERIES EPISODES
    async function openStreamOrSeries(item) {
        
        // Handle Favorite mapping logic
        let effectiveMode = currentMode;
        if (effectiveMode === 'favorites') {
            effectiveMode = item._originalMode || 'live';
        } else if (effectiveMode === 'history') {
            effectiveMode = item._originalMode || 'live';
        }

        if (effectiveMode === 'series') {
            const seriesCover = item.cover || item.stream_icon;
            await loadEpisodesGrid(item.series_id || item.id, item.name, seriesCover);
            return;
        }

        playVideoFile(item, effectiveMode);
    }

    async function loadEpisodesGrid(seriesId, seriesName, seriesCover) {
        document.getElementById('heroBannerContainer').classList.add('hidden'); // Fix UI bug where previous banner remains
        hubTitle.innerHTML = `<span class="material-symbols-outlined text-primary">theaters</span> Seasons - ${seriesName}`;
        showGridLoader('Loading episodes from server...');
        
        const url = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=get_series_info&series_id=${seriesId}`;
        try {
            const res = await fetch(`/proxy.api?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            
            gridContainer.innerHTML = '';
            
            if (!data.episodes || Object.keys(data.episodes).length === 0) {
                gridContainer.innerHTML = `<div class="col-span-full text-zinc-500 text-center font-bold p-10">No episodes available for this series</div>`; 
                return;
            }

            const seasonNumbers = Object.keys(data.episodes).sort((a,b) => parseInt(a)-parseInt(b));

            // Create Header for Season Selection
            const headerTools = document.createElement('div');
            headerTools.className = "col-span-full w-full flex flex-col md:flex-row gap-4 mb-6 justify-between items-center bg-surface-container p-4 rounded-2xl border border-white/5 shadow-lg";
            headerTools.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-zinc-400">filter_list</span>
                    <span class="text-white font-bold">Select Season:</span>
                </div>
                <select id="seasonSelect" class="bg-black/50 border border-white/10 text-white rounded-xl px-4 py-2 outline-none focus:border-primary/50 cursor-pointer w-full md:w-auto min-w-[200px] text-lg font-bold">
                    ${seasonNumbers.map(s => `<option value="${s}">Season ${s}</option>`).join('')}
                </select>
            `;
            gridContainer.appendChild(headerTools);

            // Create List Container for Episodes (Full Width, without max-w-5xl)
            const listContainer = document.createElement('div');
            listContainer.className = "col-span-full w-full flex flex-col gap-3 pb-12 mx-auto";
            gridContainer.appendChild(listContainer);

            function renderSeason(seasonNum) {
                listContainer.innerHTML = '';
                const eps = data.episodes[seasonNum] || [];
                
                if(eps.length === 0){
                    listContainer.innerHTML = `<div class="text-zinc-500 text-center p-10 font-bold">No episodes in this season</div>`;
                    return;
                }

                eps.forEach(ep => {
                    const row = document.createElement('div');
                    row.className = "bg-surface-container rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between border border-white/5 hover:border-primary/50 shadow cursor-pointer hover:bg-surface-container-high transition-colors w-full group";
                    
                    // Determine possible thumbnail
                    let coverImage = '';
                    if (ep.info && ep.info.movie_image) {
                        coverImage = ep.info.movie_image;
                    } else if (seriesCover) {
                        coverImage = seriesCover;
                    }
                    
                    // Attach the determined cover back to the object so pushToHistory saves it!
                    ep.stream_icon = coverImage;

                    let coverElement = '';
                    if (coverImage) {
                        coverElement = `<img src="${coverImage}" class="w-32 md:w-48 rounded-lg object-cover shadow-md aspect-video" onerror="this.outerHTML='<div class=\\'w-32 md:w-48 aspect-video bg-black/40 rounded-lg flex items-center justify-center border border-white/5 shadow-md\\'><span class=\\'material-symbols-outlined text-zinc-500 text-3xl\\'>theaters</span></div>'">`;
                    } else {
                        coverElement = `<div class="w-32 md:w-48 aspect-video bg-black/40 rounded-lg flex items-center justify-center border border-white/5 shadow-md"><span class="material-symbols-outlined text-zinc-500 text-3xl">theaters</span></div>`;
                    }

                    const plotDesc = (ep.info && ep.info.plot) ? `<p class="text-zinc-500 text-sm mt-1 line-clamp-2 md:line-clamp-3">${ep.info.plot}</p>` : '';
                    const duration = (ep.info && ep.info.duration) ? `<span class="bg-black/60 px-2 py-0.5 rounded text-[10px] tracking-wider font-mono">${ep.info.duration}</span>` : '';

                    row.innerHTML = `
                        <div class="flex items-start md:items-center gap-4 md:gap-6 w-full flex-1">
                            <div class="relative shrink-0 flex items-center justify-center">
                                ${coverElement}
                                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                                    <span class="material-symbols-outlined text-white text-4xl">play_circle</span>
                                </div>
                            </div>
                            <div class="flex flex-col text-left flex-1 justify-center py-1">
                                <div class="flex items-center gap-3 mb-1">
                                    <span class="text-primary font-bold text-xs tracking-widest uppercase">E${ep.episode_num}</span>
                                    ${duration}
                                </div>
                                <h3 class="text-white font-bold text-lg leading-tight group-hover:text-primary transition-colors" dir="ltr">${ep.title}</h3>
                                ${plotDesc}
                            </div>
                        </div>
                    `;
                    
                    row.onclick = () => playVideoFile(ep, 'series_episode');
                    listContainer.appendChild(row);
                });
            }

            // Hook Event and Render first available season
            const selector = document.getElementById('seasonSelect');
            selector.onchange = (e) => renderSeason(e.target.value);
            
            if(seasonNumbers.length > 0) {
                selector.value = seasonNumbers[0];
                renderSeason(seasonNumbers[0]);
            }

        } catch(e) {
            gridContainer.innerHTML = `<div class="col-span-full text-error text-center p-10 font-bold">Error loading episodes: ${e.message}</div>`;
        }
    }


    async function playVideoFile(item, modeType, overrideUrl = null) {
        currentPlayingStreamId = String(item.stream_id || item.id);
        currentPlayingMode = modeType;
        resumePromptOverlay.classList.add('hidden');
        
        // Push State for Player
        const urlStr = `/play/${modeType}/${currentPlayingStreamId}`;
        if (window.location.pathname !== urlStr) {
            window.history.pushState({ mode: 'play' }, "", urlStr);
        }

        hubView.classList.add('hidden');
        playerView.classList.remove('hidden');
        playerStreamTitle.textContent = item.name || item.title;
        playerLoading.classList.remove('hidden');
        playerStatusText.textContent = "Setting up stream, please wait...";
        
        
        // Push successful hits to History tracker
        pushToHistory(item);

        playerEpgContainer.classList.add('hidden');
        playerBadgeContainer.classList.remove('hidden');

        if (hls) { hls.destroy(); hls = null; }
        if (currentMpegtsPlayer) { currentMpegtsPlayer.destroy(); currentMpegtsPlayer = null; }

        if (modeType === 'live' || modeType === 'catchup') {
            playerBadge.classList.replace('bg-zinc-500', 'bg-error');
            playerBadge.classList.add('animate-pulse');
            playerBadgeText.textContent = modeType === 'catchup' ? "CATCHUP TV" : "LIVE STREAM";
            
            // Background Fetch EPG
            if ((item.stream_id || item.id) && modeType === 'live') {
                const epgUrl = `${credentials.server}/player_api.php?username=${credentials.username}&password=${credentials.password}&action=get_short_epg&stream_id=${item.stream_id || item.id}`;
                fetch(`/proxy.api?url=${encodeURIComponent(epgUrl)}`)
                    .then(r => r.json())
                    .then(epg => {
                        if(epg && epg.epg_listings && epg.epg_listings.length > 0) {
                            // Find the first showing (or currently ongoing)
                            let currentProg = epg.epg_listings[0].title;
                            // Clean base64 output if any issues, decode base64 if necessary
                            try{ currentProg = decodeURIComponent(escape(atob(currentProg))); } catch(e){}
                            playerEpgText.textContent = currentProg;
                            playerEpgContainer.classList.remove('hidden');
                            playerBadgeContainer.classList.add('hidden'); // Hide LIVE badge to save vertical space
                        }
                    }).catch(()=>{});
            }

            // URL Fallbacks
            let urlOptions = [];
            if (overrideUrl) {
                urlOptions.push({ type: 'hls', url: overrideUrl });
            } else {
                urlOptions = [
                    { type: 'hls', url: `${credentials.server}/live/${credentials.username}/${credentials.password}/${item.stream_id || item.id}.m3u8` },
                    { type: 'hls', url: `${credentials.server}/${credentials.username}/${credentials.password}/${item.stream_id || item.id}.m3u8` },
                    { type: 'ts', url: `${credentials.server}/live/${credentials.username}/${credentials.password}/${item.stream_id || item.id}.ts` }, 
                    { type: 'ts', url: `${credentials.server}/${credentials.username}/${credentials.password}/${item.stream_id || item.id}` }
                ];
            }

            let currentOptionIndex = 0;
            const initPlayer = () => {
                if (currentOptionIndex >= urlOptions.length) {
                    playerStatusText.textContent = "Fatal Error: Stream strictly inaccessible"; return;
                }
                let option = urlOptions[currentOptionIndex];
                playerStatusText.textContent = `Loading live stream (attempt ${currentOptionIndex + 1}/${urlOptions.length})...`;

                if (option.type === 'hls') {
                    let proxiedUrl = `/proxy.m3u8?url=${encodeURIComponent(option.url)}`;
                    if (Hls.isSupported()) {
                        hls = new Hls({ maxBufferSize: 20 * 1000 * 1000, startLevel: -1 });
                        hls.loadSource(proxiedUrl);
                        hls.attachMedia(videoElement);
                        hls.on(Hls.Events.MANIFEST_PARSED, () => {
                            playerLoading.classList.add('hidden');
                            videoElement.play().catch(() => playerStatusText.textContent = "Please press Play manually");
                        });
                        hls.on(Hls.Events.ERROR, (event, data) => {
                            if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                                currentOptionIndex++; initPlayer();
                            }
                        });
                    }
                } else if (option.type === 'ts') {
                    let streamProxyUrl = `/proxy.stream?url=${encodeURIComponent(option.url)}`;
                    if (mpegts.getFeatureList().mseLivePlayback) {
                        currentMpegtsPlayer = mpegts.createPlayer({ type: 'mse', isLive: true, url: streamProxyUrl });
                        currentMpegtsPlayer.attachMediaElement(videoElement);
                        currentMpegtsPlayer.load();
                        currentMpegtsPlayer.on(mpegts.Events.ERROR, () => { currentOptionIndex++; initPlayer(); });
                        videoElement.addEventListener('playing', () => playerLoading.classList.add('hidden'), { once: true });
                        currentMpegtsPlayer.play().catch(() => {});
                    } else {
                         currentOptionIndex++; initPlayer();
                    }
                }
            };
            initPlayer();
            
        } else {
            // VOD and Series are exact media files (.mp4/.mkv), we utilize native HTML5 video
            playerBadge.classList.replace('bg-error', 'bg-zinc-500');
            playerBadge.classList.remove('animate-pulse');
            playerBadgeText.textContent = modeType === 'vod' ? "VOD MOVIE" : "SERIES EPISODE";
            
            // Standard URL format for Xtream VODs/Series:
            const itemId = item.stream_id || item.id;
            const ext = item.container_extension || 'mp4';
            const actionType = modeType === 'vod' ? 'movie' : 'series';
            
            // Direct playback URL bypassing CORS proxy since we removed crossorigin from index.html video tag! 
            // The browser will directly request the MP4 from their server and allow seeking (Range requests) perfectly.
            const directUrl = `${credentials.server}/${actionType}/${credentials.username}/${credentials.password}/${itemId}.${ext}`;
            
            videoElement.src = directUrl;

            // Remove crossorigin strictly to avoid CORS failure on static files
            videoElement.removeAttribute('crossorigin');
            
            videoElement.addEventListener('canplay', () => {
                playerLoading.classList.add('hidden');
                
                // CHECK PROGRESS MEMORY
                const savedTime = playbackProgress[currentPlayingStreamId];
                if (savedTime && savedTime > 15) {
                    videoElement.pause();
                    
                    // Format time helper
                    const h = Math.floor(savedTime / 3600);
                    const m = Math.floor((savedTime % 3600) / 60);
                    const s = Math.floor(savedTime % 60);
                    const formattedTime = h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    
                    resumePromptText.innerHTML = `You left off at <span class="text-white font-mono font-bold">${formattedTime}</span>. Do you want to resume or start over?`;
                    resumePromptOverlay.classList.remove('hidden');
                    
                    btnPlayerResume.onclick = () => {
                        videoElement.currentTime = savedTime;
                        resumePromptOverlay.classList.add('hidden');
                        videoElement.play().catch(()=>{});
                    };
                    
                    btnPlayerRestart.onclick = () => {
                        videoElement.currentTime = 0;
                        resumePromptOverlay.classList.add('hidden');
                        videoElement.play().catch(()=>{});
                    };
                } else {
                    videoElement.play().catch(()=>{});
                }
            }, { once: true });
            
            videoElement.addEventListener('error', () => {
                playerStatusText.textContent = "Error scraping media file from server";
            }, { once: true });
        }
    }

    // CONTINUOUS PLAYBACK PROGRESS TRACKER
    videoElement.addEventListener('timeupdate', () => {
        if (!currentPlayingStreamId) return;
        // Only track for VOD and Series
        if (currentPlayingMode === 'vod' || currentPlayingMode === 'series_episode') {
            const time = videoElement.currentTime;
            // Only save if it's > 5 seconds, otherwise we don't care
            if (time > 5) {
                playbackProgress[currentPlayingStreamId] = time;
                localStorage.setItem('xtream_progress', JSON.stringify(playbackProgress));
            }
        }
    });

    function closePlayer() {
        if(hls) { hls.destroy(); hls = null; }
        if(currentMpegtsPlayer) { currentMpegtsPlayer.destroy(); currentMpegtsPlayer = null; }
        videoElement.src = "";
        videoElement.removeAttribute('src'); // Fully clear standard html5 buffers
        // Reapply CORS attribute in case we open a Live M3U8 next
        videoElement.setAttribute('crossorigin', 'anonymous');
        playerView.classList.add('hidden');
        
        // Hide Drawer if open
        playerChannelsDrawer.classList.replace('translate-x-0', 'translate-x-full');
        
        hubView.classList.remove('hidden');
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(()=>{});
        }

        // Pop state URL back to Hub View
        const urlMode = currentMode === 'tvGuide' ? 'tvguide' : currentMode;
        if(window.location.pathname !== `/${urlMode}`) {
            window.history.pushState({ mode: currentMode }, "", `/${urlMode}`);
        }
    }

    // SPA Browser Back/Forward Buttons handler
    window.addEventListener('popstate', (e) => {
        if (!credentials) return; // ignore if not logged in
        if (e.state && e.state.mode) {
            if (e.state.mode === 'play') {
                // If they pop forward into a player, we fallback to returning to the hub safely 
                // rather than trying to auto-play blindly.
                const fallbackMode = currentMode === 'tvGuide' ? 'tvguide' : currentMode;
                window.history.replaceState({ mode: fallbackMode }, "", `/${fallbackMode}`);
                closePlayer(); 
                setAppMode(currentMode);
            } else {
                closePlayer(); // ensure player is closed
                setAppMode(e.state.mode);
            }
        }
    });

    btnClosePlayer.addEventListener('click', closePlayer);

    // ============================================
    // PLAYER EPG CHANNELS DRAWER LOGIC
    // ============================================
    function populatePlayerDrawer() {
        if (!currentCategoryId || currentMode !== 'live') {
            btnToggleEpgDrawer.classList.add('hidden');
            return;
        }
        btnToggleEpgDrawer.classList.remove('hidden');
        const streams = cache[`live_streams`][currentCategoryId] || [];
        
        function renderList(filterQuery = '') {
            drawerChannelsList.innerHTML = '';
            const filtered = streams.filter(s => (s.name || '').toLowerCase().includes(filterQuery));
            if(filtered.length === 0) {
                drawerChannelsList.innerHTML = `<div class="p-4 text-center text-zinc-500">No channel found</div>`;
                return;
            }
            
            filtered.forEach(s => {
                const btn = document.createElement('button');
                btn.className = "flex items-center gap-3 w-full p-2 text-right hover:bg-white/10 rounded-lg transition-colors group";
                const isFav = favoritesList.some(f => String(f.stream_id || f.id) === String(s.stream_id || s.id));
                const logo = s.stream_icon ? `<img src="${s.stream_icon}" class="w-10 h-10 object-contain bg-black/50 rounded p-1" onerror="this.outerHTML='<div class=\\'w-10 h-10 flex items-center justify-center bg-black/50 rounded\\'><span class=\\'material-symbols-outlined text-zinc-500\\'>live_tv</span></div>'"/>` : `<div class="w-10 h-10 flex items-center justify-center bg-black/50 rounded"><span class="material-symbols-outlined text-zinc-500">live_tv</span></div>`;
                
                btn.innerHTML = `
                    ${logo}
                    <div class="flex-1 overflow-hidden">
                        <span class="block truncate text-white text-[13px] font-bold group-hover:text-primary transition-colors">${s.name}</span>
                    </div>
                `;
                btn.onclick = () => {
                    // Start new stream without closing player!
                    playVideoFile(s, 'live');
                    playerChannelsDrawer.classList.replace('translate-x-0', 'translate-x-full');
                };
                drawerChannelsList.appendChild(btn);
            });
        }
        
        renderList('');
        drawerSearch.value = '';
        drawerSearch.oninput = (e) => renderList(e.target.value.trim().toLowerCase());
    }

    btnToggleEpgDrawer.addEventListener('click', () => {
        populatePlayerDrawer();
        if(playerChannelsDrawer.classList.contains('translate-x-full')) {
            playerChannelsDrawer.classList.replace('translate-x-full', 'translate-x-0');
        } else {
            playerChannelsDrawer.classList.replace('translate-x-0', 'translate-x-full');
        }
    });

    btnCloseEpgDrawer.addEventListener('click', () => {
        playerChannelsDrawer.classList.replace('translate-x-0', 'translate-x-full');
    });

    // ============================================
    // CUSTOM PLAYER UI LOGIC
    // ============================================
    let hideHudTimeout;
    
    function resetHudTimer() {
        playerControlsContainer.style.opacity = '1';
        clearTimeout(hideHudTimeout);
        // Only auto-hide if playing
        if (!videoElement.paused) {
            hideHudTimeout = setTimeout(() => { 
                playerControlsContainer.style.opacity = '0'; 
            }, 3000);
        }
    }

    playerView.addEventListener('mousemove', resetHudTimer);
    playerView.addEventListener('click', resetHudTimer);
    
    function updatePlayPauseUI() {
        resetHudTimer();
        if (videoElement.paused) {
            btnPlayPause.innerHTML = `<span class="material-symbols-outlined text-5xl drop-shadow-lg" style="font-variation-settings: 'FILL' 1;">play_circle</span>`;
            showCenterFeedback('play_arrow');
        } else {
            btnPlayPause.innerHTML = `<span class="material-symbols-outlined text-5xl drop-shadow-lg" style="font-variation-settings: 'FILL' 1;">pause_circle</span>`;
            showCenterFeedback('pause');
        }
    }

    function showCenterFeedback(icon) {
        centerFeedbackIcon.innerHTML = `<span class="material-symbols-outlined text-6xl shadow-black/50">${icon}</span>`;
        centerFeedbackIcon.classList.remove('opacity-0', 'scale-150');
        centerFeedbackIcon.classList.add('opacity-100', 'scale-100');
        setTimeout(() => {
            centerFeedbackIcon.classList.remove('opacity-100', 'scale-100');
            centerFeedbackIcon.classList.add('opacity-0', 'scale-150');
        }, 500);
    }

    btnPlayPause.addEventListener('click', () => {
        if(videoElement.paused) videoElement.play();
        else videoElement.pause();
    });

    // Clicking the video itself toggles play/pause for VODs
    videoElement.addEventListener('click', (e) => {
        // Prevent click if they clicked on the HUD
        if(e.target === videoElement && currentMode !== 'live') {
            if(videoElement.paused) videoElement.play();
            else videoElement.pause();
        }
    });

    videoElement.addEventListener('play', updatePlayPauseUI);
    videoElement.addEventListener('pause', updatePlayPauseUI);

    // Transport Jumps (VOD/Series)
    btnRewind.addEventListener('click', () => { videoElement.currentTime -= 10; showCenterFeedback('replay_10'); });
    btnForward.addEventListener('click', () => { videoElement.currentTime += 10; showCenterFeedback('forward_10'); });

    // Format seconds to mm:ss or hh:mm:ss
    function formatTime(seconds) {
        if(isNaN(seconds) || seconds < 0) return '00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    videoElement.addEventListener('timeupdate', () => {
        if (currentMode === 'live') {
            timeCurrent.textContent = 'LIVE';
            timeTotal.textContent = '';
            progressFill.style.width = '100%';
            progressThumb.style.left = '100%';
            return;
        }

        timeCurrent.textContent = formatTime(videoElement.currentTime);
        if(videoElement.duration) {
            timeTotal.textContent = formatTime(videoElement.duration);
            const percentage = (videoElement.currentTime / videoElement.duration) * 100;
            progressFill.style.width = `${percentage}%`;
            progressThumb.style.left = `${percentage}%`;
        }

        // Update Buffer track
        if (videoElement.buffered.length > 0) {
            const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
            const bufferPerc = (bufferedEnd / videoElement.duration) * 100;
            progressBuffer.style.width = `${bufferPerc}%`;
        }
    });

    videoElement.addEventListener('loadedmetadata', () => {
        if (currentMode !== 'live') {
            timeTotal.textContent = formatTime(videoElement.duration);
            // Show timeline for VODs
            progressTrack.parentElement.classList.remove('opacity-50', 'pointer-events-none');
            btnRewind.classList.remove('hidden');
            btnForward.classList.remove('hidden');
        } else {
            // Hide timeline accuracy for Live
            progressTrack.parentElement.classList.add('opacity-50', 'pointer-events-none');
            timeCurrent.textContent = 'LIVE';
            timeTotal.textContent = '';
            btnRewind.classList.add('hidden');
            btnForward.classList.add('hidden');
        }
    });

    // Seek via Progress Bar
    progressTrack.addEventListener('click', (e) => {
        if (currentMode === 'live') return;
        const rect = progressTrack.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        videoElement.currentTime = pos * videoElement.duration;
    });

    // Volume Set
    volumeSlider.addEventListener('input', (e) => {
        videoElement.volume = e.target.value;
        videoElement.muted = e.target.value === "0";
        updateVolumeIcon();
    });

    btnVolumeToggle.addEventListener('click', () => {
        videoElement.muted = !videoElement.muted;
        volumeSlider.value = videoElement.muted ? 0 : videoElement.volume || 1;
        updateVolumeIcon();
    });

    function updateVolumeIcon() {
        const icon = btnVolumeToggle.querySelector('span');
        if (videoElement.muted || videoElement.volume === 0) icon.textContent = 'volume_off';
        else if (videoElement.volume < 0.5) icon.textContent = 'volume_down';
        else icon.textContent = 'volume_up';
    }

    // Fullscreen Toggle
    btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            playerView.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            btnFullscreen.querySelector('span').textContent = 'fullscreen_exit';
        } else {
            btnFullscreen.querySelector('span').textContent = 'fullscreen';
        }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        // Only run shortcuts if player is active
        if (playerView.classList.contains('hidden')) return;

        // Spacebar / k (Play/Pause)
        if (e.code === 'Space' || e.code === 'KeyK') {
            e.preventDefault();
            btnPlayPause.click();
        }
        // Left / Right arrows (Seek)
        else if (e.code === 'ArrowRight') {
            e.preventDefault();
            btnForward.click();
        }
        else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            btnRewind.click();
        }
        // m (Mute)
        else if (e.code === 'KeyM') {
            e.preventDefault();
            btnVolumeToggle.click();
        }
        // f (Fullscreen)
        else if (e.code === 'KeyF') {
            e.preventDefault();
            btnFullscreen.click();
        }
        // Escape / Backspace (Exit)
        else if (e.code === 'Escape' || e.code === 'Backspace') {
            e.preventDefault();
            closePlayer();
        }
    });

});
