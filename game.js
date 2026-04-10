(() => {
  const WORD_LENGTH = 5;
  const MAX_GUESSES = 6;
  const STORAGE_KEY = "suzle_state";
  const STATS_KEY = "suzle_stats";

  // Keyboard layout — Tatar Cyrillic
  const KB_ROWS = [
    ["ә","й","ц","у","к","е","н","г","ш","щ","з","х","һ"],
    ["ф","ы","в","а","п","р","о","л","д","ж","ң","э"],
    ["ENTER","я","ч","с","м","и","т","ү","б","ө","ю","җ","⌫"],
  ];

  // Day number (for daily word)
  function getDayNumber() {
    const start = new Date(2026, 3, 11); // April 11 2026
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    return Math.floor(diff / 86400000);
  }

  function getTodayWord() {
    const day = getDayNumber();
    const idx = ((day % ANSWERS.length) + ANSWERS.length) % ANSWERS.length;
    return ANSWERS[idx];
  }

  // State
  let targetWord = getTodayWord();
  let guesses = [];
  let currentGuess = "";
  let gameOver = false;
  let currentRow = 0;

  // DOM
  const boardEl = document.getElementById("board");
  const kbEl = document.getElementById("keyboard");
  const toastEl = document.getElementById("toast");
  const modalInfo = document.getElementById("modal-info");
  const modalStats = document.getElementById("modal-stats");

  // Letter statuses for keyboard coloring
  const letterStatus = {};

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
    // Render completed guesses
    for (let r = 0; r < guesses.length; r++) {
      const result = evaluate(guesses[r]);
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.getElementById(`tile-${r}-${c}`);
        tile.textContent = guesses[r][c].toUpperCase();
        tile.className = `tile ${result[c]}`;
      }
    }
    // Render current guess
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

    // First pass: correct
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guessArr[i] === targetArr[i]) {
        result[i] = "correct";
        targetArr[i] = null;
        guessArr[i] = null;
      }
    }
    // Second pass: present
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guessArr[i] === null) continue;
      const idx = targetArr.indexOf(guessArr[i]);
      if (idx !== -1) {
        result[i] = "present";
        targetArr[idx] = null;
      }
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
        if (key === "ENTER") {
          btn.textContent = "↵";
          btn.classList.add("wide");
        } else if (key === "⌫") {
          btn.textContent = "⌫";
          btn.classList.add("wide");
        } else {
          btn.textContent = key.toUpperCase();
        }
        btn.addEventListener("click", () => handleKey(key));
        rowEl.appendChild(btn);
      }
      kbEl.appendChild(rowEl);
    }
  }

  function updateKeyboard() {
    const keys = kbEl.querySelectorAll(".key");
    keys.forEach(btn => {
      const k = btn.dataset.key;
      if (letterStatus[k]) {
        // Priority: correct > present > absent
        btn.classList.remove("correct", "present", "absent");
        btn.classList.add(letterStatus[k]);
      }
    });
  }

  function updateLetterStatuses(guess, result) {
    for (let i = 0; i < WORD_LENGTH; i++) {
      const letter = guess[i];
      const status = result[i];
      const current = letterStatus[letter];
      if (status === "correct") {
        letterStatus[letter] = "correct";
      } else if (status === "present" && current !== "correct") {
        letterStatus[letter] = "present";
      } else if (!current) {
        letterStatus[letter] = "absent";
      }
    }
  }

  // ============ Input ============
  function handleKey(key) {
    if (gameOver) return;

    if (key === "⌫" || key === "Backspace") {
      currentGuess = currentGuess.slice(0, -1);
      updateBoard();
      return;
    }

    if (key === "ENTER" || key === "Enter") {
      submitGuess();
      return;
    }

    // Letter
    const letter = key.toLowerCase();
    if (currentGuess.length < WORD_LENGTH && /^[а-яәөүҗңһёa-z]$/i.test(letter)) {
      currentGuess += letter;
      updateBoard();
    }
  }

  function submitGuess() {
    if (currentGuess.length !== WORD_LENGTH) {
      shakeRow();
      showToast("5 хәреф кирәк!");
      return;
    }

    if (!VALID_GUESSES.has(currentGuess) && !ANSWERS.includes(currentGuess)) {
      shakeRow();
      showToast("Сүзлектә юк");
      return;
    }

    const result = evaluate(currentGuess);
    guesses.push(currentGuess);
    updateLetterStatuses(currentGuess, result);

    // Animate reveal
    revealRow(currentRow, result, () => {
      updateKeyboard();

      if (currentGuess === targetWord) {
        gameOver = true;
        winAnimation(currentRow);
        setTimeout(() => {
          showToast(getWinMessage());
          saveStats(true, guesses.length);
          setTimeout(() => showStats(), 1500);
        }, 400);
      } else if (guesses.length >= MAX_GUESSES) {
        gameOver = true;
        setTimeout(() => {
          showToast(targetWord.toUpperCase(), 3000);
          saveStats(false, MAX_GUESSES);
          setTimeout(() => showStats(), 1500);
        }, 400);
      }

      currentRow++;
      currentGuess = "";
      saveState();
    });
  }

  function getWinMessage() {
    const messages = ["Бик яхшы!", "Мөгаллим!", "Шәп!", "Булдыра аласың!", "Афәрин!", "Зур!"];
    return messages[Math.min(guesses.length - 1, messages.length - 1)];
  }

  // ============ Animations ============
  function revealRow(rowIdx, result, onComplete) {
    const tiles = [];
    for (let c = 0; c < WORD_LENGTH; c++) {
      tiles.push(document.getElementById(`tile-${rowIdx}-${c}`));
    }
    tiles.forEach((tile, i) => {
      setTimeout(() => {
        tile.classList.add("reveal");
        setTimeout(() => {
          tile.className = `tile ${result[i]}`;
          tile.textContent = guesses[rowIdx][i].toUpperCase();
        }, 250);
        if (i === WORD_LENGTH - 1) {
          setTimeout(onComplete, 300);
        }
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
      const tile = document.getElementById(`tile-${rowIdx}-${c}`);
      setTimeout(() => tile.classList.add("win"), c * 100 + 1500);
    }
  }

  // ============ Toast ============
  let toastTimeout;
  function showToast(msg, duration = 1500) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.add("hidden"), duration);
  }

  // ============ Modals ============
  document.getElementById("btn-info").addEventListener("click", () => {
    modalInfo.classList.remove("hidden");
  });
  document.getElementById("btn-stats").addEventListener("click", showStats);

  document.querySelectorAll(".modal-close").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.closest(".modal").classList.add("hidden");
    });
  });

  document.querySelectorAll(".modal").forEach(m => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.add("hidden");
    });
  });

  // ============ Stats ============
  function getStats() {
    const saved = localStorage.getItem(STATS_KEY);
    if (saved) return JSON.parse(saved);
    return { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0,0,0,0,0,0] };
  }

  function saveStats(won, attempts) {
    const stats = getStats();
    stats.played++;
    if (won) {
      stats.won++;
      stats.streak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      stats.dist[attempts - 1]++;
    } else {
      stats.streak = 0;
    }
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function showStats() {
    const stats = getStats();
    const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;

    document.getElementById("stats-numbers").innerHTML = `
      <div class="stat-item"><div class="stat-value">${stats.played}</div><div class="stat-label">Уен</div></div>
      <div class="stat-item"><div class="stat-value">${winPct}</div><div class="stat-label">% Җиңү</div></div>
      <div class="stat-item"><div class="stat-value">${stats.streak}</div><div class="stat-label">Эзлекле</div></div>
      <div class="stat-item"><div class="stat-value">${stats.maxStreak}</div><div class="stat-label">Максимум</div></div>
    `;

    const maxDist = Math.max(...stats.dist, 1);
    document.getElementById("stats-bars").innerHTML = stats.dist.map((count, i) => {
      const width = Math.max((count / maxDist) * 100, 8);
      const hl = gameOver && guesses.length === i + 1 ? " highlight" : "";
      return `<div class="bar-row"><div class="bar-label">${i + 1}</div><div class="bar${hl}" style="width:${width}%">${count}</div></div>`;
    }).join("");

    // Timer to next word
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const diff = tomorrow - now;
    const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    document.getElementById("stats-timer").innerHTML = `
      <div class="label">Киләсе сүзгә кадәр</div>
      <div class="time">${h}:${m}:${s}</div>
    `;

    // Share button
    const shareBtn = document.getElementById("btn-share");
    if (gameOver) {
      shareBtn.classList.remove("hidden");
      shareBtn.onclick = shareResult;
    } else {
      shareBtn.classList.add("hidden");
    }

    modalStats.classList.remove("hidden");
  }

  function shareResult() {
    const day = getDayNumber();
    const won = guesses[guesses.length - 1] === targetWord;
    const score = won ? `${guesses.length}/6` : "X/6";
    let text = `Сүзле #${day} ${score}\n\n`;

    for (const guess of guesses) {
      const result = evaluate(guess);
      text += result.map(r => r === "correct" ? "🟩" : r === "present" ? "🟨" : "⬛").join("") + "\n";
    }

    if (navigator.share) {
      navigator.share({ text });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast("Күчерелде!");
    }
  }

  // ============ Save/Load ============
  function saveState() {
    const state = {
      day: getDayNumber(),
      guesses,
      gameOver,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const state = JSON.parse(saved);
    if (state.day !== getDayNumber()) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    guesses = state.guesses || [];
    gameOver = state.gameOver || false;
    currentRow = guesses.length;

    // Rebuild letter statuses
    for (const guess of guesses) {
      const result = evaluate(guess);
      updateLetterStatuses(guess, result);
    }
    return true;
  }

  // ============ Physical keyboard ============
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (modalInfo.classList.contains("hidden") === false || modalStats.classList.contains("hidden") === false) return;

    if (e.key === "Enter") {
      handleKey("ENTER");
    } else if (e.key === "Backspace") {
      handleKey("⌫");
    } else if (e.key.length === 1) {
      handleKey(e.key.toLowerCase());
    }
  });

  // ============ Init ============
  function init() {
    createBoard();
    createKeyboard();

    const restored = loadState();
    if (restored) {
      updateBoard();
      updateKeyboard();
    }

    // Show info on first visit
    if (!localStorage.getItem("suzle_visited")) {
      setTimeout(() => modalInfo.classList.remove("hidden"), 500);
      localStorage.setItem("suzle_visited", "1");
    }

    // Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
    }
  }

  init();
})();
