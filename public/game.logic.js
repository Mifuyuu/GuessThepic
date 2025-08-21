let gameData = {
    randomReveals: 3,
    isActive: false,
    timer: null,
    timeLeft: 30,
    startTime: null
};

let playerTimer = {
    totalTime: 60, // 1 นาที
    timeRemaining: 60,
    isActive: false,
    timer: null
};

let currentImage = null;
let clicks = 0;
let userScore = 0;
let correctStreak = 0;
let mostStreak = 0;
let username = '';
let allImages = [];
let playedImages = [];

const statusDiv = document.getElementById('status');
const gameGridDiv = document.getElementById('game-grid');
const choicesDiv = document.getElementById('choices');
const startBtn = document.getElementById('start');

const playerUsernameSpan = document.getElementById('player-username');
const playerScoresSpan = document.getElementById('player-scores');
const timeLeftSpan = document.getElementById('time-left');
const streakSpan = document.getElementById('streak');
const mostStreakSpan = document.getElementById('most-streak');
const streakBtn = document.getElementById('streak-btn');
const pointsWrapper = document.getElementById('points-Wrapper');

// เพิ่ม element สำหรับเวลาผู้เล่น
const playerTimeLeftSpan = document.getElementById('player-time-left') || (() => {
    const span = document.createElement('span');
    span.id = 'player-time-left';
    span.textContent = '01:00';
    return span;
})();

const PENDING_PENALTY_KEY = 'pendingPenaltyScore';

// Helper functions for managing played images per user
function getPlayedImagesKey() {
    return `playedImages_${username}`;
}

// Player Timer Functions
function startPlayerTimer() {
    if (playerTimer.isActive) {
        return;
    }
    
    playerTimer.isActive = true;
    
    // อัพเดต display ทันทีที่เริ่ม timer
    updatePlayerTimeDisplay();
    
    playerTimer.timer = setInterval(() => {
        if (playerTimer.timeRemaining > 0) {
            playerTimer.timeRemaining--;
            updatePlayerTimeDisplay();
        } else {
            handlePlayerTimeUp();
        }
    }, 1000);
}

function stopPlayerTimer() {
    if (playerTimer.timer) {
        clearInterval(playerTimer.timer);
        playerTimer.timer = null;
        playerTimer.isActive = false;
    }
}

function updatePlayerTimeDisplay() {
    const minutes = Math.floor(playerTimer.timeRemaining / 60);
    const seconds = playerTimer.timeRemaining % 60;
    const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    if (playerTimeLeftSpan) {
        playerTimeLeftSpan.textContent = timeText;
        
        // เปลี่ยนสีเมื่อเวลาใกล้หมด
        if (playerTimer.timeRemaining <= 30) {
            playerTimeLeftSpan.style.color = '#ff4444';
        } else if (playerTimer.timeRemaining <= 60) {
            playerTimeLeftSpan.style.color = '#ffaa00';
        } else {
            playerTimeLeftSpan.style.color = '#fff';
        }
    }
}

async function handlePlayerTimeUp() {
    log('Player time is up!');
    stopPlayerTimer();
    gameData.isActive = false;
    clearInterval(gameData.timer);
    
    await Swal.fire({
        theme: "dark",
        title: "หมดเวลาแล้ว!",
        text: "เวลาของคุณหมดแล้ว ขอบคุณที่เล่นเกม GuessThePic!",
        icon: "info",
        timer: 3000,
        showConfirmButton: false,
        timerProgressBar: true
    });
    
    // ส่งไปหน้า leaderboard หลังจาก popup ปิด
    window.location.href = 'scoreboard.html';
}

async function initPlayerTimer() {
    try {
        // เริ่มจับเวลาจากเซิร์ฟเวอร์
        const token = localStorage.getItem('token');
        const response = await fetch('/api/start-game-timer', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            playerTimer.timeRemaining = data.timeRemaining;
            playerTimer.totalTime = data.totalGameTime;
            playerTimer.startTime = new Date(data.gameStartTime);
            
            log(`Player timer initialized: ${playerTimer.timeRemaining}s remaining`);
            
            if (playerTimer.timeRemaining > 0) {
                startPlayerTimer(); // เรียก startPlayerTimer ที่จะ updateDisplay เอง
            } else {
                handlePlayerTimeUp();
                return false;
            }
        } else {
            err('Failed to initialize player timer');
            return false;
        }
    } catch (error) {
        err('Error initializing player timer:', error);
        return false;
    }
    return true;
}

function loadPlayedImages() {
    try {
        const stored = localStorage.getItem(getPlayedImagesKey());
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        warn("Error loading played images:", error);
        return [];
    }
}

function savePlayedImages(images) {
    try {
        localStorage.setItem(getPlayedImagesKey(), JSON.stringify(images));
        log("Played images saved:", images);
    } catch (error) {
        err("Error saving played images:", error);
    }
}

function addPlayedImage(imagePath) {
    if (!playedImages.includes(imagePath)) {
        playedImages.push(imagePath);
        savePlayedImages(playedImages);
        log(`Added ${imagePath} to played images. Total played: ${playedImages.length}/${allImages.length}`);
    }
}

function resetPlayedImages() {
    playedImages = [];
    savePlayedImages(playedImages);
    log("Played images reset for new cycle");
}

function selectRandomImage() {
    if (!allImages || allImages.length === 0) {
        err("No images available for selection");
        return null;
    }

    // Get unplayed images
    const unplayedImages = allImages.filter(img => !playedImages.includes(img.path));
    
    // If all images have been played, reset and start new cycle
    if (unplayedImages.length === 0) {
        log("All images completed! Starting new cycle...");
        resetPlayedImages();
        return allImages[Math.floor(Math.random() * allImages.length)];
    }
    
    // Select from unplayed images (80% chance) or any image (20% chance)
    const useUnplayedOnly = Math.random() < 0.8;
    
    if (useUnplayedOnly) {
        const selectedImage = unplayedImages[Math.floor(Math.random() * unplayedImages.length)];
        log(`Selected unplayed image: ${selectedImage.path} (${unplayedImages.length} unplayed remaining)`);
        return selectedImage;
    } else {
        const selectedImage = allImages[Math.floor(Math.random() * allImages.length)];
        log(`Selected any image: ${selectedImage.path} (allowing replay)`);
        return selectedImage;
    }
}

startBtn.addEventListener('click', initGame);

// --- Debugging Functionality ---
const debug = false;
const prefix = "[DEBUG] ";

const log = (msg) => debug && console.log(prefix + msg);
const warn = (msg) => debug && console.warn(prefix + msg);
const err = (msg) => debug && console.error(prefix + msg);
// --- End Debugging Functionality ---



window.addEventListener('beforeunload', (event) => {

    if (gameData.isActive) {
        log("Game active during beforeunload. Preparing penalty data for localStorage.");

        const refreshPenalty = 100;
        const finalScoreOnRefresh = Math.max(userScore - refreshPenalty, 0);
        const finalCorrectStreakOnRefresh = 0;

        const currentMostStreak = mostStreak;

        const penaltyData = {
            username: username,
            score: finalScoreOnRefresh,
            correctStreak: finalCorrectStreakOnRefresh,
            mostStreak: currentMostStreak,
            timestamp: Date.now()
        };

        try {
            localStorage.setItem(PENDING_PENALTY_KEY, JSON.stringify(penaltyData));
            log("Penalty data saved to localStorage:", penaltyData);
        } catch (error) {
            err("Error saving penalty data to localStorage:", error);
        }
    }
});

window.addEventListener('load', async () => {
    const token = localStorage.getItem('token');
    const sessionUser = sessionStorage.getItem('username');

    if (!token || !sessionUser) {
        log('Game page: Token or username missing on load. Redirecting.');
        window.location.href = 'index.html';
        return;
    }

    username = sessionUser;
    playerUsernameSpan.textContent = username;
    statusDiv.textContent = 'Loading player data...';
    
    // Load played images for this user
    playedImages = loadPlayedImages();
    log(`Loaded ${playedImages.length} played images for user: ${username}`);

    const initialPlayerDataFetched = await fetchPlayerData();

    if (initialPlayerDataFetched) {
        statusDiv.style.display = 'none';
        startBtn.style.display = 'flex';
    } else {
         statusDiv.textContent = 'Error loading player data. Please try logging in again.';
         startBtn.style.display = 'none';
    }
});

async function onRest() {
    gameGridDiv.innerHTML = '';
    choicesDiv.innerHTML = '';
    statusDiv.textContent = '';
    startBtn.style.display = 'flex';
    timeLeftSpan.textContent = 'N/A';
    clearInterval(gameData.timer);
}

async function initGame(skipTimerInit = false) {
    log('Initializing game...');
    clicks = 0;

    statusDiv.style.display = 'flex';
    gameData.randomReveals = 5;
    gameData.timeLeft = 30;
    gameData.isActive = true;
    clearInterval(gameData.timer);
    startBtn.style.display = 'none';
    choicesDiv.innerHTML = '';
    gameGridDiv.innerHTML = '';
    statusDiv.textContent = 'Loading game data...';

    // เริ่มจับเวลาผู้เล่นเฉพาะเมื่อไม่ได้มาจาก popup
    if (!skipTimerInit) {
        // Fetch ข้อมูลผู้เล่นก่อน (เพื่อให้ได้ timeRemaining ที่ถูกต้อง)
        await fetchPlayerData();
        
        const timerInitialized = await initPlayerTimer();
        if (!timerInitialized) {
            // ถ้าไม่สามารถเริ่มจับเวลาได้ (เวลาหมดแล้ว) ให้ redirect ไป leaderboard
            return;
        }
    }

    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`Failed to load data.json: ${response.statusText}`);
        }
        const images = await response.json();
        if (!images || images.length === 0) {
             throw new Error('No images found in data.json');
        }
        
        // Store all images and select one using smart selection
        allImages = images;
        currentImage = selectRandomImage();
        
        if (!currentImage) {
            throw new Error('Failed to select an image');
        }
        
        // Add this image to played list
        addPlayedImage(currentImage.path);

        if (currentImage && currentImage.questions) {
            statusDiv.textContent = currentImage.questions;
        } else {
            statusDiv.textContent = "Question not available.";
        }

        await renderGrid();
        renderChoices();
        renderRandomRevealButton();
        updateSideMenuUI();
        startTimer();
        gameData.startTime = Date.now();

    } catch (error) {
        err('Error during game initialization:', error);
        statusDiv.textContent = `Error loading game: ${error.message}. Please refresh.`;
        gameGridDiv.innerHTML = '';
        choicesDiv.innerHTML = '';
        gameData.isActive = false;
        clearInterval(gameData.timer);
    }
}

async function fetchPlayerData() {
    const token = localStorage.getItem('token');
    if (!token || !username) {
        err("fetchPlayerData: Missing token or username.");
        return false;
    }

    log(`Fetching player data for: ${username}`);
    try {
        const response = await fetch(`/api/player/me`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data && typeof data.score !== 'undefined' && typeof data.correctStreak !== 'undefined' && typeof data.mostStreak !== 'undefined') {
                userScore = data.score;
                correctStreak = data.correctStreak;
                mostStreak = data.mostStreak;
                
                // อัปเดตเวลาผู้เล่น
                if (data.timeRemaining !== undefined) {
                    playerTimer.timeRemaining = data.timeRemaining;
                    playerTimer.totalTime = data.totalGameTime || 60;
                    if (data.gameStartTime) {
                        playerTimer.startTime = new Date(data.gameStartTime);
                    }
                }

                playerScoresSpan.textContent = userScore;
                streakSpan.textContent = correctStreak;
                mostStreakSpan.textContent = mostStreak;
                
                // อัปเดต time display เฉพาะเมื่อ timer กำลังทำงานอยู่
                if (playerTimer.isActive) {
                    updatePlayerTimeDisplay();
                }

                updateSideMenuUI();

                log('Player data fetched and UI updated:', { userScore, correctStreak, mostStreak, timeRemaining: playerTimer.timeRemaining });
                return true;
            } else {
                 err('Invalid player data received:', data);
                 return false;
            }
        } else {
            if (response.status === 401 || response.status === 403) {
                err('Authentication failed (401/403). Redirecting...');
                localStorage.removeItem('token');
                sessionStorage.removeItem('username');
                window.location.href = 'index.html';
            } else {
                const errorText = await response.text();
                err(`Failed to fetch player data (${response.status}):`, errorText);
            }
            return false;
        }
    } catch (error) {
        err('Network or other error fetching player data:', error);
        return false;
    }
}

function updateSideMenuUI() {

    const minutes = Math.floor(gameData.timeLeft / 60);
    const seconds = gameData.timeLeft % 60;
    if (gameData.isActive) {
        timeLeftSpan.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        timeLeftSpan.textContent = 'N/A';
    }
    
    // playerScoresSpan.textContent = userScore;
    streakSpan.textContent = correctStreak;
    mostStreakSpan.textContent = mostStreak;
    playerUsernameSpan.textContent = username;

    if (streakBtn && pointsWrapper) {
        if (correctStreak > 1) {
            streakBtn.classList.remove('normal');
            streakBtn.classList.add('special');
            pointsWrapper.style.display = 'block';
        } else {
            streakBtn.classList.remove('special');
            streakBtn.classList.add('normal');
            pointsWrapper.style.display = 'none';
        }
    } else {
         warn("Not found streak button or points wrapper for modification.");
    }
}

function handleAnswer(selectedIndex) {
    if (!gameData.isActive || typeof selectedIndex !== 'number' || isNaN(selectedIndex)) {
        return;
    }

    gameData.isActive = false;
    clearInterval(gameData.timer);
    
    // หยุด player timer เมื่อกดตอบ
    stopPlayerTimer();

    // เปิดช่องทั้งหมดก่อนแสดงผลลัพธ์
    revealAllTiles();

    // รอ 1 วินาทีเพื่อให้ผู้เล่นมองเห็นภาพเต็มก่อนแสดงผลลัพธ์
    setTimeout(() => {
        showGameResult(selectedIndex);
    }, 1000);
}

function showGameResult(selectedIndex) {
    const baseScoreCorrect = 100;
    const penaltyWrong = 100;

    // ตรวจสอบให้แน่ใจว่า player timer หยุดแล้ว
    stopPlayerTimer();

    let finalScore = userScore;
    let pointsChange = 0;
    let message = '';

    if (selectedIndex === currentImage.correct) {

        correctStreak++;
        if (correctStreak > mostStreak) {
            mostStreak = correctStreak;
        }
        const scoreMultiplier = 1 + (0.1 * correctStreak);
        const timeBonusMultiplier = 1 + (0.1 * Math.floor(gameData.timeLeft / 5));
        const totalMultiplier = scoreMultiplier * timeBonusMultiplier;
        pointsChange = Math.round(baseScoreCorrect * totalMultiplier);
        bonusPoints = pointsChange - baseScoreCorrect;
        finalScore = userScore + pointsChange;

        var count = 100;
        var defaults = {
        origin: { y: 0.8 },
        zIndex: 9999
        };

        function fire(particleRatio, opts) {
        confetti({
            ...defaults,
            ...opts,
            particleCount: Math.floor(count * particleRatio)
        });
        }

        fire(0.25, {
        spread: 26,
        startVelocity: 55,
        });
        fire(0.2, {
        spread: 60,
        });
        fire(0.35, {
        spread: 100,
        decay: 0.91,
        scalar: 0.8
        });
        fire(0.1, {
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2
        });
        fire(0.1, {
        spread: 120,
        startVelocity: 45,
        });

        Swal.fire({
            theme: "dark",
            title: "YOU WIN!",
            text: `🎉 ยินดีด้วย! คุณตอบถูก! +${pointsChange}(+${bonusPoints} Bonus) คะแนน`,
            icon: "success",
            timer: 2000,
            showConfirmButton: false,
            timerProgressBar: true
        }).then(() => {
            // เริ่มเกมใหม่ก่อน แล้วค่อยเริ่ม player timer
            initGame(true); // skip timer init เพราะเราจะเริ่มเองแล้ว
            startPlayerTimer();
        });

        message = `🎉 Correct! +${pointsChange} Points`;
        log(message, `New Total: ${finalScore}, Streak: ${correctStreak}`);

    } else {

        correctStreak = 0;
        pointsChange = -penaltyWrong;
        finalScore = Math.max(userScore + pointsChange, 0);

        Swal.fire({
            theme: "dark",
            title: "YOU LOSE!",
            text: `💩 เสียใจด้วยคุณตอบผิดนะ -${penaltyWrong} คะแนน\nคำตอบที่ถูกคือ: ${currentImage.choices[currentImage.correct]}`,
            icon: "error",
            timer: 2000,
            showConfirmButton: false,
            timerProgressBar: true
        }).then(() => {
            // เริ่มเกมใหม่ก่อน แล้วค่อยเริ่ม player timer
            initGame(true); // skip timer init เพราะเราจะเริ่มเองแล้ว
            startPlayerTimer();
        });

        message = `❌ Wrong! -${penaltyWrong} Points. Correct: ${currentImage.choices[currentImage.correct]}`;
        log(message, `New Total: ${finalScore}, Streak: 0`);
    }

    userScore = finalScore;
    playerScoresSpan.textContent = userScore;
    streakSpan.textContent = correctStreak;
    mostStreakSpan.textContent = mostStreak;

    updateSideMenuUI();
    saveScoreToServer(userScore, correctStreak, mostStreak);
}

async function saveScoreToServer(finalScoreToSave, currentCorrectStreak, currentMostStreak) {
    const token = localStorage.getItem('token');
    log('Attempting to save score:', { finalScoreToSave, currentCorrectStreak, currentMostStreak });

    if (!token || !username) {
        err('Cannot save score: Missing token or username.');
        return;
    }

    try {
        const response = await fetch(`/api/scores`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                score: finalScoreToSave,
                correctStreak: currentCorrectStreak,
                mostStreak: currentMostStreak
            })
        });

        const responseData = await response.json();
        if (response.ok) {
            log('Score saved successfully:', responseData);
        } else {
            err(`Failed to save score (${response.status}):`, responseData.message || response.statusText);
        }
    } catch (error) {
        err('Network error saving score:', error);
    }
}

function startTimer() {
    clearInterval(gameData.timer);
    timeLeftSpan.textContent = '00:30';
    gameData.timer = setInterval(() => {
        if (gameData.timeLeft > 0 && gameData.isActive) {
            gameData.timeLeft--;
            updateSideMenuUI();
        } else if (gameData.isActive) {
            clearInterval(gameData.timer);
            handleTimeout();
        } else {
             clearInterval(gameData.timer);
        }
    }, 1000);
}

function handleTimeout() {
    if (!gameData.isActive) return;
    gameData.isActive = false;
    
    // หยุด player timer เมื่อหมดเวลา
    stopPlayerTimer();

    log("Time's up!");
    
    // เปิดช่องทั้งหมดก่อนแสดงผลลัพธ์
    revealAllTiles();

    // รอ 1 วินาทีเพื่อให้ผู้เล่นมองเห็นภาพเต็มก่อนแสดงผลลัพธ์
    setTimeout(() => {
        showTimeoutResult();
    }, 1000);
}

function showTimeoutResult() {
    const timeOutPenalty = 100;
    correctStreak = 0;

    // ตรวจสอบให้แน่ใจว่า player timer หยุดแล้ว
    stopPlayerTimer();

    let finalScore = Math.max(userScore - timeOutPenalty, 0);

    userScore = finalScore;
    playerScoresSpan.textContent = userScore;
    streakSpan.textContent = correctStreak;

    updateSideMenuUI();

    Swal.fire({
        theme: "dark",
        title: "TIME 'S UP!",
        text: `⏳ เสียใจด้วย หมดเวลาแล้วนะ -${timeOutPenalty} คะแนน\nคำตอบที่ถูกคือ: ${currentImage.choices[currentImage.correct]}`,
        icon: "error",
        timer: 2000,
        showConfirmButton: false,
        timerProgressBar: true
    }).then(() => {
        // เริ่มเกมใหม่ก่อน แล้วค่อยเริ่ม player timer
        initGame(true); // skip timer init เพราะเราจะเริ่มเองแล้ว
        startPlayerTimer();
    });

    log(`⏳ Time's up! -${timeOutPenalty} Points. New Total: ${finalScore}. Correct was: ${currentImage.choices[currentImage.correct]}`);
    saveScoreToServer(userScore, correctStreak, mostStreak);
}

function revealAllTiles() {
    document.querySelectorAll('.tile-cover').forEach(cover => {
        if (cover) {
           cover.style.opacity = '0';
           cover.style.cursor = 'default';
        }
    });

    const revealBtn = choicesDiv.querySelector('#random-reveal-btn');
    if(revealBtn) revealBtn.disabled = true;
    
    const answerSelect = choicesDiv.querySelector('#answer-select');
    if(answerSelect) answerSelect.disabled = true;
}

async function renderGrid() {
    const grid = document.getElementById('game-grid');
    grid.innerHTML = '';
    grid.style.backgroundImage = '';

    if (!currentImage || !currentImage.path) {
        err("Cannot render grid: currentImage data is missing.");
        grid.textContent = "Error loading image data.";
        return;
    }

    let tileWidth = 100;
    let tileHeight = 100;
    let gap = 10;
    let borderWidth = 2;

    const tempTile = document.createElement('div');
    tempTile.className = 'tile';
    tempTile.style.visibility = 'hidden';
    grid.appendChild(tempTile);

    try {
        const tileStyle = window.getComputedStyle(tempTile);
        tileWidth = parseFloat(tileStyle.width) || tileWidth;
        tileHeight = parseFloat(tileStyle.height) || tileHeight;
        borderWidth = parseFloat(tileStyle.borderLeftWidth) || borderWidth;

        const gridStyle = window.getComputedStyle(grid);
        const gapValues = gridStyle.gap.split(' ');
        gap = parseFloat(gapValues[0]) || gap;

    } catch (e) {
        warn("Could not compute styles, using default values.", e);
    } finally {
        grid.removeChild(tempTile);
    }

    const numCols = 5;
    const numRows = 5;

    const actualTileWidth = tileWidth;
    const actualTileHeight = tileHeight;

    const horizontalStep = actualTileWidth + gap;
    const verticalStep = actualTileHeight + gap;

    const totalBgWidth = (numCols * actualTileWidth) + ((numCols - 1) * gap);
    const totalBgHeight = (numRows * actualTileHeight) + ((numRows - 1) * gap);
    const backgroundSize = `${totalBgWidth}px ${totalBgHeight}px`;

    log(`Computed Grid Params: Tile(${tileWidth}x${tileHeight}), Border(${borderWidth}), Gap(${gap})`);
    log(`Steps: H=${horizontalStep}, V=${verticalStep}. BG Size: ${backgroundSize}`);

    for (let i = 0; i < numCols * numRows; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        // tile.style.cursor = 'pointer';

        const imgDiv = document.createElement('div');
        imgDiv.className = 'tile-img';
        imgDiv.style.backgroundImage = `url('${currentImage.path}')`;
        imgDiv.style.backgroundSize = backgroundSize;

        const row = Math.floor(i / numCols);
        const col = i % numCols;

        const backgroundPosX = -col * horizontalStep;
        const backgroundPosY = -row * verticalStep;
        imgDiv.style.backgroundPosition = `${backgroundPosX}px ${backgroundPosY}px`;

        const cover = document.createElement('div');
        cover.className = 'tile-cover';
        cover.style.opacity = '1';
        // cover.addEventListener('click', () => handleTileClick(cover), { once: true });
        tile.appendChild(imgDiv);
        tile.appendChild(cover);
        grid.appendChild(tile);
    }
}

function handleTileClick(coverElement) {
    if (coverElement.style.opacity === '0') {
        return;
    }
    coverElement.style.opacity = '0';
    coverElement.style.cursor = 'default';
    clicks++;
    log('Tile clicked, total clicks:', clicks);
}

function renderChoices() {
    choicesDiv.innerHTML = '';

    // สร้าง container สำหรับปุ่มตอบ
    const choiceButtonsContainer = document.createElement('div');
    choiceButtonsContainer.className = 'choice-buttons-container';
    choiceButtonsContainer.style.cssText = `
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        justify-content: center;
        flex-wrap: wrap;
    `;

    // สี่สีสำหรับปุ่ม: แดง, เหลือง, ฟ้า, เขียว
    const buttonColors = ['#e73c3cff', '#ff9d00ff', '#3687f1ff', '#7f3affff'];
    const buttonLabels = ['A', 'B', 'C', 'D'];

    // สับเปลี่ยนคำตอบ
    const shuffledChoices = [...currentImage.choices];
    for (let i = shuffledChoices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledChoices[i], shuffledChoices[j]] = [shuffledChoices[j], shuffledChoices[i]];
    }

    shuffledChoices.forEach((choiceText, index) => {
        const originalIndex = currentImage.choices.indexOf(choiceText);
        const button = document.createElement('button');
        
        button.className = 'choice-button';
        button.innerHTML = `<strong>${buttonLabels[index]}:</strong> ${choiceText}`;
        button.disabled = !gameData.isActive;
        
        // กำหนดสไตล์ปุ่ม
        button.style.cssText = `
            background-color: ${buttonColors[index]};
            color: white;
            border: none;
            padding: 15px 20px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            text-align: center;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            flex: 1;
            min-width: 200px;
            max-width: 250px;
        `;
        
        // เพิ่ม hover effect
        button.addEventListener('mouseenter', () => {
            if (!button.disabled) {
                button.style.transform = 'translateY(-2px)';
                button.style.boxShadow = '0 6px 12px rgba(0,0,0,0.3)';
            }
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        });
        
        button.addEventListener('click', () => {
            if (gameData.isActive) {
                handleAnswer(originalIndex);
                // ปิดการใช้งานปุ่มทั้งหมด
                document.querySelectorAll('.choice-button').forEach(btn => btn.disabled = true);
            }
        });
        
        choiceButtonsContainer.appendChild(button);
    });

    choicesDiv.appendChild(choiceButtonsContainer);
}

function renderRandomRevealButton() {
    let revealBtn = document.querySelector('#random-reveal-btn');

    if (!revealBtn) {
        revealBtn = document.createElement('button');
        revealBtn.id = 'random-reveal-btn';
        revealBtn.className = 'btn btn-reveal';
        
        // เพิ่มปุ่มลงใน container เดียวกับปุ่มตอบ
        const choiceContainer = document.querySelector('.choice-buttons-container');
        if (choiceContainer) {
            choiceContainer.appendChild(revealBtn);
        } else {
            choicesDiv.appendChild(revealBtn);
        }
        
        revealBtn.addEventListener('click', handleRandomReveal);
    } else {
        const newBtn = revealBtn.cloneNode(true);
        revealBtn.parentNode.replaceChild(newBtn, revealBtn);
        newBtn.addEventListener('click', handleRandomReveal);
        revealBtn = newBtn;
    }

    // สไตล์ปุ่มสีม่วงในแถวเดียวกัน
    revealBtn.style.cssText = `
        background-color: #2e9dbbff;
        color: white;
        border: none;
        padding: 15px 20px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
        text-align: center;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        flex: 1;
        min-width: 200px;
        max-width: 250px;
    `;
    
    // เพิ่ม hover effect
    revealBtn.addEventListener('mouseenter', () => {
        if (!revealBtn.disabled) {
            revealBtn.style.backgroundColor = '#8e44ad';
            revealBtn.style.transform = 'translateY(-2px)';
            revealBtn.style.boxShadow = '0 6px 12px rgba(0,0,0,0.3)';
        }
    });
    
    revealBtn.addEventListener('mouseleave', () => {
        if (!revealBtn.disabled) {
            revealBtn.style.backgroundColor = '#9b59b6';
        }
        revealBtn.style.transform = 'translateY(0)';
        revealBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    });

    revealBtn.innerHTML = `<i class="fa-solid fa-puzzle-piece"></i> สุ่มเปิดช่อง (${gameData.randomReveals})`;
    revealBtn.disabled = (gameData.randomReveals <= 0 || !gameData.isActive);
    
    if (revealBtn.disabled) {
        revealBtn.style.backgroundColor = '#95a5a6';
        revealBtn.style.cursor = 'not-allowed';
    }
}

function handleRandomReveal() {
    if (gameData.randomReveals <= 0 || !gameData.isActive) return;

    const hiddenTiles = document.querySelectorAll('.tile-cover[style*="opacity: 1"]');

    if (hiddenTiles.length > 0) {
        const randomIndex = Math.floor(Math.random() * hiddenTiles.length);
        const randomCover = hiddenTiles[randomIndex];

        handleTileClick(randomCover);

        gameData.randomReveals--;

       renderRandomRevealButton();
       // updateSideMenuUI();
    } else {
         log("No more tiles to reveal.");
         const revealBtn = choicesDiv.querySelector('#random-reveal-btn');
         if(revealBtn) revealBtn.disabled = true;
    }
}
