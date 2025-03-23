let gameData = {
    randomReveals: 3,
    isActive: false,
    timer: null,
    timeLeft: 30
};

let currentImage = null;
let clicks = 0;
let score = 100;
let correctStreak = 0;
let mostStreak = 0;  // Track the highest streak achieved
let username = '';

document.getElementById('restart').addEventListener('click', initGame);
document.getElementById('start').addEventListener('click', function() {
    const inputUsername = document.getElementById('username').value.trim();
    if (inputUsername) {
        username = inputUsername;
        document.getElementById('username-container').style.display = 'none';
        initGame();
    } else {
        alert('กรุณากรอกชื่อผู้ใช้');
    }
});

document.getElementById('view-scoreboard').addEventListener('click', () => {
    window.location.href = 'scoreboard.html';  // Redirect to scoreboard
});

async function initGame() {
    clicks = 0;
    score = 100;
    gameData.randomReveals = 3;
    gameData.timeLeft = 30;
    gameData.isActive = true;
    clearInterval(gameData.timer);

    document.getElementById('restart').style.display = 'none';

    try {
        const response = await fetch('data.json');
        const images = await response.json();
        currentImage = images[Math.floor(Math.random() * images.length)];

        localStorage.setItem('username', username);
        await fetchPlayerData();

        renderGrid();
        renderChoices();
        renderRandomRevealButton();
        startTimer();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

async function fetchPlayerData() {
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/player/${username}`);
        if (response.ok) {
            const data = await response.json();
            correctStreak = data.correctStreak; // set global correctStreak variable
            mostStreak = data.mostStreak;
            updateStatus(); // Update UI after fetching the correctStreak
        } else {
            console.error('Failed to fetch player data:', await response.text());
            correctStreak = 0; // Reset to 0 if fetching fails
            mostStreak = 0;
        }
    } catch (error) {
        console.error('Error fetching player data:', error);
        correctStreak = 0; // Reset to 0 on error
        mostStreak = 0;
    }
}


function updateStatus() {
    const bonus = gameData.timeLeft >= 20 ? 50 : 0;
    document.getElementById('status').textContent =
        `ผู้เล่น: ${username} | Clicks: ${clicks} | Score: ${score} | Time: ${gameData.timeLeft}s | Streak: ${correctStreak} | Most Streak: ${mostStreak}${bonus ? ' (+50 Bonus)' : ''}`;
}

function handleAnswer(selectedIndex) {
    if (!gameData.isActive || isNaN(selectedIndex)) return;
    gameData.isActive = false;
    clearInterval(gameData.timer);

    const timeTaken = Math.floor((Date.now() - gameData.startTime) / 1000);
    const bonus = timeTaken <= 10 ? 50 : 0;
    score += bonus;

    let scoreMultiplier = 1;
    if (correctStreak > 1) {
        scoreMultiplier = 1 + (0.25 * correctStreak);  // 2 streak *1.25, 3 streak *1.5, 4 streak *1.75, etc.
    }

    if (selectedIndex === currentImage.correct) {
        correctStreak++;
        if (correctStreak > mostStreak) {
            mostStreak = correctStreak;  // Update mostStreak
        }
        let roundScore = Math.max(score * scoreMultiplier, 0);
        document.getElementById('status').textContent = `🎉 Correct! +${roundScore.toFixed(2)} Points | Streak: ${correctStreak} | Most Streak: ${mostStreak}`;
        score = roundScore;

    } else {
        correctStreak = 0;
        score = Math.max(score - 100, 0);
        document.getElementById('status').textContent = `❌ Wrong! Correct answer: ${currentImage.choices[currentImage.correct]} | -100 Points | Streak: 0 | Most Streak: ${mostStreak}`;
    }

    saveScoreToServer(username, score, correctStreak, mostStreak);
    revealAllTiles();
    document.getElementById('restart').style.display = 'block';
}

let serverPort = 5000;

async function fetchServerPort() {
    try {
        const response = await fetch('http://localhost:5000/api/port');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        serverPort = data.port;
        console.log('Server port:', serverPort);
    } catch (error) {
        console.error('Error fetching server port:', error);
    }
}

fetchServerPort();

async function saveScoreToServer(username, score, correctStreak, mostStreak) {
    try {
        const response = await fetch(`http://localhost:${serverPort}/api/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, score, correctStreak, mostStreak })
        });
        if (response.ok) {
            console.log('Score saved to server!');
        } else {
            console.error('Failed to save score:', await response.text());
        }
    } catch (error) {
        console.error('Error saving score:', error);
    }
}

function startTimer() {
    gameData.timer = setInterval(() => {
        if (gameData.timeLeft > 0) {
            gameData.timeLeft--;
            score = Math.max(score - 1, 0);
            updateStatus();
        } else {
            clearInterval(gameData.timer);
            handleTimeout();
        }
    }, 1000);
}

function handleTimeout() {
    if (!gameData.isActive) return;
    gameData.isActive = false;
    score = Math.max(score - 100, 0);
    correctStreak = 0; // Reset the streak on timeout

    saveScoreToServer(username, score, correctStreak, mostStreak);  //Save to db
    revealAllTiles();
    document.getElementById('restart').style.display = 'block';
    document.getElementById('status').textContent = `⏳ Time's up! -100 Points | Correct answer: ${currentImage.choices[currentImage.correct]} | Streak: 0 | Most Streak: ${mostStreak}`;
}

function revealAllTiles() {
    document.querySelectorAll('.tile-cover').forEach(cover => {
        cover.style.opacity = '0';
    });
}

function renderGrid() {
    const grid = document.getElementById('game-grid');
    grid.innerHTML = '';

    for (let i = 0; i < 25; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile';

        const row = Math.floor(i / 5);
        const col = i % 5;

        const imgDiv = document.createElement('div');
        imgDiv.className = 'tile-img';
        imgDiv.style.backgroundImage = `url('${currentImage.path}')`;
        imgDiv.style.backgroundSize = '500px 500px';
        imgDiv.style.backgroundPosition = `${-col * 100}px ${-row * 100}px`;

        const cover = document.createElement('div');
        cover.className = 'tile-cover';

        tile.append(imgDiv, cover);
        grid.appendChild(tile);
    }
}

function renderChoices() {
    const choicesContainer = document.getElementById('choices');
    choicesContainer.innerHTML = '';

    const select = document.createElement('select');
    select.className = 'choice-dropdown';

    const defaultOption = document.createElement('option');
    defaultOption.textContent = "Select an answer";
    defaultOption.value = "";
    select.appendChild(defaultOption);

    currentImage.choices.forEach((choice, index) => {
        const option = document.createElement('option');
        option.textContent = choice;
        option.value = index;
        select.appendChild(option);
    });

    select.addEventListener('change', () => handleAnswer(parseInt(select.value)));
    choicesContainer.appendChild(select);
}

function renderRandomRevealButton() {
    const choicesContainer = document.getElementById('choices');
    const revealBtn = document.createElement('button');
    revealBtn.className = 'choice-btn';
    revealBtn.textContent = `Random Reveal (${gameData.randomReveals})`;
    revealBtn.addEventListener('click', handleRandomReveal);
    choicesContainer.appendChild(revealBtn);
}

function handleRandomReveal() {
    if (gameData.randomReveals > 0 && gameData.isActive) {
        const covers = document.querySelectorAll('.tile-cover');
        const hiddenTiles = Array.from(covers).filter(cover => cover.style.opacity !== '0');

        if (hiddenTiles.length > 0) {
            const randomTile = hiddenTiles[Math.floor(Math.random() * hiddenTiles.length)];
            randomTile.style.opacity = '0';

            gameData.randomReveals--;
            document.querySelector('.choice-btn:last-child').textContent = `Random Reveal (${gameData.randomReveals})`;

            clicks++;
            score = Math.max(100 - (clicks * 25), 0);
            updateStatus();
        }
    }
}