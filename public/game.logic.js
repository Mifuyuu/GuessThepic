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
const restartBtn = document.getElementById('restart');

const playerUsernameSpan = document.getElementById('player-username');
const playerScoresSpan = document.getElementById('player-scores');
const timeLeftSpan = document.getElementById('time-left');
const streakSpan = document.getElementById('streak');
const mostStreakSpan = document.getElementById('most-streak');
const LeaderboardBtn = document.getElementById('leaderboad-btn');

startBtn.addEventListener('click', initGame);
restartBtn.addEventListener('click', initGame);

signoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('username');
    window.location.href = 'index.html';
});

LeaderboardBtn.addEventListener('click', () => {
    window.location.href = 'scoreboard.html';
});

const PENDING_PENALTY_KEY = 'pendingPenaltyScore';

window.addEventListener('beforeunload', (event) => {
    // ตรวจสอบว่าเกมกำลังดำเนินอยู่หรือไม่
    if (gameData.isActive) {
        console.log("Game active during beforeunload. Preparing penalty data for localStorage.");

        // --- ไม่ต้องหยุดเกมหรือ timer ที่นี่ เพราะหน้ากำลังจะปิด ---

        // คำนวณ Penalty เหมือนตอนหมดเวลา หรือตามที่ต้องการสำหรับการ refresh
        const refreshPenalty = 100; // กำหนดค่า penalty
        const finalScoreOnRefresh = Math.max(userScore - refreshPenalty, 0);
        const finalCorrectStreakOnRefresh = 0; // รีเซ็ต streak
        // mostStreak ปัจจุบัน (ณ ตอน refresh) ควรถูกเก็บไว้ด้วย
        const currentMostStreak = mostStreak;

        // สร้าง object ข้อมูลที่จะเก็บ
        // สำคัญ: ต้องเก็บ username ไปด้วย เพื่อตรวจสอบตอนโหลดหน้าครั้งถัดไป
        const penaltyData = {
            username: username, // เก็บ username ปัจจุบัน
            score: finalScoreOnRefresh,
            correctStreak: finalCorrectStreakOnRefresh,
            mostStreak: currentMostStreak,
            timestamp: Date.now() // เพิ่ม timestamp (เผื่อใช้ debug หรือ cleanup ข้อมูลเก่า)
        };

        try {
            // เก็บข้อมูลเป็น JSON string ใน localStorage
            localStorage.setItem(PENDING_PENALTY_KEY, JSON.stringify(penaltyData));
            console.log("Penalty data saved to localStorage:", penaltyData);
        } catch (error) {
            console.error("Error saving penalty data to localStorage:", error);
            // อาจจะเกิดถ้า localStorage เต็ม หรือมีปัญหาอื่นๆ
        }

        // ไม่ต้อง return หรือ preventDefault อะไรที่นี่
    }
    // ถ้า gameData.isActive เป็น false ไม่ต้องทำอะไร
});

window.addEventListener('load', async () => {
    const token = localStorage.getItem('token');
    const sessionUser = sessionStorage.getItem('username');

    if (!token || !sessionUser) {
        console.log('Game page: Token or username missing on load. Redirecting.');
        window.location.href = 'index.html';
        return; // ออกจากการทำงานถ้าไม่มี token/user
    }

    username = sessionUser;
    playerUsernameSpan.textContent = username;
    statusDiv.textContent = 'Loading player data...';

    // --- Fetch ข้อมูลผู้เล่นเริ่มต้น ---
    const initialPlayerDataFetched = await fetchPlayerData();

    // --- !!! ส่วนที่เพิ่มเข้ามา: ตรวจสอบและส่ง Penalty ที่ค้างอยู่ !!! ---
    if (initialPlayerDataFetched) { // ทำหลังจากดึงข้อมูลผู้เล่นสำเร็จแล้ว
        try {
            const storedPenaltyDataString = localStorage.getItem(PENDING_PENALTY_KEY);
            if (storedPenaltyDataString) {
                console.log("Found pending penalty data in localStorage.");
                const parsedPenaltyData = JSON.parse(storedPenaltyDataString); // Parse ข้อมูลกลับมา

                // *** ตรวจสอบ Username ให้ตรงกัน *** สำคัญมาก!
                if (parsedPenaltyData && parsedPenaltyData.username === username) {
                    console.log("Pending penalty data matches current user. Sending to server...");

                    // --- ส่งข้อมูล Penalty ไปยัง Server โดยใช้ fetch ปกติ ---
                    // ใช้ Endpoint เดียวกับการบันทึกคะแนนปกติ
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
                        console.log("Pending penalty score sent and processed successfully by server.");
                        await fetchPlayerData();
                    } else {
                        const errorData = await response.text();
                        console.error(`Failed to send pending penalty score (${response.status}):`, errorData);
                    }

                    // --- ลบข้อมูลออกจาก localStorage ไม่ว่าจะส่งสำเร็จหรือไม่ ---
                    // เพื่อป้องกันการส่งซ้ำซ้อนในการโหลดครั้งต่อไป
                    localStorage.removeItem(PENDING_PENALTY_KEY); 
                    console.log("Removed pending penalty data from localStorage."); 

                } else if (parsedPenaltyData) {
                    // Username ไม่ตรงกัน (อาจจะ login เป็นคนอื่น) -> ลบทิ้ง
                    console.warn("Pending penalty data username mismatch. Discarding.");
                    localStorage.removeItem(PENDING_PENALTY_KEY);
                } else {
                    // ข้อมูล parse ไม่ได้ หรือ ไม่มี username -> ลบทิ้ง
                     console.error("Invalid pending penalty data found. Discarding.");
                     localStorage.removeItem(PENDING_PENALTY_KEY);
                }
            }
        } catch (error) {
            console.error("Error processing pending penalty data from localStorage:", error);
            // ถ้ามี error เกิดขึ้นระหว่าง process (เช่น parse JSON ไม่ได้) ก็ควรลบออก
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

// --- Core Game Logic ---
async function initGame() {
    console.log('Initializing game...');
    clicks = 0;
    // --- Reset ค่าอื่นๆ สำหรับรอบใหม่ ---
    statusDiv.style.display = 'flex';
    gameData.randomReveals = 3;
    gameData.timeLeft = 30;
    gameData.isActive = true;
    clearInterval(gameData.timer); // เคลียร์ timer เก่า (ถ้ามี)

    startBtn.style.display = 'none';
    restartBtn.style.display = 'none';
    choicesDiv.innerHTML = ''; // Clear choices from previous round
    gameGridDiv.innerHTML = 'Loading image...'; // Show loading message in grid
    statusDiv.textContent = 'Loading game data...'; // Update status

    // --- อัปเดตข้อมูลผู้เล่นล่าสุดก่อนเริ่มรอบใหม่ (เผื่อมีการเล่นหลายรอบ) ---
    // ไม่จำเป็นต้อง await ที่นี่ เพราะถึงข้อมูลยังไม่อัปเดตทันที เกมก็ยังเริ่มได้
    // แต่การแสดงผลคะแนนตอนจบจะใช้ข้อมูลล่าสุดที่ fetch มา
    fetchPlayerData(); // Fetch ล่าสุด แต่ไม่ต้องรอ

    try {
        // 1. Fetch Game Images
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`Failed to load data.json: ${response.statusText}`);
        }
        const images = await response.json();
        if (!images || images.length === 0) {
             throw new Error('No images found in data.json');
        }
        currentImage = images[Math.floor(Math.random() * images.length)];

        // --- แสดงคำถาม ---
        if (currentImage && currentImage.questions) {
            statusDiv.textContent = currentImage.questions; // <--- แสดงคำถามที่นี่
        } else {
            statusDiv.textContent = "Question not available."; // ข้อความสำรอง
        }

        // 2. Render UI and Start Timer
        await renderGrid(); // รอให้ grid แสดงผลเสร็จ
        renderChoices();
        renderRandomRevealButton();
        updateSideMenuUI(); // อัปเดต UI Side menu เริ่มต้น (เวลา, streak)
        startTimer();   // เริ่ม timer หลังจากทุกอย่างพร้อม
        gameData.startTime = Date.now();

    } catch (error) {
        console.error('Error during game initialization:', error);
        statusDiv.textContent = `Error loading game: ${error.message}. Please refresh.`;
        gameGridDiv.innerHTML = '';
        choicesDiv.innerHTML = '';
        gameData.isActive = false;
        clearInterval(gameData.timer);
        restartBtn.style.display = 'flex'; // แสดงปุ่มเริ่มใหม่เมื่อมีข้อผิดพลาด
    }
}

async function fetchPlayerData() {
    const token = localStorage.getItem('token');
    if (!token || !username) {
        console.error("fetchPlayerData: Missing token or username.");
        // ไม่ต้องแสดงข้อความที่ statusDiv ที่นี่ เพราะอาจถูกเขียนทับ
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
            if (data && typeof data.score !== 'undefined' && typeof data.correctStreak !== 'undefined' && typeof data.mostStreak !== 'undefined') {
                userScore = data.score;
                correctStreak = data.correctStreak;
                mostStreak = data.mostStreak;

                // --- อัปเดต Side Menu UI โดยตรง ---
                playerScoresSpan.textContent = userScore;
                streakSpan.textContent = correctStreak;
                mostStreakSpan.textContent = mostStreak;
                // ----------------------------------

                console.log('Player data fetched and UI updated:', { userScore, correctStreak, mostStreak });
                return true; // สำเร็จ
            } else {
                 console.error('Invalid player data received:', data);
                 // อาจจะแสดงข้อความข้อผิดพลาด แต่ระวังการเขียนทับ
                 return false; // ล้มเหลว
            }
        } else {
            if (response.status === 401 || response.status === 403) {
                console.error('Authentication failed (401/403). Redirecting...');
                localStorage.removeItem('token');
                sessionStorage.removeItem('username');
                window.location.href = 'index.html'; // Redirect ไป login
            } else {
                const errorText = await response.text();
                console.error(`Failed to fetch player data (${response.status}):`, errorText);
            }
            // ไม่ต้องแสดงข้อความที่ statusDiv ที่นี่
            return false; // ล้มเหลว
        }
    } catch (error) {
        console.error('Network or other error fetching player data:', error);
        // ไม่ต้องแสดงข้อความที่ statusDiv ที่นี่
        return false; // ล้มเหลว
    }
}

// --- ฟังก์ชันสำหรับอัปเดต Side Menu UI โดยเฉพาะ ---
function updateSideMenuUI() {
    // อัปเดตเฉพาะส่วนที่เปลี่ยนแปลงบ่อย หรือต้องการอัปเดตตามเวลา/สถานะ
    const minutes = Math.floor(gameData.timeLeft / 60);
    const seconds = gameData.timeLeft % 60;
    timeLeftSpan.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // อัปเดต score และ streak จะทำใน handleAnswer/handleTimeout โดยตรง
    // playerScoresSpan.textContent = userScore; // อาจจะซ้ำซ้อน ถ้าอัปเดตที่อื่นแล้ว
    streakSpan.textContent = correctStreak;
    mostStreakSpan.textContent = mostStreak;
    playerUsernameSpan.textContent = username; // เผื่อมีการเปลี่ยนแปลง (ไม่น่ามี)
}


function handleAnswer(selectedIndex) {
    if (!gameData.isActive || typeof selectedIndex !== 'number' || isNaN(selectedIndex)) {
        return;
    }

    gameData.isActive = false; // หยุดเกม
    clearInterval(gameData.timer); // หยุดเวลา

    const baseScoreCorrect = 100; // คะแนนพื้นฐานเมื่อตอบถูก
    const timeBonus = gameData.timeLeft >= 20 ? 50 : gameData.timeLeft >= 10 ? 25 : 0; // โบนัสเวลา
    const penaltyWrong = 100; // คะแนนที่หักเมื่อตอบผิด (ปรับค่าตามต้องการ)

    let finalScore = userScore; // คะแนนรวมสุดท้าย เริ่มต้นด้วยคะแนนปัจจุบัน
    let pointsChange = 0; // คะแนนที่เปลี่ยนแปลงในรอบนี้
    let message = ''; // ข้อความแสดงผล (อาจจะใช้หรือไม่ใช้)

    if (selectedIndex === currentImage.correct) {
        // --- ตอบถูก ---
        correctStreak++;
        if (correctStreak > mostStreak) {
            mostStreak = correctStreak;
        }
        const scoreMultiplier = 1 + (0.1 * correctStreak); // ตัวคูณตาม streak
        pointsChange = Math.round((baseScoreCorrect + timeBonus) * scoreMultiplier); // คะแนนที่ได้ในรอบนี้
        finalScore = userScore + pointsChange; // บวกเพิ่มเข้าไปในคะแนนรวม

        message = `🎉 Correct! +${pointsChange} Points`; // สร้างข้อความ (อาจจะแสดงที่อื่น)
        console.log(message, `New Total: ${finalScore}, Streak: ${correctStreak}`);

    } else {
        // --- ตอบผิด ---
        correctStreak = 0; // รีเซ็ต streak
        pointsChange = -penaltyWrong; // คะแนนที่เสียไป
        finalScore = Math.max(userScore + pointsChange, 0); // ลบคะแนน (ไม่ต่ำกว่า 0)

        message = `❌ Wrong! -${penaltyWrong} Points. Correct: ${currentImage.choices[currentImage.correct]}`;
        console.log(message, `New Total: ${finalScore}, Streak: 0`);
    }

    // --- อัปเดตค่าใน Client และ UI ทันที ---
    userScore = finalScore; // อัปเดตคะแนนรวมใน client
    playerScoresSpan.textContent = userScore; // อัปเดต UI คะแนน
    streakSpan.textContent = correctStreak;    // อัปเดต UI streak ปัจจุบัน
    mostStreakSpan.textContent = mostStreak;   // อัปเดต UI streak สูงสุด

    // --- บันทึกคะแนน/Streak ลง Server ---
    saveScoreToServer(userScore, correctStreak, mostStreak); // ส่งค่าที่อัปเดตแล้วไป

    revealAllTiles(); // เปิดภาพทั้งหมด
    restartBtn.style.display = 'flex'; // แสดงปุ่มเริ่มใหม่
}

async function saveScoreToServer(finalScoreToSave, currentCorrectStreak, currentMostStreak) {
    const token = localStorage.getItem('token');
    console.log('Attempting to save score:', { finalScoreToSave, currentCorrectStreak, currentMostStreak });

    if (!token || !username) {
        console.error('Cannot save score: Missing token or username.');
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
            console.log('Score saved successfully:', responseData);
            // ไม่จำเป็นต้องอัปเดต userScore จาก response ที่นี่แล้ว
            // เพราะเราอัปเดตใน client ไปก่อนหน้าแล้ว
        } else {
            console.error(`Failed to save score (${response.status}):`, responseData.message || response.statusText);
            // อาจจะแจ้งเตือนผู้ใช้ว่าบันทึกไม่สำเร็จ
        }
    } catch (error) {
        console.error('Network error saving score:', error);
         // อาจจะแจ้งเตือนผู้ใช้ว่ามีปัญหา network
    }
}

function startTimer() {
    clearInterval(gameData.timer); // เคลียร์ timer เก่าก่อนเริ่มใหม่
    timeLeftSpan.textContent = '00:30'; // แสดงเวลาเริ่มต้นทันที
    gameData.timer = setInterval(() => {
        if (gameData.timeLeft > 0 && gameData.isActive) {
            gameData.timeLeft--;
            updateSideMenuUI(); // อัปเดตเฉพาะ UI ที่เกี่ยวกับเวลาและ streak ใน side menu
        } else if (gameData.isActive) {
            // เวลาหมด แต่เกมยัง active อยู่ (ควรจะเกิดกรณีเดียวคือ timeLeft == 0)
            clearInterval(gameData.timer);
            handleTimeout();
        } else {
            // กรณีอื่นๆ เช่น เกมไม่ active แล้ว
             clearInterval(gameData.timer);
        }
    }, 1000);
}

function handleTimeout() {
    if (!gameData.isActive) return; // ป้องกันการทำงานซ้ำซ้อน
    gameData.isActive = false;

    console.log("Time's up!");
    const timeOutPenalty = 100; // คะแนนที่หักเมื่อหมดเวลา
    correctStreak = 0; // รีเซ็ต streak

    let finalScore = Math.max(userScore - timeOutPenalty, 0); // คำนวณคะแนนใหม่

    // --- อัปเดตค่าใน Client และ UI ---
    userScore = finalScore;
    playerScoresSpan.textContent = userScore;
    streakSpan.textContent = correctStreak;
    // mostStreak ไม่เปลี่ยนเมื่อหมดเวลา

    console.log(`⏳ Time's up! -${timeOutPenalty} Points. New Total: ${finalScore}. Correct was: ${currentImage.choices[currentImage.correct]}`);

    // --- บันทึกคะแนน/Streak ลง Server ---
    saveScoreToServer(userScore, correctStreak, mostStreak);

    revealAllTiles();
    restartBtn.style.display = 'flex'; // แสดงปุ่มเริ่มใหม่
}


function revealAllTiles() {
    document.querySelectorAll('.tile-cover').forEach(cover => {
        if (cover) {
           cover.style.opacity = '0';
           cover.style.cursor = 'default'; // ทำให้คลิกไม่ได้อีก
        }
    });
    // ปิดการใช้งานปุ่ม Random Reveal ด้วย
    const revealBtn = choicesDiv.querySelector('#random-reveal-btn');
    if(revealBtn) revealBtn.disabled = true;
    // ปิดการใช้งาน dropdown ด้วย
    const answerSelect = choicesDiv.querySelector('#answer-select');
    if(answerSelect) answerSelect.disabled = true;
}

async function renderGrid() {
    const grid = document.getElementById('game-grid');
    grid.innerHTML = ''; // Clear previous grid
    grid.style.backgroundImage = '';

    if (!currentImage || !currentImage.path) {
        console.error("Cannot render grid: currentImage data is missing.");
        grid.textContent = "Error loading image data.";
        return;
    }

    // --- คำนวณขนาดและตำแหน่ง (เหมือนเดิม) ---
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
        console.warn("Could not compute styles, using default values.", e);
    } finally {
        grid.removeChild(tempTile);
    }

    const numCols = 5;
    const numRows = 5;
    // *** แก้ไข: คำนวณขนาดที่ถูกต้องเมื่อ box-sizing: border-box (ซึ่งมักใช้กับ *) ***
    // ถ้า box-sizing: border-box, width/height รวม border/padding แล้ว
    const actualTileWidth = tileWidth; // width ที่ได้จาก getComputedStyle คือ content + padding + border
    const actualTileHeight = tileHeight; // height ที่ได้จาก getComputedStyle คือ content + padding + border

    // ระยะห่างระหว่างจุดเริ่มต้นของ tile หนึ่งไปยัง tile ถัดไป
    const horizontalStep = actualTileWidth + gap;
    const verticalStep = actualTileHeight + gap;

    // ขนาดรวมของ Background Image ที่ต้องใช้ (อิงจากขนาด tile และ gap)
    const totalBgWidth = (numCols * actualTileWidth) + ((numCols - 1) * gap);
    const totalBgHeight = (numRows * actualTileHeight) + ((numRows - 1) * gap);
    const backgroundSize = `${totalBgWidth}px ${totalBgHeight}px`;

    console.log(`Computed Grid Params: Tile(${tileWidth}x${tileHeight}), Border(${borderWidth}), Gap(${gap})`);
    console.log(`Steps: H=${horizontalStep}, V=${verticalStep}. BG Size: ${backgroundSize}`);


    // --- สร้าง Tiles ---
    for (let i = 0; i < numCols * numRows; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.style.cursor = 'pointer'; // เปลี่ยน cursor เมื่อเอาเมาส์ไปชี้

        const imgDiv = document.createElement('div');
        imgDiv.className = 'tile-img';
        imgDiv.style.backgroundImage = `url('${currentImage.path}')`;
        imgDiv.style.backgroundSize = backgroundSize;

        const row = Math.floor(i / numCols);
        const col = i % numCols;

        // *** คำนวณ Background Position ***
        // จุดเริ่มต้น (ซ้ายบน) ของ background สำหรับ tile นี้
        const backgroundPosX = -col * horizontalStep;
        const backgroundPosY = -row * verticalStep;
        imgDiv.style.backgroundPosition = `${backgroundPosX}px ${backgroundPosY}px`;

        const cover = document.createElement('div');
        cover.className = 'tile-cover';
        cover.style.opacity = '1'; // ทำให้แน่ใจว่าเริ่มต้นทึบ
        // ใช้ closure เพื่อส่ง cover ที่ถูกต้องไปยัง handleTileClick
        // cover.addEventListener('click', () => handleTileClick(cover), { once: true });
        // ให้ทำงานแค่ครั้งเดียวต่อการคลิก

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
    console.log('Tile clicked, total clicks:', clicks);
}


function renderChoices() {
    choicesDiv.innerHTML = ''; // Clear previous choices

    const select = document.createElement('select');
    select.className = 'choice-dropdown';
    select.id = 'answer-select';
    select.disabled = !gameData.isActive; // ปิดใช้งานถ้าเกมไม่ active

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
        if (!isNaN(selectedOriginalIndex)) { // ตรวจสอบว่าเป็นตัวเลข
             handleAnswer(selectedOriginalIndex);
             select.disabled = true; // ปิด dropdown หลังเลือกคำตอบ
        }
    });
    choicesDiv.appendChild(select);
}

function renderRandomRevealButton() {
    let revealBtn = choicesDiv.querySelector('#random-reveal-btn');
    if (!revealBtn) {
        revealBtn = document.createElement('button');
        revealBtn.id = 'random-reveal-btn';
        revealBtn.className = 'choice-btn btn btn-info'; // เพิ่ม class btn
        choicesDiv.appendChild(revealBtn); // เพิ่มปุ่มเข้าไปใน choicesDiv

        // ใช้ event delegation หรือ attach listener ใหม่หลังสร้างปุ่ม
         revealBtn.addEventListener('click', handleRandomReveal);
    } else {
        // ถ้าปุ่มมีอยู่แล้ว แค่อัปเดตข้อความและสถานะ
        // ต้องแน่ใจว่า listener ไม่ถูกผูกซ้ำซ้อน อาจจะต้องลบ listener เก่าก่อนถ้าไม่ชัวร์
        // หรือวิธีที่ง่ายกว่าคือสร้างปุ่มใหม่เสมอตามโค้ดเดิม (แต่ต้องจัดการ listener)
        // ลองวิธี update ปุ่มเดิม
         const newBtn = revealBtn.cloneNode(true); // โคลนปุ่ม
         revealBtn.parentNode.replaceChild(newBtn, revealBtn); // แทนที่ปุ่มเก่าด้วยปุ่มใหม่ (จะลบ listener เก่า)
         newBtn.addEventListener('click', handleRandomReveal); // ผูก listener กับปุ่มใหม่
         revealBtn = newBtn; // อ้างอิงตัวแปรไปยังปุ่มใหม่
    }


    revealBtn.textContent = `Random Reveal (${gameData.randomReveals})`;
    revealBtn.disabled = (gameData.randomReveals <= 0 || !gameData.isActive);
}


function handleRandomReveal() {
    if (gameData.randomReveals <= 0 || !gameData.isActive) return;

    const hiddenTiles = document.querySelectorAll('.tile-cover[style*="opacity: 1"]'); // หา cover ที่ยังทึบอยู่

    if (hiddenTiles.length > 0) {
        const randomIndex = Math.floor(Math.random() * hiddenTiles.length);
        const randomCover = hiddenTiles[randomIndex];

        // เรียก handleTileClick เพื่อเปิด tile และจัดการ event listener
        handleTileClick(randomCover);

        gameData.randomReveals--;
        // ไม่มี penalty คะแนนในเวอร์ชันนี้

       renderRandomRevealButton(); // อัปเดตข้อความและสถานะปุ่ม
       // updateSideMenuUI(); // ไม่จำเป็นต้องอัปเดต side menu ตอนกด reveal
    } else {
         console.log("No more tiles to reveal.");
         const revealBtn = choicesDiv.querySelector('#random-reveal-btn');
         if(revealBtn) revealBtn.disabled = true;
    }
}