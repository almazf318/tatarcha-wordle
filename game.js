(() => {
  const WORD_LENGTH = 5;
  const MAX_GUESSES = 6;
  const STORAGE_KEY = "suzle_state";
  const STATS_KEY = "suzle_stats";
  const SUPABASE_URL = "https://nntwkjevyadhxqtvoxed.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udHdramV2eWFkaHhxdHZveGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk3MzMsImV4cCI6MjA5MTM5NTczM30.JJBixtUV6sCYKznkZbRSnfL4b9ddW4LD2Q8frUU1Z6Q";
  const BOT_TOKEN = "8425194478:AAH93I9QN-kQtfic0NIkM1AozpBSfatcmhU";

  const KB_ROWS = [
    ["ә","й","ц","у","к","е","н","г","ш","щ","з","х","һ"],
    ["ф","ы","в","а","п","р","о","л","д","ж","ң","э"],
    ["ENTER","я","ч","с","м","и","т","ү","б","ө","ю","җ","⌫"],
  ];

  const ACHIEVEMENTS = [
    { id: "first_win", icon: "⭐", name: "Беренче җиңү", check: s => s.games_won >= 1 },
    { id: "streak_7", icon: "🔥", name: "7 көн эзлекле", check: s => s.max_streak >= 7 },
    { id: "genius", icon: "🧠", name: "1 тапкырдан табу", check: s => s.genius },
    { id: "streak_30", icon: "💪", name: "30 көн эзлекле", check: s => s.max_streak >= 30 },
    { id: "veteran", icon: "👑", name: "100 уен", check: s => s.games_played >= 100 },
  ];

  // Scoring: fewer attempts = more points
  const SCORE_MAP = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 10 };

  // Telegram WebApp
  const tg = window.Telegram?.WebApp;
  let tgUser = null;
  if (tg) {
    tg.ready();
    tg.expand();
    tgUser = tg.initDataUnsafe?.user;
  }

  // Check for challenge mode
  const urlParams = new URLSearchParams(window.location.search);
  const challengeId = urlParams.get("challenge");
  let challengeWord = null;
  let isChallenge = false;

  // Day number
  function getDayNumber() {
    const start = new Date(2026, 3, 11);
    const now = new Date();
    return Math.floor((now.getTime() - start.getTime()) / 86400000);
  }

  function getTodayWord() {
    const day = getDayNumber();
    return ANSWERS[((day % ANSWERS.length) + ANSWERS.length) % ANSWERS.length];
  }

  // State
  let targetWord = getTodayWord();
  let guesses = [];
  let currentGuess = "";
  let gameOver = false;
  let currentRow = 0;
  const letterStatus = {};

  // DOM refs
  const boardEl = document.getElementById("board");
  const kbEl = document.getElementById("keyboard");
  const toastEl = document.getElementById("toast");
  const modalInfo = document.getElementById("modal-info");
  const modalStats = document.getElementById("modal-stats");
  const modalLB = document.getElementById("modal-leaderboard");
  const modalChallenge = document.getElementById("modal-challenge");
  const streakBanner = document.getElementById("streak-banner");
  const streakCount = document.getElementById("streak-count");

  // ============ Supabase helpers ============
  async function sbFetch(path, opts = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": opts.prefer || "return=minimal",
        ...(opts.headers || {}),
      },
      method: opts.method || "GET",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (opts.prefer === "return=representation" || opts.method === "GET" || !opts.method) {
      try { return await res.json(); } catch { return null; }
    }
    return null;
  }

  async function syncPlayer() {
    if (!tgUser) return;
    await sbFetch("wordle_players", {
      method: "POST",
      prefer: "return=minimal",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: {
        tg_id: tgUser.id,
        username: tgUser.username || "",
        first_name: tgUser.first_name || "",
      },
    });
  }

  async function saveResult(won, attempts) {
    if (!tgUser) return;
    const day = isChallenge ? -1 : getDayNumber();
    const score = won ? (SCORE_MAP[attempts] || 10) : 0;

    // Save result
    if (!isChallenge) {
      await sbFetch("wordle_results", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates" },
        body: { tg_id: tgUser.id, day_number: day, attempts: won ? attempts : MAX_GUESSES, won },
      });
    }

    // Update player stats
    const stats = getStats();
    await sbFetch(`wordle_players?tg_id=eq.${tgUser.id}`, {
      method: "PATCH",
      body: {
        score: (await getPlayerScore()) + score,
        streak: stats.streak,
        max_streak: stats.maxStreak,
        games_played: stats.played,
        games_won: stats.won,
      },
    });

    // Update challenge if applicable
    if (isChallenge && challengeId) {
      await sbFetch(`wordle_challenges?id=eq.${challengeId}`, {
        method: "PATCH",
        body: { attempts: won ? attempts : MAX_GUESSES, won, status: "completed", to_tg_id: tgUser.id },
      });
    }
  }

  async function getPlayerScore() {
    if (!tgUser) return 0;
    const data = await sbFetch(`wordle_players?tg_id=eq.${tgUser.id}&select=score`);
    return data?.[0]?.score || 0;
  }

  async function getLeaderboard() {
    return await sbFetch("wordle_players?select=tg_id,username,first_name,score,streak,max_streak&order=score.desc&limit=20");
  }

  // ============ Board ============
  function createBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < MAX_GUESSES; r++) {
      const row = document.createElement("div");
      row.className = "row";
      row.id = `row-${r}`;
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.id = `tile-${r}-${c}`;
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
  }

  function updateBoard() {
    for (let r = 0; r < guesses.length; r++) {
      const result = evaluate(guesses[r]);
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.getElementById(`tile-${r}-${c}`);
        tile.textContent = guesses[r][c].toUpperCase();
        tile.className = `tile ${result[c]}`;
      }
    }
    if (!gameOver && currentRow < MAX_GUESSES) {
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.getElementById(`tile-${currentRow}-${c}`);
        if (c < currentGuess.length) {
          tile.textContent = currentGuess[c].toUpperCase();
          tile.className = "tile filled";
        } else {
          tile.textContent = "";
          tile.className = "tile";
        }
      }
    }
  }

  // ============ Evaluation ============
  function evaluate(guess) {
    const result = Array(WORD_LENGTH).fill("absent");
    const targetArr = [...targetWord];
    const guessArr = [...guess];
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guessArr[i] === targetArr[i]) {
        result[i] = "correct";
        targetArr[i] = null;
        guessArr[i] = null;
      }
    }
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guessArr[i] === null) continue;
      const idx = targetArr.indexOf(guessArr[i]);
      if (idx !== -1) { result[i] = "present"; targetArr[idx] = null; }
    }
    return result;
  }

  // ============ Keyboard ============
  function createKeyboard() {
    kbEl.innerHTML = "";
    for (const row of KB_ROWS) {
      const rowEl = document.createElement("div");
      rowEl.className = "kb-row";
      for (const key of row) {
        const btn = document.createElement("button");
        btn.className = "key";
        btn.dataset.key = key;
        if (key === "ENTER") { btn.textContent = "↵"; btn.classList.add("wide"); }
        else if (key === "⌫") { btn.textContent = "⌫"; btn.classList.add("wide"); }
        else btn.textContent = key.toUpperCase();
        btn.addEventListener("click", () => handleKey(key));
        rowEl.appendChild(btn);
      }
      kbEl.appendChild(rowEl);
    }
  }

  function updateKeyboard() {
    kbEl.querySelectorAll(".key").forEach(btn => {
      const k = btn.dataset.key;
      if (letterStatus[k]) {
        btn.classList.remove("correct", "present", "absent");
        btn.classList.add(letterStatus[k]);
      }
    });
  }

  function updateLetterStatuses(guess, result) {
    for (let i = 0; i < WORD_LENGTH; i++) {
      const letter = guess[i], status = result[i], current = letterStatus[letter];
      if (status === "correct") letterStatus[letter] = "correct";
      else if (status === "present" && current !== "correct") letterStatus[letter] = "present";
      else if (!current) letterStatus[letter] = "absent";
    }
  }

  // ============ Input ============
  function handleKey(key) {
    if (gameOver) return;
    if (key === "⌫" || key === "Backspace") { currentGuess = currentGuess.slice(0, -1); updateBoard(); return; }
    if (key === "ENTER" || key === "Enter") { submitGuess(); return; }
    const letter = key.toLowerCase();
    if (currentGuess.length < WORD_LENGTH && /^[а-яәөүҗңһёa-z]$/i.test(letter)) {
      currentGuess += letter;
      updateBoard();
    }
  }

  function submitGuess() {
    if (currentGuess.length !== WORD_LENGTH) { shakeRow(); showToast("5 хәреф кирәк!"); return; }
    if (!VALID_GUESSES.has(currentGuess) && !ANSWERS.includes(currentGuess)) { shakeRow(); showToast("Сүзлектә юк"); return; }

    const result = evaluate(currentGuess);
    guesses.push(currentGuess);
    updateLetterStatuses(currentGuess, result);

    revealRow(currentRow, result, () => {
      updateKeyboard();
      if (currentGuess === targetWord) {
        gameOver = true;
        winAnimation(currentRow);
        const stats = getStats();
        stats.played++;
        stats.won++;
        stats.streak++;
        stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
        stats.dist[guesses.length - 1]++;
        if (guesses.length === 1) stats.genius = true;
        setStats(stats);
        saveResult(true, guesses.length);
        setTimeout(() => {
          showToast(getWinMessage());
          setTimeout(() => showStatsModal(), 1500);
        }, 400);
      } else if (guesses.length >= MAX_GUESSES) {
        gameOver = true;
        const stats = getStats();
        stats.played++;
        stats.streak = 0;
        setStats(stats);
        saveResult(false, MAX_GUESSES);
        setTimeout(() => {
          showToast(targetWord.toUpperCase(), 3000);
          setTimeout(() => showStatsModal(), 1500);
        }, 400);
      }
      currentRow++;
      currentGuess = "";
      saveState();
    });
  }

  function getWinMessage() {
    return ["Бик яхшы!", "Мөгаллим!", "Шәп!", "Булдыра аласың!", "Афәрин!", "Зур!"][Math.min(guesses.length - 1, 5)];
  }

  // ============ Animations ============
  function revealRow(rowIdx, result, onComplete) {
    const tiles = [];
    for (let c = 0; c < WORD_LENGTH; c++) tiles.push(document.getElementById(`tile-${rowIdx}-${c}`));
    tiles.forEach((tile, i) => {
      setTimeout(() => {
        tile.classList.add("reveal");
        setTimeout(() => {
          tile.className = `tile ${result[i]}`;
          tile.textContent = guesses[rowIdx][i].toUpperCase();
        }, 250);
        if (i === WORD_LENGTH - 1) setTimeout(onComplete, 300);
      }, i * 300);
    });
  }

  function shakeRow() {
    const row = document.getElementById(`row-${currentRow}`);
    row.classList.add("shake");
    setTimeout(() => row.classList.remove("shake"), 400);
  }

  function winAnimation(rowIdx) {
    for (let c = 0; c < WORD_LENGTH; c++) {
      setTimeout(() => document.getElementById(`tile-${rowIdx}-${c}`).classList.add("win"), c * 100 + 1500);
    }
  }

  // ============ Toast ============
  let toastTimeout;
  function showToast(msg, dur = 1500) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.add("hidden"), dur);
  }

  // ============ Stats ============
  function getStats() {
    const saved = localStorage.getItem(STATS_KEY);
    if (saved) return JSON.parse(saved);
    return { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0,0,0,0,0,0], genius: false };
  }
  function setStats(s) { localStorage.setItem(STATS_KEY, JSON.stringify(s)); updateStreakBanner(); }

  function updateStreakBanner() {
    const stats = getStats();
    if (stats.streak > 0) {
      streakBanner.classList.remove("hidden");
      streakCount.textContent = stats.streak;
    } else {
      streakBanner.classList.add("hidden");
    }
  }

  function showStatsModal() {
    const stats = getStats();
    const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;

    document.getElementById("stats-numbers").innerHTML = `
      <div class="stat-item"><div class="stat-value">${stats.played}</div><div class="stat-label">Уен</div></div>
      <div class="stat-item"><div class="stat-value">${winPct}</div><div class="stat-label">% Җиңү</div></div>
      <div class="stat-item"><div class="stat-value">${stats.streak}</div><div class="stat-label">🔥 Эзлекле</div></div>
      <div class="stat-item"><div class="stat-value">${stats.maxStreak}</div><div class="stat-label">Максимум</div></div>
    `;

    const maxDist = Math.max(...stats.dist, 1);
    document.getElementById("stats-bars").innerHTML = stats.dist.map((count, i) => {
      const width = Math.max((count / maxDist) * 100, 8);
      const hl = gameOver && guesses.length === i + 1 ? " highlight" : "";
      return `<div class="bar-row"><div class="bar-label">${i+1}</div><div class="bar${hl}" style="width:${width}%">${count}</div></div>`;
    }).join("");

    // Achievements
    const achHTML = ACHIEVEMENTS.map(a => {
      const unlocked = a.check(stats);
      return `<div class="ach-badge ${unlocked ? "" : "locked"}" title="${a.name}">${a.icon}</div>`;
    }).join("");
    document.getElementById("achievements-display").innerHTML = `<h3>🏆 Казанышлар</h3><div class="ach-badges">${achHTML}</div>`;

    // Timer
    const now = new Date(), tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0);
    const diff = tomorrow - now;
    const h = String(Math.floor(diff/3600000)).padStart(2,"0");
    const m = String(Math.floor((diff%3600000)/60000)).padStart(2,"0");
    const s = String(Math.floor((diff%60000)/1000)).padStart(2,"0");
    document.getElementById("stats-timer").innerHTML = `<div class="label">Киләсе сүзгә кадәр</div><div class="time">${h}:${m}:${s}</div>`;

    const shareBtn = document.getElementById("btn-share");
    if (gameOver) { shareBtn.classList.remove("hidden"); shareBtn.onclick = shareResult; }
    else shareBtn.classList.add("hidden");

    modalStats.classList.remove("hidden");
  }

  function shareResult() {
    const day = isChallenge ? "⚔️" : `#${getDayNumber()}`;
    const won = guesses[guesses.length - 1] === targetWord;
    const score = won ? `${guesses.length}/6` : "X/6";
    let text = `Сүзле ${day} ${score}\n\n`;
    for (const guess of guesses) {
      text += evaluate(guess).map(r => r === "correct" ? "🟩" : r === "present" ? "🟨" : "⬛").join("") + "\n";
    }
    text += "\n@tatarcha_wordle_bot";
    if (navigator.share) navigator.share({ text });
    else if (navigator.clipboard) { navigator.clipboard.writeText(text); showToast("Күчерелде!"); }
  }

  // ============ Leaderboard ============
  document.getElementById("btn-leaderboard").addEventListener("click", async () => {
    modalLB.classList.remove("hidden");
    const list = document.getElementById("leaderboard-list");
    list.innerHTML = '<div class="loader">Йөкләнә...</div>';
    const data = await getLeaderboard();
    if (!data || data.length === 0) { list.innerHTML = '<div class="loader">Әлегә буш</div>'; return; }
    list.innerHTML = data.map((p, i) => {
      const rankClass = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
      const medals = ["🥇","🥈","🥉"];
      const rank = i < 3 ? medals[i] : i + 1;
      const isMe = tgUser && p.tg_id === tgUser.id;
      const name = p.first_name || p.username || "Билгесез";
      return `<div class="lb-row ${isMe ? "me" : ""}">
        <div class="lb-rank ${rankClass}">${rank}</div>
        <div class="lb-name">${name}${p.streak > 0 ? ` 🔥${p.streak}` : ""}</div>
        <div class="lb-score">${p.score}</div>
      </div>`;
    }).join("");
  });

  // ============ Challenge ============
  document.getElementById("btn-challenge").addEventListener("click", () => {
    modalChallenge.classList.remove("hidden");
    document.getElementById("challenge-word").value = "";
    document.getElementById("challenge-username").value = "";
    document.getElementById("challenge-status").textContent = "";
  });

  document.getElementById("btn-send-challenge").addEventListener("click", async () => {
    const word = document.getElementById("challenge-word").value.trim().toLowerCase();
    const statusEl = document.getElementById("challenge-status");

    if (word.length !== 5) { statusEl.className = "challenge-status error"; statusEl.textContent = "5 хәреф кирәк!"; return; }
    if (!VALID_GUESSES.has(word) && !ANSWERS.includes(word)) { statusEl.className = "challenge-status error"; statusEl.textContent = "Сүзлектә юк"; return; }
    if (!tgUser) { statusEl.className = "challenge-status error"; statusEl.textContent = "Telegram аша кереп языгыз"; return; }

    statusEl.className = "challenge-status"; statusEl.textContent = "Җибәрелә...";

    // Save challenge to Supabase
    const res = await sbFetch("wordle_challenges", {
      method: "POST",
      prefer: "return=representation",
      body: {
        from_tg_id: tgUser.id,
        from_username: tgUser.username || tgUser.first_name || "",
        to_username: "",
        word: word,
      },
    });

    if (res && res[0]) {
      const cid = res[0].id;
      const link = `https://t.me/tatarcha_wordle_bot?start=challenge_${cid}`;
      const shareText = `⚔️ Сүзле биремәсе! Мин сиңа сүз бирдем — таба аласыңмы?\n\n🎯 ${link}`;

      // Try native share, fallback to copy
      if (navigator.share) {
        try {
          await navigator.share({ text: shareText });
          statusEl.className = "challenge-status success";
          statusEl.textContent = "✅ Уртаклашылды!";
        } catch {
          await navigator.clipboard?.writeText(shareText);
          statusEl.className = "challenge-status success";
          statusEl.textContent = "✅ Сылтама күчерелде — дусыңызга җибәрегез!";
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        statusEl.className = "challenge-status success";
        statusEl.textContent = "✅ Сылтама күчерелде — дусыңызга җибәрегез!";
      }
    } else {
      statusEl.className = "challenge-status error";
      statusEl.textContent = "Хата булды";
    }
  });

  // ============ Load challenge word ============
  async function loadChallenge() {
    if (!challengeId) return;
    const data = await sbFetch(`wordle_challenges?id=eq.${challengeId}&select=word,status`);
    if (data && data[0]) {
      if (data[0].status === "completed") { showToast("Бу биремә инде башкарылган", 2000); return; }
      challengeWord = data[0].word;
      targetWord = challengeWord;
      isChallenge = true;
      // Reset state for challenge
      guesses = [];
      currentGuess = "";
      gameOver = false;
      currentRow = 0;
      Object.keys(letterStatus).forEach(k => delete letterStatus[k]);
      createBoard();
      createKeyboard();
      showToast("⚔️ Дус биремәсе!", 2000);
    }
  }

  // ============ Save/Load state ============
  function saveState() {
    if (isChallenge) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: getDayNumber(), guesses, gameOver }));
  }

  function loadState() {
    if (isChallenge) return false;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const state = JSON.parse(saved);
    if (state.day !== getDayNumber()) { localStorage.removeItem(STORAGE_KEY); return false; }
    guesses = state.guesses || [];
    gameOver = state.gameOver || false;
    currentRow = guesses.length;
    for (const guess of guesses) { updateLetterStatuses(guess, evaluate(guess)); }
    return true;
  }

  // ============ Modals ============
  document.getElementById("btn-info").addEventListener("click", () => modalInfo.classList.remove("hidden"));
  document.getElementById("btn-stats").addEventListener("click", showStatsModal);

  document.querySelectorAll(".modal-close").forEach(btn => {
    btn.addEventListener("click", () => btn.closest(".modal").classList.add("hidden"));
  });
  document.querySelectorAll(".modal").forEach(m => {
    m.addEventListener("click", e => { if (e.target === m) m.classList.add("hidden"); });
  });

  // Physical keyboard
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const anyModal = [modalInfo, modalStats, modalLB, modalChallenge].some(m => !m.classList.contains("hidden"));
    if (anyModal) return;
    if (e.key === "Enter") handleKey("ENTER");
    else if (e.key === "Backspace") handleKey("⌫");
    else if (e.key.length === 1) handleKey(e.key.toLowerCase());
  });

  // ============ Init ============
  async function init() {
    createBoard();
    createKeyboard();

    if (challengeId) {
      await loadChallenge();
    } else {
      const restored = loadState();
      if (restored) { updateBoard(); updateKeyboard(); }
    }

    updateStreakBanner();
    syncPlayer();

    if (!localStorage.getItem("suzle_visited")) {
      setTimeout(() => modalInfo.classList.remove("hidden"), 500);
      localStorage.setItem("suzle_visited", "1");
    }
  }

  init();
})();
