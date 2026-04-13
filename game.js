(() => {
  const WORD_LENGTH = 5;
  const MAX_GUESSES = 6;
  const SUPABASE_URL = "https://nntwkjevyadhxqtvoxed.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udHdramV2eWFkaHhxdHZveGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk3MzMsImV4cCI6MjA5MTM5NTczM30.JJBixtUV6sCYKznkZbRSnfL4b9ddW4LD2Q8frUU1Z6Q";
  const BOT_TOKEN = "8425194478:AAH93I9QN-kQtfic0NIkM1AozpBSfatcmhU";
  const SCORE_MAP = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 10 };

  const KB_ROWS = [
    ["ә","й","ц","у","к","е","н","г","ш","щ","з","х","һ"],
    ["ф","ы","в","а","п","р","о","л","д","ж","ң","э"],
    ["ENTER","я","ч","с","м","и","т","ү","б","ө","ю","җ","⌫"],
  ];

  // Telegram
  const tg = window.Telegram?.WebApp;
  let tgUser = null;
  if (tg) { tg.ready(); tg.expand(); tgUser = tg.initDataUnsafe?.user; }

  // URL params
  const urlParams = new URLSearchParams(window.location.search);
  const challengeId = urlParams.get("challenge");
  const duelId = urlParams.get("duel");

  // ============ State ============
  let currentMode = null; // 'daily','endless','speed','challenge','duel'
  let targetWord = "";
  let guesses = [];
  let currentGuess = "";
  let gameOver = false;
  let currentRow = 0;
  let letterStatus = {};
  let usedWords = new Set();
  let modeWordsSolved = 0;
  let speedTimer = null;
  let speedTimeLeft = 300;
  let duelStartTime = 0;

  // DOM
  const $ = id => document.getElementById(id);
  const boardEl = $("board");
  const kbEl = $("keyboard");
  const toastEl = $("toast");
  const screenHome = $("screen-home");
  const screenGame = $("screen-game");
  const statusBar = $("game-status-bar");
  const statusTimer = $("status-timer");
  const statusScore = $("status-score");
  const statusStreak = $("status-streak");

  // ============ Supabase ============
  async function sbFetch(path, opts = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": opts.prefer || "return=minimal", ...(opts.headers || {}) },
      method: opts.method || "GET",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (opts.prefer === "return=representation" || opts.method === "GET" || !opts.method) { try { return await res.json(); } catch { return null; } }
    return null;
  }

  async function syncPlayer() {
    if (!tgUser) return;
    await sbFetch("wordle_players", { method: "POST", headers: { "Prefer": "resolution=merge-duplicates" }, body: { tg_id: tgUser.id, username: tgUser.username || "", first_name: tgUser.first_name || "" } });
  }

  // ============ Word Selection ============
  function getDayNumber() { return Math.floor((Date.now() - new Date(2026, 3, 11).getTime()) / 86400000); }
  function getDailyWord() { const d = getDayNumber(); return ANSWERS[((d % ANSWERS.length) + ANSWERS.length) % ANSWERS.length]; }
  function getRandomWord() {
    const available = ANSWERS.filter((_, i) => !usedWords.has(i));
    if (available.length === 0) { usedWords.clear(); return ANSWERS[Math.floor(Math.random() * ANSWERS.length)]; }
    const word = available[Math.floor(Math.random() * available.length)];
    usedWords.add(ANSWERS.indexOf(word));
    return word;
  }

  // ============ Board ============
  function createBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < MAX_GUESSES; r++) {
      const row = document.createElement("div"); row.className = "row"; row.id = `row-${r}`;
      for (let c = 0; c < WORD_LENGTH; c++) { const t = document.createElement("div"); t.className = "tile"; t.id = `tile-${r}-${c}`; row.appendChild(t); }
      boardEl.appendChild(row);
    }
  }

  function updateBoard() {
    for (let r = 0; r < guesses.length; r++) {
      const res = evaluate(guesses[r]);
      for (let c = 0; c < WORD_LENGTH; c++) { const t = $(`tile-${r}-${c}`); t.textContent = guesses[r][c].toUpperCase(); t.className = `tile ${res[c]}`; }
    }
    if (!gameOver && currentRow < MAX_GUESSES) {
      for (let c = 0; c < WORD_LENGTH; c++) {
        const t = $(`tile-${currentRow}-${c}`);
        if (c < currentGuess.length) { t.textContent = currentGuess[c].toUpperCase(); t.className = "tile filled"; }
        else { t.textContent = ""; t.className = "tile"; }
      }
    }
  }

  function resetBoard() {
    guesses = []; currentGuess = ""; gameOver = false; currentRow = 0; letterStatus = {};
    createBoard(); createKeyboard();
  }

  function evaluate(guess) {
    const result = Array(WORD_LENGTH).fill("absent");
    const ta = [...targetWord], ga = [...guess];
    for (let i = 0; i < WORD_LENGTH; i++) { if (ga[i] === ta[i]) { result[i] = "correct"; ta[i] = null; ga[i] = null; } }
    for (let i = 0; i < WORD_LENGTH; i++) { if (!ga[i]) continue; const idx = ta.indexOf(ga[i]); if (idx !== -1) { result[i] = "present"; ta[idx] = null; } }
    return result;
  }

  // ============ Keyboard ============
  function createKeyboard() {
    kbEl.innerHTML = "";
    for (const row of KB_ROWS) {
      const rowEl = document.createElement("div"); rowEl.className = "kb-row";
      for (const key of row) {
        const btn = document.createElement("button"); btn.className = "key"; btn.dataset.key = key;
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
      if (letterStatus[k]) { btn.classList.remove("correct","present","absent"); btn.classList.add(letterStatus[k]); }
    });
  }

  function updateLetterStatuses(guess, result) {
    for (let i = 0; i < WORD_LENGTH; i++) {
      const l = guess[i], s = result[i], c = letterStatus[l];
      if (s === "correct") letterStatus[l] = "correct";
      else if (s === "present" && c !== "correct") letterStatus[l] = "present";
      else if (!c) letterStatus[l] = "absent";
    }
  }

  // ============ Input ============
  function handleKey(key) {
    if (gameOver) return;
    if (key === "⌫" || key === "Backspace") { currentGuess = currentGuess.slice(0, -1); updateBoard(); return; }
    if (key === "ENTER" || key === "Enter") { submitGuess(); return; }
    const letter = key.toLowerCase();
    if (currentGuess.length < WORD_LENGTH && /^[а-яәөүҗңһё]$/i.test(letter)) { currentGuess += letter; updateBoard(); }
  }

  function submitGuess() {
    if (currentGuess.length !== WORD_LENGTH) { shakeRow(); showToast("5 хәреф кирәк!"); return; }
    if (!VALID_GUESSES.has(currentGuess) && !ANSWERS.includes(currentGuess)) { shakeRow(); showToast("Сүзлектә юк"); return; }

    const result = evaluate(currentGuess);
    guesses.push(currentGuess);
    updateLetterStatuses(currentGuess, result);

    revealRow(currentRow, result, () => {
      updateKeyboard();
      const won = currentGuess === targetWord;
      if (won) { gameOver = true; winAnimation(currentRow); onWin(guesses.length); }
      else if (guesses.length >= MAX_GUESSES) { gameOver = true; onLose(); }
      currentRow++; currentGuess = "";
      if (currentMode === "daily") saveDailyState();
    });
  }

  // ============ Mode-specific win/lose ============
  function onWin(attempts) {
    if (currentMode === "daily") { saveDailyStats(true, attempts); saveResultToServer(true, attempts); setTimeout(() => showDailyStats(), 1800); }
    else if (currentMode === "challenge") { saveChallengeResult(true, attempts); setTimeout(() => showSimpleResult("Афәрин! 🎉", `${attempts}/6 тапкырда таптыгыз`), 1800); }
    else if (currentMode === "speed") { modeWordsSolved++; updateStatusBar(); setTimeout(() => { resetBoard(); targetWord = getRandomWord(); }, 800); }
    else if (currentMode === "endless") { modeWordsSolved++; updateStatusBar(); setTimeout(() => { resetBoard(); targetWord = getRandomWord(); }, 1200); }
    else if (currentMode === "duel") { const elapsed = Date.now() - duelStartTime; saveDuelResult(true, attempts, elapsed); setTimeout(() => showSimpleResult("Таптыгыз! 🎯", `${attempts}/6 — ${(elapsed/1000).toFixed(1)}с`), 1800); }
  }

  function onLose() {
    if (currentMode === "daily") { saveDailyStats(false, MAX_GUESSES); saveResultToServer(false, MAX_GUESSES); setTimeout(() => { showToast(targetWord.toUpperCase(), 2500); showDailyStats(); }, 500); }
    else if (currentMode === "challenge") { saveChallengeResult(false, MAX_GUESSES); setTimeout(() => showSimpleResult("Сүз: " + targetWord.toUpperCase(), "Киләсе тапкырда!"), 1000); }
    else if (currentMode === "speed") { setTimeout(() => { showToast(targetWord.toUpperCase(), 1500); resetBoard(); targetWord = getRandomWord(); }, 500); }
    else if (currentMode === "endless") { endEndless(); }
    else if (currentMode === "duel") { const elapsed = Date.now() - duelStartTime; saveDuelResult(false, MAX_GUESSES, elapsed); setTimeout(() => showSimpleResult("Сүз: " + targetWord.toUpperCase(), `Табылмады — ${(elapsed/1000).toFixed(1)}с`), 1000); }
  }

  // ============ Animations ============
  function revealRow(rowIdx, result, cb) {
    const tiles = []; for (let c = 0; c < WORD_LENGTH; c++) tiles.push($(`tile-${rowIdx}-${c}`));
    tiles.forEach((t, i) => { setTimeout(() => { t.classList.add("reveal"); setTimeout(() => { t.className = `tile ${result[i]}`; t.textContent = guesses[rowIdx][i].toUpperCase(); }, 250); if (i === WORD_LENGTH - 1) setTimeout(cb, 300); }, i * 250); });
  }
  function shakeRow() { const r = $(`row-${currentRow}`); r.classList.add("shake"); setTimeout(() => r.classList.remove("shake"), 400); }
  function winAnimation(rowIdx) { for (let c = 0; c < WORD_LENGTH; c++) setTimeout(() => $(`tile-${rowIdx}-${c}`).classList.add("win"), c * 100 + 1200); }

  // ============ Toast ============
  let toastTO;
  function showToast(msg, dur = 1500) { toastEl.textContent = msg; toastEl.classList.remove("hidden"); clearTimeout(toastTO); toastTO = setTimeout(() => toastEl.classList.add("hidden"), dur); }

  // ============ Screen Management ============
  function showHome() {
    screenHome.classList.remove("hidden"); screenGame.classList.add("hidden");
    if (tg?.BackButton) tg.BackButton.hide();
    if (speedTimer) { clearInterval(speedTimer); speedTimer = null; }
    updateHomeBadges();
  }

  function showGame(modeName) {
    screenHome.classList.add("hidden"); screenGame.classList.remove("hidden");
    if (tg?.BackButton) { tg.BackButton.show(); tg.BackButton.onClick(showHome); }
    statusBar.classList.add("hidden"); statusTimer.classList.add("hidden"); statusScore.classList.add("hidden"); statusStreak.classList.add("hidden");
  }

  function updateHomeBadges() {
    const ds = getDailyStats();
    const dc = $("daily-check");
    const saved = localStorage.getItem("suzle_daily");
    if (saved) { const s = JSON.parse(saved); if (s.day === getDayNumber() && s.gameOver) { dc.classList.remove("hidden"); } else dc.classList.add("hidden"); }

    const eb = $("endless-best"); const ebv = parseInt(localStorage.getItem("suzle_endless_best") || "0");
    if (ebv > 0) { eb.textContent = `🏆 ${ebv}`; eb.classList.remove("hidden"); } else eb.classList.add("hidden");

    const sb = $("speed-best"); const sbv = parseInt(localStorage.getItem("suzle_speed_best") || "0");
    if (sbv > 0) { sb.textContent = `🏆 ${sbv}`; sb.classList.remove("hidden"); } else sb.classList.add("hidden");
  }

  function updateStatusBar() {
    if (currentMode === "speed") {
      statusBar.classList.remove("hidden"); statusTimer.classList.remove("hidden"); statusScore.classList.remove("hidden");
      $("score-text").textContent = modeWordsSolved;
      const m = Math.floor(speedTimeLeft / 60), s = speedTimeLeft % 60;
      $("timer-text").textContent = `${m}:${String(s).padStart(2, "0")}`;
    } else if (currentMode === "endless") {
      statusBar.classList.remove("hidden"); statusScore.classList.remove("hidden");
      $("score-text").textContent = modeWordsSolved;
    }
  }

  // ============ Mode: Daily ============
  function startDaily() {
    currentMode = "daily"; targetWord = getDailyWord(); resetBoard();
    showGame("Көнлек сүз");
    const saved = localStorage.getItem("suzle_daily");
    if (saved) { const s = JSON.parse(saved); if (s.day === getDayNumber()) { guesses = s.guesses || []; gameOver = s.gameOver || false; currentRow = guesses.length; for (const g of guesses) updateLetterStatuses(g, evaluate(g)); updateBoard(); updateKeyboard(); } }
  }

  function saveDailyState() { localStorage.setItem("suzle_daily", JSON.stringify({ day: getDayNumber(), guesses, gameOver })); }

  function getDailyStats() { const s = localStorage.getItem("suzle_daily_stats"); return s ? JSON.parse(s) : { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0,0,0,0,0,0] }; }

  function saveDailyStats(won, attempts) {
    const s = getDailyStats(); s.played++;
    if (won) { s.won++; s.streak++; s.maxStreak = Math.max(s.maxStreak, s.streak); s.dist[attempts - 1]++; } else s.streak = 0;
    localStorage.setItem("suzle_daily_stats", JSON.stringify(s));
  }

  async function saveResultToServer(won, attempts) {
    if (!tgUser) return;
    const score = won ? (SCORE_MAP[attempts] || 10) : 0;
    await sbFetch("wordle_results", { method: "POST", headers: { "Prefer": "resolution=merge-duplicates" }, body: { tg_id: tgUser.id, day_number: getDayNumber(), attempts: won ? attempts : MAX_GUESSES, won } });
    const ds = getDailyStats();
    await sbFetch(`wordle_players?tg_id=eq.${tgUser.id}`, { method: "PATCH", body: { score: (await getPlayerField("score")) + score, streak: ds.streak, max_streak: ds.maxStreak, games_played: ds.played, games_won: ds.won } });
  }

  function showDailyStats() {
    const s = getDailyStats(); const pct = s.played ? Math.round(s.won / s.played * 100) : 0;
    const maxD = Math.max(...s.dist, 1);
    $("stats-title").textContent = "Көнлек статистика";
    $("stats-body").innerHTML = `
      <div class="stats-numbers">
        <div class="stat-item"><div class="stat-value">${s.played}</div><div class="stat-label">Уен</div></div>
        <div class="stat-item"><div class="stat-value">${pct}</div><div class="stat-label">% Җиңү</div></div>
        <div class="stat-item"><div class="stat-value">${s.streak}</div><div class="stat-label">🔥 Эзлекле</div></div>
        <div class="stat-item"><div class="stat-value">${s.maxStreak}</div><div class="stat-label">Максимум</div></div>
      </div>
      <div class="stats-bars">${s.dist.map((c, i) => `<div class="bar-row"><div class="bar-label">${i+1}</div><div class="bar${gameOver && guesses.length === i+1 ? " highlight" : ""}" style="width:${Math.max(c/maxD*100, 8)}%">${c}</div></div>`).join("")}</div>
    `;
    $("btn-share").classList.toggle("hidden", !gameOver); $("btn-share").onclick = shareDaily;
    $("btn-play-again").classList.add("hidden");
    $("modal-stats").classList.remove("hidden");
  }

  function shareDaily() {
    const won = guesses.length > 0 && guesses[guesses.length - 1] === targetWord;
    let text = `Сүзле #${getDayNumber()} ${won ? guesses.length + "/6" : "X/6"}\n\n`;
    for (const g of guesses) text += evaluate(g).map(r => r === "correct" ? "🟩" : r === "present" ? "🟨" : "⬛").join("") + "\n";
    text += "\n@tatarcha_wordle_bot";
    if (navigator.share) navigator.share({ text }); else if (navigator.clipboard) { navigator.clipboard.writeText(text); showToast("Күчерелде!"); }
  }

  // ============ Mode: Endless ============
  function startEndless() {
    currentMode = "endless"; modeWordsSolved = 0; usedWords.clear();
    targetWord = getRandomWord(); resetBoard();
    showGame("♾️ Чиксез"); updateStatusBar();
  }

  function endEndless() {
    if (speedTimer) { clearInterval(speedTimer); speedTimer = null; }
    const best = parseInt(localStorage.getItem("suzle_endless_best") || "0");
    if (modeWordsSolved > best) localStorage.setItem("suzle_endless_best", String(modeWordsSolved));
    if (tgUser && modeWordsSolved > best) sbFetch(`wordle_players?tg_id=eq.${tgUser.id}`, { method: "PATCH", body: { endless_best: modeWordsSolved } });
    showSimpleResult("♾️ Чиксез", `${modeWordsSolved} сүз таптыгыз!`, true);
  }

  // ============ Mode: Speed ============
  function startSpeed() {
    currentMode = "speed"; modeWordsSolved = 0; speedTimeLeft = 300; usedWords.clear();
    targetWord = getRandomWord(); resetBoard();
    showGame("⚡ Тиз уен"); updateStatusBar();
    speedTimer = setInterval(() => {
      speedTimeLeft--;
      updateStatusBar();
      if (speedTimeLeft <= 0) { clearInterval(speedTimer); speedTimer = null; gameOver = true; endSpeed(); }
    }, 1000);
  }

  function endSpeed() {
    const best = parseInt(localStorage.getItem("suzle_speed_best") || "0");
    if (modeWordsSolved > best) localStorage.setItem("suzle_speed_best", String(modeWordsSolved));
    if (tgUser) {
      sbFetch("wordle_speed_results", { method: "POST", body: { tg_id: tgUser.id, words_solved: modeWordsSolved, score: modeWordsSolved * 50 } });
      if (modeWordsSolved > best) sbFetch(`wordle_players?tg_id=eq.${tgUser.id}`, { method: "PATCH", body: { speed_best: modeWordsSolved } });
    }
    showSimpleResult("⚡ Тиз уен", `${modeWordsSolved} сүз таптыгыз!`, true);
  }

  // ============ Mode: Challenge ============
  async function startChallenge(cid) {
    currentMode = "challenge";
    const data = await sbFetch(`wordle_challenges?id=eq.${cid}&select=word,status,from_username`);
    if (!data || !data[0]) { showToast("Биремә табылмады", 2000); showHome(); return; }
    if (data[0].status === "completed") { showToast("Бу биремә инде башкарылган", 2000); showHome(); return; }
    targetWord = data[0].word; resetBoard();
    showGame(`⚔️ ${data[0].from_username || "Дус"} биремәсе`);
  }

  async function saveChallengeResult(won, attempts) {
    if (!challengeId) return;
    await sbFetch(`wordle_challenges?id=eq.${challengeId}`, { method: "PATCH", body: { attempts, won, status: "completed", to_tg_id: tgUser?.id } });
  }

  // ============ Mode: Duel ============
  async function startDuel() {
    const modal = $("modal-duel"); modal.classList.remove("hidden");
    $("duel-username").value = ""; $("duel-status").textContent = "";
  }

  async function joinDuel(did) {
    currentMode = "duel";
    const data = await sbFetch(`wordle_duels?id=eq.${did}&select=*`);
    if (!data || !data[0]) { showToast("Дуэль табылмады", 2000); showHome(); return; }
    if (data[0].status === "completed") { showToast("Бу дуэль инде тәмамланган", 2000); showHome(); return; }
    targetWord = data[0].word;
    await sbFetch(`wordle_duels?id=eq.${did}`, { method: "PATCH", body: { player2_tg_id: tgUser?.id, player2_username: tgUser?.username || "", status: "active" } });
    resetBoard(); duelStartTime = Date.now();
    showGame("🎯 Дуэль");
  }

  async function saveDuelResult(won, attempts, timeMs) {
    if (!duelId || !tgUser) return;
    const data = await sbFetch(`wordle_duels?id=eq.${duelId}&select=*`);
    if (!data || !data[0]) return;
    const d = data[0];
    const isP1 = d.player1_tg_id === tgUser.id;
    const update = isP1 ? { player1_attempts: attempts, player1_time_ms: timeMs } : { player2_attempts: attempts, player2_time_ms: timeMs };
    await sbFetch(`wordle_duels?id=eq.${duelId}`, { method: "PATCH", body: update });
  }

  // ============ Challenge sending (from home) ============
  $("btn-send-challenge").addEventListener("click", async () => {
    const word = $("challenge-word").value.trim().toLowerCase();
    const username = $("challenge-username").value.trim().replace("@", "");
    const st = $("challenge-status");
    if (word.length !== 5) { st.className = "challenge-status error"; st.textContent = "5 хәреф кирәк!"; return; }
    if (!VALID_GUESSES.has(word) && !ANSWERS.includes(word)) { st.className = "challenge-status error"; st.textContent = "Сүзлектә юк"; return; }
    if (!username) { st.className = "challenge-status error"; st.textContent = "@username кирәк!"; return; }
    if (!tgUser) { st.className = "challenge-status error"; st.textContent = "Telegram аша кереп языгыз"; return; }
    st.className = "challenge-status"; st.textContent = "Җибәрелә...";
    const res = await sbFetch("wordle_challenges", { method: "POST", prefer: "return=representation", body: { from_tg_id: tgUser.id, from_username: tgUser.username || tgUser.first_name || "", to_username: username, word } });
    if (!res || !res[0]) { st.className = "challenge-status error"; st.textContent = "Хата булды"; return; }
    const cid = res[0].id;
    const userData = await sbFetch(`wordle_players?username=eq.${username}&select=tg_id`);
    if (userData && userData.length > 0) {
      const fid = userData[0].tg_id;
      const curl = `https://almazf318.github.io/tatarcha-wordle/?challenge=${cid}`;
      try {
        const r = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: fid, text: `⚔️ @${tgUser.username || tgUser.first_name} сезгә сүз бирде!`, reply_markup: { inline_keyboard: [[{ text: "🎯 Табарга!", web_app: { url: curl } }]] } }) })).json();
        if (r.ok) { st.className = "challenge-status success"; st.textContent = "✅ Дусыңызга җибәрелде!"; return; }
      } catch {}
    }
    const link = `https://t.me/tatarcha_wordle_bot?start=challenge_${cid}`;
    if (navigator.clipboard) await navigator.clipboard.writeText(link);
    st.className = "challenge-status success";
    st.textContent = userData?.length ? "⚠️ Җибәреп булмады. Сылтама күчерелде!" : "⚠️ Кулланучы ботта юк. Сылтама күчерелде!";
  });

  // Duel sending
  $("btn-send-duel").addEventListener("click", async () => {
    const username = $("duel-username").value.trim().replace("@", "");
    const st = $("duel-status");
    if (!username) { st.className = "challenge-status error"; st.textContent = "@username кирәк!"; return; }
    if (!tgUser) { st.className = "challenge-status error"; st.textContent = "Telegram аша кереп языгыз"; return; }
    st.className = "challenge-status"; st.textContent = "Булдырыла...";
    const word = getRandomWord();
    const res = await sbFetch("wordle_duels", { method: "POST", prefer: "return=representation", body: { word, player1_tg_id: tgUser.id, player1_username: tgUser.username || "" } });
    if (!res || !res[0]) { st.className = "challenge-status error"; st.textContent = "Хата булды"; return; }
    const did = res[0].id;
    // Try to send to friend
    const userData = await sbFetch(`wordle_players?username=eq.${username}&select=tg_id`);
    if (userData && userData.length > 0) {
      const fid = userData[0].tg_id;
      const durl = `https://almazf318.github.io/tatarcha-wordle/?duel=${did}`;
      try {
        const r = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: fid, text: `🎯 @${tgUser.username || tgUser.first_name} сезне дуэльгә чакыра!`, reply_markup: { inline_keyboard: [[{ text: "⚔️ Кабул итү!", web_app: { url: durl } }]] } }) })).json();
        if (r.ok) { st.className = "challenge-status success"; st.textContent = "✅ Чакыру җибәрелде!"; $("modal-duel").classList.add("hidden"); currentMode = "duel"; targetWord = word; resetBoard(); duelStartTime = Date.now(); showGame("🎯 Дуэль"); return; }
      } catch {}
    }
    const link = `https://t.me/tatarcha_wordle_bot?start=duel_${did}`;
    if (navigator.clipboard) await navigator.clipboard.writeText(link);
    st.className = "challenge-status success"; st.textContent = "⚠️ Сылтама күчерелде — дусыңызга җибәрегез!";
    // Start own game
    setTimeout(() => { $("modal-duel").classList.add("hidden"); currentMode = "duel"; targetWord = word; resetBoard(); duelStartTime = Date.now(); showGame("🎯 Дуэль"); }, 1500);
  });

  // ============ Simple result modal ============
  function showSimpleResult(title, text, playAgain = false) {
    $("stats-title").textContent = title;
    $("stats-body").innerHTML = `<div class="result-big"><div class="val">${text}</div></div>`;
    $("btn-share").classList.add("hidden");
    const pa = $("btn-play-again");
    if (playAgain) { pa.classList.remove("hidden"); pa.onclick = () => { $("modal-stats").classList.add("hidden"); if (currentMode === "endless") startEndless(); else if (currentMode === "speed") startSpeed(); }; }
    else pa.classList.add("hidden");
    $("modal-stats").classList.remove("hidden");
  }

  // ============ Leaderboard ============
  $("btn-leaderboard-home")?.addEventListener("click", async () => {
    $("modal-leaderboard").classList.remove("hidden");
    const list = $("leaderboard-list"); list.innerHTML = '<div class="loader">Йөкләнә...</div>';
    const data = await sbFetch("wordle_players?select=tg_id,username,first_name,score,streak&order=score.desc&limit=20");
    if (!data || data.length === 0) { list.innerHTML = '<div class="loader">Әлегә буш</div>'; return; }
    const medals = ["🥇","🥈","🥉"];
    list.innerHTML = data.map((p, i) => {
      const isMe = tgUser && p.tg_id === tgUser.id;
      return `<div class="lb-row ${isMe?"me":""}"><div class="lb-rank ${i<3?"top"+(i+1):""}">${i<3?medals[i]:i+1}</div><div class="lb-name">${p.first_name||p.username||"Билгесез"}${p.streak>0?" 🔥"+p.streak:""}</div><div class="lb-score">${p.score}</div></div>`;
    }).join("");
  });

  // ============ Helper ============
  async function getPlayerField(field) {
    if (!tgUser) return 0;
    const d = await sbFetch(`wordle_players?tg_id=eq.${tgUser.id}&select=${field}`);
    return d?.[0]?.[field] || 0;
  }

  // ============ Mode selection ============
  document.querySelectorAll(".mode-card").forEach(card => {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode;
      if (mode === "daily") startDaily();
      else if (mode === "endless") startEndless();
      else if (mode === "speed") startSpeed();
      else if (mode === "challenge") { $("modal-challenge").classList.remove("hidden"); $("challenge-word").value = ""; $("challenge-username").value = ""; $("challenge-status").textContent = ""; }
      else if (mode === "duel") startDuel();
    });
  });

  // Telegram back button handled in showGame/showHome
  $("btn-info-home")?.addEventListener("click", () => $("modal-info").classList.remove("hidden"));

  // Modals
  document.querySelectorAll(".modal-close").forEach(b => b.addEventListener("click", () => b.closest(".modal").classList.add("hidden")));
  document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.add("hidden"); }));

  // Physical keyboard
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (screenGame.classList.contains("hidden")) return;
    const anyModal = document.querySelector(".modal:not(.hidden)");
    if (anyModal) return;
    if (e.key === "Enter") handleKey("ENTER");
    else if (e.key === "Backspace") handleKey("⌫");
    else if (e.key.length === 1) handleKey(e.key.toLowerCase());
  });

  // ============ Init ============
  async function init() {
    syncPlayer();
    if (challengeId) { await startChallenge(challengeId); }
    else if (duelId) { await joinDuel(duelId); }
    else { showHome(); }
    if (!localStorage.getItem("suzle_visited")) { setTimeout(() => $("modal-info").classList.remove("hidden"), 500); localStorage.setItem("suzle_visited", "1"); }
  }

  init();
})();
