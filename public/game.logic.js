let gameData = {
    randomReveals: 3,
    isActive: false,
    timer: null,
    timeLeft: 30,
    startTime: null
};

let currentImage = null;
let clicks = 0;
let userScore = 0;
let correctStreak = 0;
let mostStreak = 0;
let username = '';

const statusDiv = document.getElementById('status');
const gameGridDiv = document.getElementById('game-grid');
const choicesDiv = document.getElementById('choices');
const signoutBtn = document.getElementById('signout-btn');
const startBtn = document.getElementById('start');

const playerUsernameSpan = document.getElementById('player-username');
const playerScoresSpan = document.getElementById('player-scores');
const timeLeftSpan = document.getElementById('time-left');
const streakSpan = document.getElementById('streak');
const mostStreakSpan = document.getElementById('most-streak');
const LeaderboardBtn = document.getElementById('leaderboad-btn');
const streakBtn = document.getElementById('streak-btn');
const pointsWrapper = document.getElementById('points-Wrapper');

const PENDING_PENALTY_KEY = 'pendingPenaltyScore';

startBtn.addEventListener('click', initGame);

// --- Debugging Functionality ---
const debug = false;
const prefix = "[DEBUG] ";

const log = (msg) => debug && console.log(prefix + msg);
const warn = (msg) => debug && console.warn(prefix + msg);
const err = (msg) => debug && console.error(prefix + msg);
// --- End Debugging Functionality ---

signoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('username');
    window.location.href = 'index.html';
});

LeaderboardBtn.addEventListener('click', () => {
    window.location.href = 'scoreboard.html';
});

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

    const initialPlayerDataFetched = await fetchPlayerData();

    if (initialPlayerDataFetched) {
        try {
            const storedPenaltyDataString = localStorage.getItem(PENDING_PENALTY_KEY);
            if (storedPenaltyDataString) {
                log("Found pending penalty data in localStorage.");
                const parsedPenaltyData = JSON.parse(storedPenaltyDataString);

                if (parsedPenaltyData && parsedPenaltyData.username === username) {
                    log("Pending penalty data matches current user. Sending to server...");

                    const response = await fetch('/api/scores', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            score: parsedPenaltyData.score,
                            correctStreak: parsedPenaltyData.correctStreak,
                            mostStreak: parsedPenaltyData.mostStreak
                        })
                    });

                    if (response.ok) {
                        log("Pending penalty score sent and processed successfully by server.");
                        await fetchPlayerData();
                    } else {
                        const errorData = await response.text();
                        err(`Failed to send pending penalty score (${response.status}):`, errorData);
                    }

                    localStorage.removeItem(PENDING_PENALTY_KEY); 
                    log("Removed pending penalty data from localStorage."); 

                } else if (parsedPenaltyData) {
                    warn("Pending penalty data username mismatch. Discarding.");
                    localStorage.removeItem(PENDING_PENALTY_KEY);
                } else {
                     err("Invalid pending penalty data found. Discarding.");
                     localStorage.removeItem(PENDING_PENALTY_KEY);
                }
            }
        } catch (error) {
            err("Error processing pending penalty data from localStorage:", error);
            localStorage.removeItem(PENDING_PENALTY_KEY);
        }
    }

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

async function initGame() {
    log('Initializing game...');
    clicks = 0;

    statusDiv.style.display = 'flex';
    gameData.randomReveals = 3;
    gameData.timeLeft = 30;
    gameData.isActive = true;
    clearInterval(gameData.timer);
    startBtn.style.display = 'none';
    choicesDiv.innerHTML = '';
    gameGridDiv.innerHTML = '';
    statusDiv.textContent = 'Loading game data...';

    fetchPlayerData();

    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`Failed to load data.json: ${response.statusText}`);
        }
        const images = await response.json();
        if (!images || images.length === 0) {
             throw new Error('No images found in data.json');
        }
        currentImage = images[Math.floor(Math.random() * images.length)];

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

                playerScoresSpan.textContent = userScore;
                streakSpan.textContent = correctStreak;
                mostStreakSpan.textContent = mostStreak;

                updateSideMenuUI();

                log('Player data fetched and UI updated:', { userScore, correctStreak, mostStreak });
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

    const baseScoreCorrect = 100;
    // const timeBonus = gameData.timeLeft >= 25 ? 75 : gameData.timeLeft >= 20 ? 50 : gameData.timeLeft >= 15 ? 25 : gameData.timeLeft >= 10 ? 10 : 0;
    const penaltyWrong = 100;

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
        // pointsChange = Math.round((baseScoreCorrect + timeBonus) * scoreMultiplier);
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
            showCancelButton: true,
            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",
            confirmButtonText: "Play Again"
        }).then((result) => {
            if (result.isConfirmed) {
              initGame();
            }
            if (result.isDismissed) {
              onRest();
            }
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
            text: `💩 เสียใจด้วยคุณตอบผิดนะ -${penaltyWrong} คะแนน`,
            icon: "error",
            showCancelButton: true,
            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",
            confirmButtonText: "Play Again"
        }).then((result) => {
            if (result.isConfirmed) {
              initGame();
            }
            if (result.isDismissed) {
                onRest();
            }
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
    revealAllTiles();
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

    log("Time's up!");
    const timeOutPenalty = 100;
    correctStreak = 0;

    let finalScore = Math.max(userScore - timeOutPenalty, 0);

    userScore = finalScore;
    playerScoresSpan.textContent = userScore;
    streakSpan.textContent = correctStreak;

    updateSideMenuUI();

    Swal.fire({
        theme: "dark",
        title: "TIME 'S UP!",
        text: `⏳ เสียใจด้วย หมดเวลาแล้วนะ -${timeOutPenalty} คะแนน`,
        icon: "error",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Play Again"
    }).then((result) => {
        if (result.isConfirmed) {
            initGame();
        }
        if (result.isDismissed) {
            onRest();
        }
    });

    log(`⏳ Time's up! -${timeOutPenalty} Points. New Total: ${finalScore}. Correct was: ${currentImage.choices[currentImage.correct]}`);
    saveScoreToServer(userScore, correctStreak, mostStreak);
    revealAllTiles();
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

    const select = document.createElement('select');
    select.className = 'choice-dropdown';
    select.id = 'answer-select';
    select.disabled = !gameData.isActive;

    const defaultOption = document.createElement('option');
    defaultOption.textContent = "Select your answer...";
    defaultOption.value = "";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    const shuffledChoices = [...currentImage.choices];
    for (let i = shuffledChoices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledChoices[i], shuffledChoices[j]] = [shuffledChoices[j], shuffledChoices[i]];
    }

    shuffledChoices.forEach((choiceText) => {
        const originalIndex = currentImage.choices.indexOf(choiceText);
        const option = document.createElement('option');
        option.textContent = choiceText;
        option.value = originalIndex;
        select.appendChild(option);
    });

    select.addEventListener('change', (event) => {
        const selectedOriginalIndex = parseInt(event.target.value, 10);
        if (!isNaN(selectedOriginalIndex)) {
             handleAnswer(selectedOriginalIndex);
             select.disabled = true;
        }
    });
    choicesDiv.appendChild(select);
}

function renderRandomRevealButton() {
    let revealBtn = document.querySelector('#random-reveal-btn');

    if (!revealBtn) {
        revealBtn = document.createElement('div');
        revealBtn.id = 'random-reveal-btn';
        revealBtn.className = 'btn btn-primary';
        choicesDiv.appendChild(revealBtn);
        revealBtn.addEventListener('click', handleRandomReveal);
    } else {
        const newBtn = revealBtn.cloneNode(true);
        revealBtn.parentNode.replaceChild(newBtn, revealBtn);
        newBtn.addEventListener('click', handleRandomReveal);
        revealBtn = newBtn;
    }

    revealBtn.innerHTML = `<i class="fa-solid fa-puzzle-piece"></i> Random Open (${gameData.randomReveals})`;
    revealBtn.disabled = (gameData.randomReveals <= 0 || !gameData.isActive);
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