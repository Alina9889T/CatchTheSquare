const tg = window.Telegram.WebApp;
const user = tg.initDataUnsafe.user;
const LEVEL_DURATION = 10;
const MOVEMENT_INTERVAL = 2000;
const RESULT_DELAY = 500;
const USER_LOAD_TIMEOUT = 8000;
const levels = [
    { classes: ["level1"], hasCircle: false, moving: false, pulsing: false },
    { classes: ["level2"], hasCircle: true, moving: false, pulsing: false },
    { classes: ["level3", "pulse"], hasCircle: false, moving: true, pulsing: true },
    { classes: ["level4", "pulse"], hasCircle: true, moving: true, pulsing: true }
];
const gameState = {
    level: -1,
    levelScore: 0,
    totalScore: 0,
    bestScore: 0,
    timeLeft: LEVEL_DURATION,
    running: false,
    paused: false
};
const timers = { countdown: null, movement: null, result: null };
const gameElements = {
    gameArea: document.getElementById("game-area"),
    square: document.getElementById("square"),
    circle: document.getElementById("circle"),
    level: document.getElementById("level-stat"),
    levelScore: document.getElementById("level-score-stat"),
    totalScore: document.getElementById("total-score-stat"),
    bestScore: document.getElementById("best-score-stat"),
    time: document.getElementById("time-stat"),
    startButton: document.getElementById("start-button"),
    nextButton: document.getElementById("next-button"),
    restartButton: document.getElementById("restart-button"),
    gameProcess: document.getElementById("game-process"),
    levelCompleted: document.getElementById("level-completed"),
    gameOver: document.getElementById("game-over"),
    levelResult: document.getElementById("level-score"),
    finalScore: document.getElementById("final-score"),
    settingsButton: document.getElementById("user-settings-button")
};
const settingsElements = {
    dialog: document.getElementById("user-settings"),
    themeToggle: document.getElementById("theme-toggle"),
    restartLevelButton: document.getElementById("restart-level-button"),
    restartGameButton: document.getElementById("restart-game-button")
};
let themeSaveQueue = Promise.resolve();
let themeChanged = false;
let userReady;

// API
async function apiRequest(path, { data, signal, allowNotFound = false } = {}) {
    const options = { signal, headers: { "X-Telegram-Init-Data": tg.initData || "" } };
    if (data !== undefined) {
        options.method = "POST";
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(data);
    }
    const response = await fetch(path, options);
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) throw new Error(`Request to ${path} failed (${response.status})`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

function getUser(signal) {
    return apiRequest(`/api/user/${user.id}`, { signal, allowNotFound: true });
}

function saveUser(signal) {
    return apiRequest("/api/user", {
        data: { id: user.id, username: user.username ?? null }, signal
    });
}

function saveScore(bestScore) {
    return apiRequest("/api/score", { data: { id: user.id, bestScore } });
}

function saveTheme(theme) {
    return apiRequest("/api/theme", { data: { id: user.id, theme } });
}

async function loadUser(signal) {
    if (!user) return;
    const savedUser = await getUser(signal);
    if (savedUser) {
        gameState.bestScore = savedUser.bestScore;
        renderBestScore();
        if (!themeChanged) applyTheme(savedUser.theme);
    }
    if (!savedUser || (savedUser.username ?? null) !== (user.username ?? null)) {
        await saveUser(signal);
    }
}

// User settings
function applyTheme(theme) {
    document.body.dataset.theme = theme === "light" ? "light" : "dark";
    settingsElements.themeToggle.checked = document.body.dataset.theme === "dark";
}

function handleThemeChange(event) {
    const theme = event.target.checked ? "dark" : "light";
    themeChanged = true;
    applyTheme(theme);
    if (!user) return;
    themeSaveQueue = themeSaveQueue.then(async () => {
        await userReady;
        await saveTheme(theme);
    }).catch(error => console.error("Failed to save the theme preference:", error));
}

function openSettings() {
    settingsElements.dialog.showModal();
    if (!gameState.running) return;
    gameState.paused = true;
    gameState.running = false;
    stopTimers();
    gameElements.square.style.animationPlayState = "paused";
    gameElements.circle.style.animationPlayState = "paused";
}

function handleSettingsClose() {
    if (gameState.paused) {
        gameState.paused = false;
        gameState.running = true;
        gameElements.square.style.animationPlayState = "";
        gameElements.circle.style.animationPlayState = "";
        timers.countdown = setInterval(tick, 1000);
        restartMovementTimer();
    }
    gameElements.settingsButton.focus();
}
function closeSettingsOnBackdrop(event) {
    const bounds = settingsElements.dialog.getBoundingClientRect();
    if (event.target === settingsElements.dialog &&
        (event.clientX < bounds.left || event.clientX > bounds.right ||
         event.clientY < bounds.top || event.clientY > bounds.bottom)) {
        settingsElements.dialog.close();
    }
}

// Shapes
function positionElement(element, xRatio, yRatio) {
    const maxX = gameElements.gameArea.clientWidth - element.offsetWidth;
    const maxY = gameElements.gameArea.clientHeight - element.offsetHeight;
    element.style.left = `${maxX * xRatio}px`;
    element.style.top = `${maxY * yRatio}px`;
}

function moveElement(element) {
    positionElement(element, Math.random(), Math.random());
}

function positionShapes() {
    positionElement(gameElements.square, 0.5, 0.5);
    positionElement(gameElements.circle, 0.75, 0.25);
}

function moveShapes() {
    moveElement(gameElements.square);
    moveElement(gameElements.circle);
}

function restartAnimation(element, className) {
    element.classList.remove(className);
    // Force layout to restart the animation on every click.
    void element.offsetWidth;
    element.classList.add(className);
}

function handleSquareClick() {
    if (!gameState.running) return;
    gameState.levelScore++;
    gameState.totalScore++;
    renderScores();
    restartMovementTimer();
    tg.HapticFeedback.impactOccurred("light");
    restartAnimation(gameElements.square, "hit");
    if (levels[gameState.level].pulsing) {
        restartAnimation(gameElements.square, "pulse");
        restartAnimation(gameElements.circle, "pulse");
    }
    moveShapes();
}

function handleCircleClick() {
    if (!gameState.running) return;
    tg.HapticFeedback.notificationOccurred("error");
}

// Timers
function stopTimers() {
    clearInterval(timers.countdown);
    clearInterval(timers.movement);
    clearTimeout(timers.result);
    timers.countdown = null;
    timers.movement = null;
    timers.result = null;
}

function restartMovementTimer() {
    clearInterval(timers.movement);
    timers.movement = null;
    if (gameState.running && levels[gameState.level].moving) {
        timers.movement = setInterval(moveShapes, MOVEMENT_INTERVAL);
    }
}

function tick() {
    if (!gameState.running) return;
    gameState.timeLeft--;
    gameElements.time.textContent = gameState.timeLeft;
    gameElements.time.classList.toggle("warning", gameState.timeLeft <= 3 && gameState.timeLeft > 0);
    if (gameState.timeLeft <= 0) {
        if (gameState.level === levels.length - 1) endGame();
        else endLevel();
    }
}

// Game lifecycle
function renderScores() {
    gameElements.levelScore.textContent = gameState.levelScore;
    gameElements.totalScore.textContent = gameState.totalScore;
}

function renderBestScore() {
    gameElements.bestScore.textContent = "🏆" + gameState.bestScore;
}

function resetGame() {
    stopTimers();
    gameState.paused = false;
    gameElements.square.style.animationPlayState = "";
    gameElements.circle.style.animationPlayState = "";
    gameState.level = -1;
    gameState.levelScore = 0;
    gameState.totalScore = 0;
    gameState.timeLeft = LEVEL_DURATION;
    gameState.running = false;
    gameElements.level.textContent = 1;
    gameElements.time.textContent = gameState.timeLeft;
    gameElements.levelResult.textContent = 0;
    gameElements.finalScore.textContent = 0;
    renderScores();
    renderBestScore();
    gameElements.square.className = "level1 disabled";
    gameElements.circle.className = "hidden";
    gameElements.time.classList.remove("warning");
    gameElements.levelCompleted.classList.add("hidden");
    gameElements.gameOver.classList.add("hidden");
    gameElements.gameProcess.classList.add("hidden");
    gameElements.startButton.classList.remove("hidden");
    positionShapes();
}

function startGame() {
    resetGame();
    nextLevel();
}

function nextLevel() {
    if (gameState.level + 1 >= levels.length) return;
    stopTimers();
    gameState.level++;
    gameState.running = true;
    gameState.levelScore = 0;
    gameState.timeLeft = LEVEL_DURATION;
    const config = levels[gameState.level];
    gameElements.level.textContent = gameState.level + 1;
    gameElements.time.textContent = gameState.timeLeft;
    renderScores();
    gameElements.square.className = config.classes.join(" ");
    gameElements.circle.className = config.hasCircle ? config.classes.join(" ") : "hidden";
    gameElements.time.classList.remove("warning");
    gameElements.startButton.classList.add("hidden");
    gameElements.gameProcess.classList.remove("hidden");
    gameElements.levelCompleted.classList.add("hidden");
    gameElements.gameOver.classList.add("hidden");
    positionShapes();
    timers.countdown = setInterval(tick, 1000);
    restartMovementTimer();
}

function resetLevel() {
    if (gameState.level < 0) return;
    gameState.paused = false;
    gameElements.square.style.animationPlayState = "";
    gameElements.circle.style.animationPlayState = "";
    gameState.totalScore -= gameState.levelScore;
    // Reuse level initialization without advancing to the next level.
    gameState.level--;
    nextLevel();
}

function stopLevel() {
    gameState.running = false;
    stopTimers();
    gameElements.square.classList.add("disabled");
    gameElements.circle.classList.add("disabled");
    gameElements.time.classList.remove("warning");
}

function showResult(element) {
    timers.result = setTimeout(() => {
        element.classList.remove("hidden");
        timers.result = null;
    }, RESULT_DELAY);
}

function endLevel() {
    stopLevel();
    gameElements.levelResult.textContent = gameState.levelScore;
    showResult(gameElements.levelCompleted);
}

function endGame() {
    stopLevel();
    gameElements.finalScore.textContent = gameState.totalScore;
    showResult(gameElements.gameOver);
    if (gameState.totalScore > gameState.bestScore) {
        gameState.bestScore = gameState.totalScore;
        renderBestScore();
        if (user) {
            saveScore(gameState.bestScore)
                .catch(error => console.error("Failed to save the best score:", error));
        }
    }
}

// Initialization
function registerEvents() {
    gameElements.square.addEventListener("click", handleSquareClick);
    gameElements.circle.addEventListener("click", handleCircleClick);
    gameElements.startButton.addEventListener("click", startGame);
    gameElements.nextButton.addEventListener("click", nextLevel);
    gameElements.restartButton.addEventListener("click", resetGame);
    gameElements.settingsButton.addEventListener("click", openSettings);
    settingsElements.dialog.addEventListener("close", handleSettingsClose);
    settingsElements.dialog.addEventListener("click", closeSettingsOnBackdrop);
    settingsElements.themeToggle.addEventListener("change", handleThemeChange);
    settingsElements.restartLevelButton.addEventListener("click", () => { settingsElements.dialog.close(); resetLevel(); });
    settingsElements.restartGameButton.addEventListener("click", () => { settingsElements.dialog.close(); resetGame(); });
}

async function init() {
    tg.expand();
    applyTheme("dark");
    resetGame();
    registerEvents();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), USER_LOAD_TIMEOUT);
    userReady = loadUser(controller.signal);
    try {
        await userReady;
    } catch (error) {
        console.error("Failed to load the user:", error);
    } finally {
        clearTimeout(timeout);
        document.body.classList.remove("theme-loading");
        document.body.removeAttribute("aria-busy");
        tg.ready();
    }
}

init();