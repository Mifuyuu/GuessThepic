let gameData = {
    randomReveals: 3,
    isActive: false,
    timer: null,
    timeLeft: 30,
    startTime: null
};

let currentImage = null;
let clicks = 0;
let score = 100;
let correctStreak = 0;
let mostStreak = 0;
let username = '';

const statusDiv = document.getElementById('status');
const gameGridDiv = document.getElementById('game-grid');
const choicesDiv = document.getElementById('choices');
const signoutBtn = document.getElementById('signout-btn');
const restartBtn = document.getElementById('restart');
const viewScoreboardBtn = document.getElementById('view-scoreboard');

// --- Event Listeners ---
restartBtn.addEventListener('click', initGame);

viewScoreboardBtn.addEventListener('click', () => {
    window.location.href = 'scoreboard.html';
});

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
        username = sessionUser; // ตั้งค่า username ที่นี่เลย
        // fetchServerPort(); // --- ลบการเรียกใช้ ---
        initGame(); // เรียก initGame โดยตรง
    }
});
// --- สิ้นสุด Event Listeners ---

// --- Core Game Logic ---
async function initGame() {
    console.log('Initializing game...');
    clicks = 0;
    score = 100; // Reset score สำหรับรอบใหม่
    gameData.randomReveals = 3;
    gameData.timeLeft = 30;
    gameData.isActive = true;
    clearInterval(gameData.timer); // เคลียร์ timer เก่า (ถ้ามี)

    restartBtn.style.display = 'none';
    statusDiv.textContent = 'Loading game data...'; // แสดงสถานะ loading

    try {
        // 1. Fetch Player Data (สำคัญ: ต้องทำก่อนเริ่มเกม)
        const playerDataFetched = await fetchPlayerData(); // await เพื่อให้รอข้อมูลผู้เล่นเสร็จก่อน
        if (!playerDataFetched) {
            // fetchPlayerData จะจัดการ redirect เองถ้าล้มเหลวเรื่อง auth
            console.error("Failed to fetch player data during init. Stopping game initialization.");
            statusDiv.textContent = 'Error loading player data. Please try logging in again.';
            // อาจจะแสดงปุ่ม sign out หรือ refresh
            return; // หยุดการทำงาน initGame
        }

        // 2. Fetch Game Images (ทำหลังจากได้ข้อมูลผู้เล่น)
        const response = await fetch('data.json'); // ตรวจสอบว่า data.json อยู่ใน public folder
        if (!response.ok) {
            throw new Error(`Failed to load data.json: ${response.statusText}`);
        }
        const images = await response.json();
        if (!images || images.length === 0) {
             throw new Error('No images found in data.json');
        }
        currentImage = images[Math.floor(Math.random() * images.length)];

        // 3. Render UI and Start Timer (เมื่อข้อมูลพร้อม)
        renderGrid();
        renderChoices();
        renderRandomRevealButton(); // ต้อง render หลังจาก choices div ถูกสร้าง
        updateStatus(); // อัปเดต Status ครั้งแรกด้วยข้อมูลที่ fetch มา
        startTimer();
        gameData.startTime = Date.now(); // บันทึกเวลาเริ่มจับเวลาสำหรับ bonus

    } catch (error) {
        console.error('Error during game initialization:', error);
        statusDiv.textContent = `Error loading game: ${error.message}. Please refresh.`;
        // อาจจะต้องเคลียร์ UI บางส่วนถ้าโหลดล้มเหลวกลางคัน
        gameGridDiv.innerHTML = '';
        choicesDiv.innerHTML = '';
    }
}

async function fetchPlayerData() {
    const token = localStorage.getItem('token');
    // username ถูกตั้งค่าไว้ใน event 'load' แล้ว

    // ตรวจสอบ token และ username อีกครั้ง (เผื่อกรณีเรียกใช้จากที่อื่น)
    if (!token || !username) {
        console.error("fetchPlayerData: Missing token or username.");
        // ไม่ควร redirect จากตรงนี้โดยตรง ให้ return false แล้วให้ initGame จัดการ
        return false;
    }

    console.log(`Fetching player data for: ${username}`);
    try {
        // --- ใช้ Relative URL ---
        const response = await fetch(`/api/player/me`, { // <--- เปลี่ยน Endpoint เป็น /api/player/me (ตามที่แก้ใน server.js) และใช้ Relative URL
            method: 'GET', // GET เป็น default แต่ใส่เพื่อความชัดเจน
            headers: {
                'Authorization': `Bearer ${token}`
                // 'Content-Type': 'application/json' // ไม่จำเป็นสำหรับ GET ที่ไม่มี body
            }
        });
        // --- สิ้นสุดการเปลี่ยน ---

        if (response.ok) {
            const data = await response.json();
            // ตรวจสอบ data ที่ได้รับ
            if (data && typeof data.correctStreak !== 'undefined' && typeof data.mostStreak !== 'undefined') {
                correctStreak = data.correctStreak;
                mostStreak = data.mostStreak;
                console.log('Player data fetched:', { correctStreak, mostStreak });
                // updateStatus(); // ย้ายไปเรียกใน initGame หลังจาก fetch สำเร็จ
                return true; // คืนค่า true เพื่อบอกว่าสำเร็จ
            } else {
                 console.error('Invalid player data received:', data);
                 statusDiv.textContent = 'Error: Received invalid player data format.';
                 return false;
            }

        } else {
            // Handle specific errors (e.g., unauthorized)
            if (response.status === 401 || response.status === 403) {
                console.error('Authentication failed (401/403). Token might be invalid/expired. Redirecting...');
                localStorage.removeItem('token');
                sessionStorage.removeItem('username');
                window.location.href = 'index.html'; // Redirect เมื่อ Auth ล้มเหลว
            } else {
                // Other errors (500, 404 etc.)
                const errorText = await response.text();
                console.error(`Failed to fetch player data (${response.status}):`, errorText);
                statusDiv.textContent = `Error fetching data: ${response.statusText}. Try refreshing.`;
            }
            return false; // คืนค่า false เพื่อบอกว่าล้มเหลว
        }
    } catch (error) {
        console.error('Network or other error fetching player data:', error);
        statusDiv.textContent = 'Network error fetching player data. Please check connection.';
         // ไม่ควร redirect ทันทีสำหรับ network error, ให้ผู้ใช้ลอง refresh เอง
        return false; // คืนค่า false เพื่อบอกว่าล้มเหลว
    }
}

function updateStatus() {
    // คำนวณ bonus ภายใน updateStatus เพื่อให้แสดงผลถูกต้องเสมอ
    const bonus = (gameData.timeLeft >= 20 && gameData.isActive) ? 50 : 0;
    statusDiv.textContent =
        `Player: ${username} | Clicks: ${clicks} | Score: ${score} | Time: ${gameData.timeLeft}s | Streak: ${correctStreak} | Max Streak: ${mostStreak}${bonus ? ' (+50 Bonus)' : ''}`;
}

function handleAnswer(selectedIndex) {
    // ตรวจสอบว่า selectedIndex เป็น number หรือไม่ (ป้องกันกรณี user เลือก default option)
    if (!gameData.isActive || typeof selectedIndex !== 'number' || isNaN(selectedIndex)) {
        console.log('handleAnswer ignored: Game not active or invalid index', selectedIndex);
        return;
    }

    gameData.isActive = false; // หยุดเกมทันที
    clearInterval(gameData.timer); // หยุด timer

    // คำนวณ bonus score จากเวลาที่เหลือ (หรือเวลาที่ใช้)
    // ใช้ timeLeft ที่เหลืออยู่ตอนตอบ หรือ คำนวณจาก startTime
    const bonus = gameData.timeLeft >= 20 ? 50 : gameData.timeLeft >=10 ? 25: 0; // ตัวอย่าง logic bonus
    let calculatedScore = score + bonus; // นำ score ปัจจุบัน + bonus ก่อน

    let message = '';

    if (selectedIndex === currentImage.correct) {
        correctStreak++;
        if (correctStreak > mostStreak) {
            mostStreak = correctStreak;
        }
        // คำนวณ multiplier (อาจจะปรับ logic)
        const scoreMultiplier = 1 + (0.1 * correctStreak); // ตัวอย่าง: เพิ่ม 10% ต่อ streak
        calculatedScore = Math.round(calculatedScore * scoreMultiplier); // ใช้คะแนนที่รวม bonus แล้ว มาคูณ

        message = `🎉 Correct! +${calculatedScore - score} Points (Score: ${calculatedScore}) | Streak: ${correctStreak} | Max Streak: ${mostStreak}`;
        score = calculatedScore; // อัปเดต score หลัก

    } else {
        correctStreak = 0; // รีเซ็ต streak
        calculatedScore = Math.max(calculatedScore - 50, 0); // ลดคะแนนเมื่อตอบผิด (อาจจะปรับ)
        message = `❌ Wrong! Correct: ${currentImage.choices[currentImage.correct]} (Score: ${calculatedScore}) | Streak: 0 | Max Streak: ${mostStreak}`;
        score = calculatedScore; // อัปเดต score หลัก
    }

    statusDiv.textContent = message; // แสดงผลลัพธ์
    saveScoreToServer(score, correctStreak, mostStreak); // ส่ง score ล่าสุดไป server
    revealAllTiles();
    restartBtn.style.display = 'block'; // แสดงปุ่มเริ่มใหม่
}

async function saveScoreToServer(finalScore, currentCorrectStreak, currentMostStreak) {
    const token = localStorage.getItem('token');
    // username มีอยู่แล้วในตัวแปร global

    console.log('Attempting to save score:', { finalScore, currentCorrectStreak, currentMostStreak });

    if (!token || !username) {
        console.error('Cannot save score: Missing token or username.');
        // อาจจะแจ้งเตือนผู้ใช้ แต่ไม่ควร redirect
        return;
    }

    try {
        // --- ใช้ Relative URL ---
        const response = await fetch(`/api/scores`, { // <--- เปลี่ยนตรงนี้
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                // ส่งข้อมูลตามที่ server คาดหวัง (ดูจาก POST /api/scores ใน server.js)
                score: finalScore, // Server อาจจะใช้ $inc หรือ $set, ต้องดู logic ที่ server
                correctStreak: currentCorrectStreak,
                mostStreak: currentMostStreak
                // username ไม่ต้องส่ง เพราะ server อ่านจาก token
            })
        });
        // --- สิ้นสุดการเปลี่ยน ---

        const responseData = await response.json(); // อ่าน response เสมอ

        if (response.ok) {
            console.log('Score saved successfully:', responseData);
        } else {
            console.error(`Failed to save score (${response.status}):`, responseData.message || response.statusText);
            // แจ้งเตือนผู้ใช้ว่าบันทึกคะแนนไม่สำเร็จ แต่ไม่ redirect
            statusDiv.textContent += ' (Warning: Could not save score)';
        }
    } catch (error) {
        console.error('Network error saving score:', error);
        statusDiv.textContent += ' (Warning: Network error saving score)';
    }
}

function startTimer() {
    clearInterval(gameData.timer); // Clear existing timer just in case
    gameData.timer = setInterval(() => {
        if (gameData.timeLeft > 0 && gameData.isActive) { // Check isActive ด้วย
            gameData.timeLeft--;
            score = Math.max(score - 1, 0); // ลดคะแนนตามเวลา (อาจจะปรับ logic)
            updateStatus();
        } else if (gameData.isActive) { // Time runs out while game is active
            clearInterval(gameData.timer);
            handleTimeout();
        }
    }, 1000);
}

function handleTimeout() {
    if (!gameData.isActive) return; // ป้องกันการทำงานซ้ำซ้อน
    gameData.isActive = false;

    console.log("Time's up!");
    score = Math.max(score - 100, 0); // ลดคะแนนเมื่อหมดเวลา
    correctStreak = 0; // รีเซ็ต streak

    statusDiv.textContent = `⏳ Time's up! (Score: ${score}) | Correct: ${currentImage.choices[currentImage.correct]} | Streak: 0 | Max Streak: ${mostStreak}`;

    saveScoreToServer(score, correctStreak, mostStreak); // บันทึกคะแนน (ที่ติดลบ/เป็น 0)
    revealAllTiles();
    restartBtn.style.display = 'block';
}

function revealAllTiles() {
    document.querySelectorAll('.tile-cover').forEach(cover => {
        if (cover) { // Check if cover exists
           cover.style.opacity = '0';
        }
    });
}

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
        cover.addEventListener('click', () => handleTileClick(cover));

        tile.appendChild(imgDiv);
        tile.appendChild(cover);
        grid.appendChild(tile);
    }
}

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
    // Ensure button isn't duplicated if renderChoices is called multiple times
    let revealBtn = choicesDiv.querySelector('#random-reveal-btn');
    if (!revealBtn) {
        revealBtn = document.createElement('button');
        revealBtn.id = 'random-reveal-btn'; // Give it an ID
        revealBtn.className = 'choice-btn'; // Use appropriate class
        choicesDiv.appendChild(revealBtn); // Append to choices container
    }

    revealBtn.textContent = `Random Reveal (${gameData.randomReveals})`;
    // Remove old listener before adding new one to prevent multiple triggers
    revealBtn.replaceWith(revealBtn.cloneNode(true)); // Clone to remove listeners
    revealBtn = choicesDiv.querySelector('#random-reveal-btn'); // Re-select the cloned button
    revealBtn.addEventListener('click', handleRandomReveal);

    // Disable button if no reveals left or game not active
    revealBtn.disabled = (gameData.randomReveals <= 0 || !gameData.isActive);
}


function handleRandomReveal() {
    if (gameData.randomReveals <= 0 || !gameData.isActive) return;

    const covers = document.querySelectorAll('.tile-cover');
    // Filter for covers that are *not* already revealed (opacity is not '0')
    const hiddenTiles = Array.from(covers).filter(cover => cover && cover.style.opacity !== '0');

    if (hiddenTiles.length > 0) {
        const randomIndex = Math.floor(Math.random() * hiddenTiles.length);
        const randomTile = hiddenTiles[randomIndex];
        randomTile.style.opacity = '0'; // Reveal the random tile

        gameData.randomReveals--;
        clicks++; // Count reveal as a click
        score = Math.max(score - 10, 0); // Penalty for using reveal (adjust value)

        // Update button text and disable if needed
       renderRandomRevealButton(); // Re-render to update text and disabled state
       updateStatus(); // Update score display
    } else {
         console.log("No more tiles to reveal.");
         // Optionally disable the button permanently if all tiles are revealed
         const revealBtn = choicesDiv.querySelector('#random-reveal-btn');
         if(revealBtn) revealBtn.disabled = true;
    }
}
// --- End Core Game Logic ---