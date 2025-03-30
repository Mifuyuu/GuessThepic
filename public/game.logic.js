let gameData = {
    randomReveals: 3,
    isActive: false,
    timer: null,
    timeLeft: 30,
    startTime: null
};

let currentImage = null;
let clicks = 0;
let inGameScore = 100;
let userScore = 0;
let correctStreak = 0;
let mostStreak = 0;
let username = '';

const statusDiv = document.getElementById('status');
const gameGridDiv = document.getElementById('game-grid');
const choicesDiv = document.getElementById('choices');
const signoutBtn = document.getElementById('signout-btn');
const startBtn = document.getElementById('start');
const restartBtn = document.getElementById('restart');

startBtn.addEventListener('click', initGame);
restartBtn.addEventListener('click', initGame);

// viewScoreboardBtn.addEventListener('click', () => {
//     window.location.href = 'scoreboard.html';
// });

signoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('username');
    window.location.href = 'index.html';
});

window.addEventListener('load', () => {
    const token = localStorage.getItem('token');
    const sessionUser = sessionStorage.getItem('username');

    if (!token || !sessionUser) {
        console.log('Game page: Token or username missing on load. Redirecting.');
        window.location.href = 'index.html';
    } else {
        username = sessionUser;
        // initGame();
        startBtn.style.display = 'block';
    }
});
// --- สิ้นสุด Event Listeners ---

// --- Core Game Logic ---
async function initGame() {
    console.log('Initializing game...');
    clicks = 0;
    // --- รีเซ็ตคะแนนในเกม ---
    inGameScore = 100; // Reset in-game score สำหรับรอบใหม่
    // --- Reset ค่าอื่นๆ ---
    gameData.randomReveals = 3;
    gameData.timeLeft = 30;
    gameData.isActive = true; // ตั้งค่า isActive ก่อน fetch เพื่อให้ timer ไม่เริ่มเอง
    clearInterval(gameData.timer);

    startBtn.style.display = 'none';
    restartBtn.style.display = 'none';
    statusDiv.textContent = 'Loading game data...';

    try {
        // 1. Fetch Player Data (รวมถึง userScore)
        const playerDataFetched = await fetchPlayerData();
        if (!playerDataFetched) {
            console.error("Failed to fetch player data during init. Stopping game initialization.");
            statusDiv.textContent = 'Error loading player data. Please try logging in again.';
            return;
        }
        // Player data (userScore, correctStreak, mostStreak) is now loaded

        // 2. Fetch Game Images
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`Failed to load data.json: ${response.statusText}`);
        }
        const images = await response.json();
        if (!images || images.length === 0) {
             throw new Error('No images found in data.json');
        }
        currentImage = images[Math.floor(Math.random() * images.length)];

        // 3. Render UI and Start Timer
        await renderGrid();
        renderChoices();
        renderRandomRevealButton();
        updateStatus(); // อัปเดต Status ครั้งแรก (แสดง inGameScore เริ่มต้น)
        startTimer();   // <<< เริ่ม timer หลังจากทุกอย่างพร้อม
        gameData.startTime = Date.now();

    } catch (error) {
        console.error('Error during game initialization:', error);
        statusDiv.textContent = `Error loading game: ${error.message}. Please refresh.`;
        gameGridDiv.innerHTML = '';
        choicesDiv.innerHTML = '';
        // Ensure game is not active on error
        gameData.isActive = false;
        clearInterval(gameData.timer);
    }
}

async function fetchPlayerData() {
    const token = localStorage.getItem('token');
    if (!token || !username) {
        console.error("fetchPlayerData: Missing token or username.");
        return false;
    }

    console.log(`Fetching player data for: ${username}`);
    try {
        const response = await fetch(`/api/player/me`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            // --- ตรวจสอบและเก็บข้อมูล ---
            if (data && typeof data.score !== 'undefined' && typeof data.correctStreak !== 'undefined' && typeof data.mostStreak !== 'undefined') {
                userScore = data.score; // <<< เก็บ userScore ที่ได้จาก DB
                correctStreak = data.correctStreak;
                mostStreak = data.mostStreak;
                console.log('Player data fetched:', { userScore, correctStreak, mostStreak });
                return true;
            } else {
                 console.error('Invalid player data received:', data);
                 statusDiv.textContent = 'Error: Received invalid player data format.';
                 return false;
            }
        } else {
            if (response.status === 401 || response.status === 403) {
                console.error('Authentication failed (401/403). Redirecting...');
                localStorage.removeItem('token');
                sessionStorage.removeItem('username');
                window.location.href = 'index.html';
            } else {
                const errorText = await response.text();
                console.error(`Failed to fetch player data (${response.status}):`, errorText);
                statusDiv.textContent = `Error fetching data: ${response.statusText}. Try refreshing.`;
            }
            return false;
        }
    } catch (error) {
        console.error('Network or other error fetching player data:', error);
        statusDiv.textContent = 'Network error fetching player data. Please check connection.';
        return false;
    }
}

function updateStatus() {
    // แสดงคะแนนของรอบปัจจุบัน (inGameScore)
    const bonusHint = (gameData.timeLeft >= 20 && gameData.isActive) ? 50 : 0;
    statusDiv.textContent =
        // `Player: ${username} | Current Total: ${userScore} | Round Score: ${inGameScore} | Time: ${gameData.timeLeft}s | Streak: ${correctStreak} | Max Streak: ${mostStreak}${bonusHint ? ' (+50 Bonus)' : ''}`;
        // หรือแสดงแบบเดิม แต่ให้รู้ว่าตัวเลขคือคะแนนในรอบนั้น
         `Player: ${username} | Score: ${inGameScore} | Time: ${gameData.timeLeft}s | Streak: ${correctStreak} | Max Streak: ${mostStreak}${bonusHint ? ' (+50 Bonus)' : ''}`;
}


function handleAnswer(selectedIndex) {
    if (!gameData.isActive || typeof selectedIndex !== 'number' || isNaN(selectedIndex)) {
        return;
    }

    gameData.isActive = false;
    clearInterval(gameData.timer);

    const bonus = gameData.timeLeft >= 20 ? 50 : gameData.timeLeft >= 10 ? 25 : 0;
    // ใช้ inGameScore ณ ตอนที่ตอบ มาคำนวณ
    let currentRoundScore = inGameScore;
    let finalScore = userScore; // เริ่มต้น finalScore ด้วย userScore เดิม
    let pointsChange = 0; // คะแนนที่เปลี่ยนแปลงในรอบนี้
    let message = '';

    if (selectedIndex === currentImage.correct) {
        correctStreak++;
        if (correctStreak > mostStreak) {
            mostStreak = correctStreak;
        }
        const scoreMultiplier = 1 + (0.1 * correctStreak);
        // คำนวณคะแนนที่ *ได้* จากรอบนี้ (รวม bonus และ multiplier)
        let pointsEarned = Math.round((currentRoundScore + bonus) * scoreMultiplier);
        pointsChange = pointsEarned; // คะแนนที่เพิ่มขึ้น
        finalScore = userScore + pointsChange; // นำไปบวกกับ userScore เดิม

        message = `🎉 Correct! +${pointsChange} Points (New Total: ${finalScore}) | Streak: ${correctStreak} | Max Streak: ${mostStreak}`;
    } else {
        correctStreak = 0;
        // กำหนดค่า Penalty ที่จะ *หัก* ออกจาก userScore
        let penalty = 50; // จำนวนคะแนนที่จะหัก
        pointsChange = -penalty; // คะแนนที่เปลี่ยนแปลง (ติดลบ)
        finalScore = Math.max(userScore + pointsChange, 0); // นำไปลบออกจาก userScore เดิม (ไม่ต่ำกว่า 0)

        message = `❌ Wrong! -${penalty} Points. Correct: ${currentImage.choices[currentImage.correct]} (New Total: ${finalScore}) | Streak: 0 | Max Streak: ${mostStreak}`;
    }

    statusDiv.textContent = message; // แสดงผลลัพธ์ (คะแนนรวมใหม่)
    // --- อัปเดต userScore ใน client ทันทีเพื่อให้แสดงผลถูกต้องหากเล่นต่อ ---
    userScore = finalScore;
    // --- บันทึกคะแนนรวมสุดท้าย ---
    saveScoreToServer(finalScore, correctStreak, mostStreak);
    revealAllTiles();
    restartBtn.style.display = 'block';
}

async function saveScoreToServer(finalScoreToSave, currentCorrectStreak, currentMostStreak) { // เปลี่ยนชื่อ parameter เพื่อความชัดเจน
    const token = localStorage.getItem('token');
    console.log('Attempting to save score:', { finalScoreToSave, currentCorrectStreak, currentMostStreak });

    if (!token || !username) {
        console.error('Cannot save score: Missing token or username.');
        return;
    }

    try {
        // --- ส่ง finalScoreToSave ซึ่งเป็นคะแนนรวมใหม่ ---
        const response = await fetch(`/api/scores`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                score: finalScoreToSave, // ส่งคะแนนรวมสุดท้ายไปให้ server อัปเดต
                correctStreak: currentCorrectStreak,
                mostStreak: currentMostStreak
            })
        });

        const responseData = await response.json();
        if (response.ok) {
            console.log('Score saved successfully:', responseData);
            // อาจจะอัปเดต userScore ใน client อีกครั้งเผื่อ server มีการปรับค่า
            // userScore = responseData.newScore; // หาก server ส่งค่าใหม่กลับมา
        } else {
            console.error(`Failed to save score (${response.status}):`, responseData.message || response.statusText);
            statusDiv.textContent += ' (Warning: Could not save score)';
        }
    } catch (error) {
        console.error('Network error saving score:', error);
        statusDiv.textContent += ' (Warning: Network error saving score)';
    }
}

function startTimer() {
    clearInterval(gameData.timer);
    gameData.timer = setInterval(() => {
        if (gameData.timeLeft > 0 && gameData.isActive) {
            gameData.timeLeft--;
            // --- ลดคะแนนของรอบปัจจุบัน ---
            inGameScore = Math.max(inGameScore - 1, 0);
            updateStatus(); // แสดง inGameScore ที่ลดลง
        } else if (gameData.isActive) {
            clearInterval(gameData.timer);
            handleTimeout();
        }
    }, 1000);
}

function handleTimeout() {
    if (!gameData.isActive) return;
    gameData.isActive = false;

    console.log("Time's up!");
    correctStreak = 0; // รีเซ็ต streak

    // กำหนดค่า Penalty ที่จะ *หัก* ออกจาก userScore เมื่อหมดเวลา
    let timeOutPenalty = 100;
    let finalScore = Math.max(userScore - timeOutPenalty, 0); // หักออกจาก userScore เดิม

    statusDiv.textContent = `⏳ Time's up! -${timeOutPenalty} Points (New Total: ${finalScore}) | Correct: ${currentImage.choices[currentImage.correct]} | Streak: 0 | Max Streak: ${mostStreak}`;

    // --- อัปเดต userScore ใน client ---
    userScore = finalScore;
    // --- บันทึกคะแนนรวมสุดท้าย ---
    saveScoreToServer(finalScore, correctStreak, mostStreak);
    revealAllTiles();
    restartBtn.style.display = 'block';
}

function revealAllTiles() {
    document.querySelectorAll('.tile-cover').forEach(cover => {
        if (cover) {
           cover.style.opacity = '0';
        }
    });
}

// --- renderGrid, renderChoices, renderRandomRevealButton เหมือนเดิม ---
// --- แต่ renderRandomRevealButton ต้องแก้ให้ลด inGameScore ---
async function renderGrid() { // ทำให้เป็น async ถ้าจะ await getComputedStyle (แต่จริงๆ ไม่จำเป็นต้อง await)
    const grid = document.getElementById('game-grid');
    grid.innerHTML = ''; // Clear previous grid
    grid.style.backgroundImage = ''; // Ensure grid container itself has no background image

    if (!currentImage || !currentImage.path) {
        console.error("Cannot render grid: currentImage data is missing.");
        grid.textContent = "Error loading image data.";
        return;
    }

    // --- Get Computed Styles (ทำนอก loop เพื่อประสิทธิภาพ) ---
    let tileWidth = 100; // Default
    let tileHeight = 100; // Default
    let gap = 10; // Default
    let borderWidth = 2; // Default

    // สร้าง tile ชั่วคราวเพื่อวัดค่า (หรือวัดจาก grid ถ้ามั่นใจว่ามี style ถูกต้อง)
    const tempTile = document.createElement('div');
    tempTile.className = 'tile'; // ให้มี class เหมือน tile จริง
    tempTile.style.visibility = 'hidden'; // ซ่อนไว้
    grid.appendChild(tempTile); // ต้องอยู่ใน DOM ถึงจะ getComputedStyle ได้

    try {
        const tileStyle = window.getComputedStyle(tempTile);
        // parseFloat จะตัด 'px' ออกและแปลงเป็นตัวเลข
        tileWidth = parseFloat(tileStyle.width) || tileWidth;
        tileHeight = parseFloat(tileStyle.height) || tileHeight;
        borderWidth = parseFloat(tileStyle.borderLeftWidth) || borderWidth; // เอา border ด้านเดียวพอ

        const gridStyle = window.getComputedStyle(grid);
        gap = parseFloat(gridStyle.gap) || gap; // gap อาจจะเป็นค่าเดียว หรือ 'row-gap column-gap'

        // Handle cases where gap might return two values
        const gapValues = gridStyle.gap.split(' ');
        gap = parseFloat(gapValues[0]) || gap; // Use the first value (row-gap usually) or fallback

    } catch (e) {
        console.warn("Could not compute styles, using default values.", e);
    } finally {
        grid.removeChild(tempTile); // ลบ tile ชั่วคราวทิ้ง
    }

    // --- คำนวณค่าที่ต้องใช้ ---
    const numCols = 5; // หรืออ่านจาก grid-template-columns ถ้าซับซ้อน
    const numRows = 5;
    // สำคัญ: ตรวจสอบ box-sizing ถ้าเป็น border-box การคำนวณ borderWidth จะต่างไป
    // สมมติว่าเป็น content-box (default):
    const actualTileWidth = tileWidth + 2 * borderWidth;
    const actualTileHeight = tileHeight + 2 * borderWidth;
    const horizontalStep = actualTileWidth + gap;
    const verticalStep = actualTileHeight + gap;

    // ขนาดรวมของ Background Image ที่ต้องใช้
    const totalBgWidth = (numCols * actualTileWidth) + ((numCols - 1) * gap);
    const totalBgHeight = (numRows * actualTileHeight) + ((numRows - 1) * gap);
    const backgroundSize = `${totalBgWidth}px ${totalBgHeight}px`;

    console.log(`Computed Grid Params: Tile(${tileWidth}x${tileHeight}), Border(${borderWidth}), Gap(${gap})`);
    console.log(`Steps: H=${horizontalStep}, V=${verticalStep}. BG Size: ${backgroundSize}`);


    // --- สร้าง Tiles ---
    for (let i = 0; i < numCols * numRows; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile';

        const imgDiv = document.createElement('div');
        imgDiv.className = 'tile-img';
        imgDiv.style.backgroundImage = `url('${currentImage.path}')`;
        imgDiv.style.backgroundSize = backgroundSize; // *** ใช้ขนาดที่คำนวณได้ ***

        const row = Math.floor(i / numCols);
        const col = i % numCols;

        // *** คำนวณ Background Position ที่ถูกต้อง ***
        const backgroundPosX = -col * horizontalStep;
        const backgroundPosY = -row * verticalStep;
        imgDiv.style.backgroundPosition = `${backgroundPosX}px ${backgroundPosY}px`;

        const cover = document.createElement('div');
        cover.className = 'tile-cover';
        cover.addEventListener('click', () => handleTileClick(cover)); // <<< แก้ไข: ต้องมี handleTileClick

        tile.appendChild(imgDiv);
        tile.appendChild(cover);
        grid.appendChild(tile);
    }
}
// --- เพิ่ม handleTileClick ที่หายไป ---
function handleTileClick(coverElement) {
    if (!gameData.isActive || coverElement.style.opacity === '0') {
        return; // ไม่ทำงานถ้าเกมไม่ active หรือ tile เปิดอยู่แล้ว
    }
    coverElement.style.opacity = '0';
    clicks++;
    // อาจจะมีการลดคะแนนเล็กน้อยเมื่อคลิกเปิดเอง (ถ้าต้องการ)
    // inGameScore = Math.max(inGameScore - 1, 0);
    updateStatus(); // อัปเดตจำนวนคลิก (และคะแนน ถ้ามีการลด)
}
// --- จบส่วนเพิ่ม handleTileClick ---


function renderChoices() {
    choicesDiv.innerHTML = ''; // Clear previous choices

    const select = document.createElement('select');
    select.className = 'choice-dropdown';
    select.id = 'answer-select'; // Add ID for easier selection

    const defaultOption = document.createElement('option');
    defaultOption.textContent = "Select your answer...";
    defaultOption.value = ""; // Use empty string for default/unselected
    defaultOption.disabled = true; // Make it unselectable initially
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    // Shuffle choices (optional but good practice)
    const shuffledChoices = [...currentImage.choices];
    // Basic shuffle:
    for (let i = shuffledChoices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledChoices[i], shuffledChoices[j]] = [shuffledChoices[j], shuffledChoices[i]];
    }


    shuffledChoices.forEach((choiceText) => {
        const originalIndex = currentImage.choices.indexOf(choiceText); // Find original index for correct answer check
        const option = document.createElement('option');
        option.textContent = choiceText;
        option.value = originalIndex; // Use original index as value
        select.appendChild(option);
    });

    select.addEventListener('change', (event) => {
        // Parse the selected value (which is the original index)
        const selectedOriginalIndex = parseInt(event.target.value, 10);
        handleAnswer(selectedOriginalIndex);
    });
    choicesDiv.appendChild(select);
}

function renderRandomRevealButton() {
    let revealBtn = choicesDiv.querySelector('#random-reveal-btn');
    if (!revealBtn) {
        revealBtn = document.createElement('button');
        revealBtn.id = 'random-reveal-btn';
        revealBtn.className = 'choice-btn';
        choicesDiv.appendChild(revealBtn);
    }

    revealBtn.textContent = `Random Reveal (${gameData.randomReveals})`;
    revealBtn.replaceWith(revealBtn.cloneNode(true));
    revealBtn = choicesDiv.querySelector('#random-reveal-btn');
    revealBtn.addEventListener('click', handleRandomReveal);
    revealBtn.disabled = (gameData.randomReveals <= 0 || !gameData.isActive);
}


function handleRandomReveal() {
    if (gameData.randomReveals <= 0 || !gameData.isActive) return;

    const covers = document.querySelectorAll('.tile-cover');
    const hiddenTiles = Array.from(covers).filter(cover => cover && cover.style.opacity !== '0');

    if (hiddenTiles.length > 0) {
        const randomIndex = Math.floor(Math.random() * hiddenTiles.length);
        const randomTile = hiddenTiles[randomIndex];
        randomTile.style.opacity = '0';

        gameData.randomReveals--;
        clicks++;
        // --- ลดคะแนนของรอบปัจจุบัน ---
        inGameScore = Math.max(inGameScore - 10, 0); // Penalty for using reveal

       renderRandomRevealButton();
       updateStatus(); // อัปเดต inGameScore ที่ลดลง
    } else {
         console.log("No more tiles to reveal.");
         const revealBtn = choicesDiv.querySelector('#random-reveal-btn');
         if(revealBtn) revealBtn.disabled = true;
    }
}
// --- End Core Game Logic ---