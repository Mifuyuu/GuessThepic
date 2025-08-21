require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require("socket.io");

// --- นำเข้าจาก db.js ที่เราสร้างขึ้นใหม่ ---
const { connectDB, User, Score, Op, sequelize } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../node_modules/socket.io/client-dist/socket.io.js'));
});

const secretKey = process.env.JWT_SECRET || 'your_secret_key';

// Middleware to verify JWT (ปรับให้รองรับ token แบบใหม่)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).send('Authentication required.');
    }

    jwt.verify(token, secretKey, (err, user) => {
        if (err) {
             if (err.name === 'TokenExpiredError') return res.status(401).send('Token expired.');
             if (err.name === 'JsonWebTokenError') return res.status(403).send('Invalid token.');
            return res.status(403).send('Invalid token.');
        }
        req.user = { username: user.username };
        next();
    });
};


// Enter Game Endpoint (เข้าเกมโดยใช้ชื่อผู้ใช้)
app.post('/api/enter-game', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).send('กรุณากรอกชื่อผู้ใช้');
    }
    if (username.length < 3 || username.length > 12) {
        return res.status(400).send('จำเป็นต้องตั้งชื่ออย่างน้อย 3 ถึง 12 ตัวอักษร');
    }

    try {
        // ตรวจสอบว่า username ซ้ำหรือไม่ (case-insensitive)
        const existingUser = await User.findOne({ 
            where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('username')), 
                username.toLowerCase()
            )
        });
        if (existingUser) {
            return res.status(400).send('ชื่อผู้ใช้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น');
        }

        // สร้าง User ใหม่ (ไม่ต้องใช้รหัสผ่าน)
        await User.create({ username, password: 'no-password' });
        
        // สร้าง JWT token
        const payload = { username: username };
        const token = jwt.sign(payload, secretKey, { expiresIn: '24h' });

        res.status(200).json({
            message: 'Welcome to the game!',
            token: token,
            username: username
        });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).send('ชื่อผู้ใช้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น');
        }
        console.error('Error entering game:', error);
        res.status(500).send('Error entering game');
    }
});

// Save Score Endpoint (Protected)
app.post('/api/scores', authenticateToken, async (req, res) => {
    const { score: finalScoreFromClient, correctStreak: currentCorrectStreak, mostStreak: currentMostStreak } = req.body;
    const username = req.user.username;

    if (typeof finalScoreFromClient !== 'number' || typeof currentCorrectStreak !== 'number' || typeof currentMostStreak !== 'number') {
        return res.status(400).json({ message: 'Invalid score data types.' });
    }

    try {
        // Sequelize: ใช้ findOrCreate เพื่อหาหรือสร้าง record ใหม่ถ้ายังไม่มี
        const [scoreRecord, created] = await Score.findOrCreate({
            where: { username: username },
            defaults: { // ค่าเริ่มต้นถ้าต้องสร้างใหม่
                username: username,
                score: finalScoreFromClient,
                correctStreak: currentCorrectStreak,
                mostStreak: currentMostStreak
            }
        });

        // ถ้าไม่ได้สร้างใหม่ (record มีอยู่แล้ว) ให้อัปเดตค่า
        if (!created) {
            scoreRecord.score = finalScoreFromClient;
            scoreRecord.correctStreak = currentCorrectStreak;
            // อัปเดต mostStreak เฉพาะเมื่อค่าใหม่สูงกว่าเดิม
            if (currentMostStreak > scoreRecord.mostStreak) {
                scoreRecord.mostStreak = currentMostStreak;
            }
            await scoreRecord.save(); // บันทึกการเปลี่ยนแปลง
        }

        io.emit('scoreUpdated');
        console.log(`Score updated for ${username} to ${scoreRecord.score}. Emitting 'scoreUpdated' event.`);

        res.status(200).json({
            message: 'Score updated successfully',
            username: scoreRecord.username,
            score: scoreRecord.score,
            correctStreak: scoreRecord.correctStreak,
            mostStreak: scoreRecord.mostStreak
        });

    } catch (error) {
        console.error(`Error updating score for user ${username}:`, error);
        res.status(500).json({ message: 'Server error while updating score' });
    }
});


// Get Player Data Endpoint (Protected)
app.get('/api/player/me', authenticateToken, async (req, res) => {
    const username = req.user.username;

    try {
        // Sequelize: ใช้ findOne เพื่อหาข้อมูล score
        const player = await Score.findOne({ where: { username: username } });

        if (player) {
            // คำนวณเวลาที่เหลือ
            let timeRemaining = player.totalGameTime;
            if (player.gameStartTime) {
                const elapsedSeconds = Math.floor((Date.now() - new Date(player.gameStartTime).getTime()) / 1000);
                timeRemaining = Math.max(0, player.totalGameTime - elapsedSeconds);
            }

            res.json({
                username: player.username,
                score: player.score,
                correctStreak: player.correctStreak,
                mostStreak: player.mostStreak,
                gameStartTime: player.gameStartTime,
                timeRemaining: timeRemaining,
                totalGameTime: player.totalGameTime
            });
        } else {
             res.json({
                username: username,
                score: 0,
                correctStreak: 0,
                mostStreak: 0,
                gameStartTime: null,
                timeRemaining: 60,
                totalGameTime: 60
             });
        }
    } catch (error) {
        console.error('Error fetching player data for', username, ':', error);
        res.status(500).send('Error fetching player data');
    }
});

// Start Game Timer Endpoint (Protected)
app.post('/api/start-game-timer', authenticateToken, async (req, res) => {
    const username = req.user.username;

    try {
        // ตรวจสอบว่า User มีอยู่ใน database หรือไม่
        const user = await User.findOne({ where: { username: username } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const [scoreRecord, created] = await Score.findOrCreate({
            where: { username: username },
            defaults: {
                username: username,
                score: 0,
                correctStreak: 0,
                mostStreak: 0,
                gameStartTime: new Date(),
                totalGameTime: 60
            }
        });

        // ถ้าไม่ได้สร้างใหม่ และยังไม่เริ่มจับเวลา ให้เริ่มจับเวลา
        if (!created && !scoreRecord.gameStartTime) {
            scoreRecord.gameStartTime = new Date();
            await scoreRecord.save();
        }

        const elapsedSeconds = scoreRecord.gameStartTime ? 
            Math.floor((Date.now() - new Date(scoreRecord.gameStartTime).getTime()) / 1000) : 0;
        const timeRemaining = Math.max(0, scoreRecord.totalGameTime - elapsedSeconds);

        res.json({
            message: 'Game timer started',
            gameStartTime: scoreRecord.gameStartTime,
            timeRemaining: timeRemaining,
            totalGameTime: scoreRecord.totalGameTime
        });

    } catch (error) {
        console.error('Error starting game timer for', username, ':', error);
        res.status(500).send('Error starting game timer');
    }
});


// Get Leaderboard Endpoint
app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    const sortBy = req.query.sortBy === 'mostStreak' ? 'mostStreak' : 'score';
    const limit = 10;
    const username = req.user?.username;

    try {
        // Sequelize: ใช้ findAll พร้อม order และ limit
        const leaderboard = await Score.findAll({
            order: [[sortBy, 'DESC']], // เรียงจากมากไปน้อย
            limit: limit,
            attributes: ['username', 'score', 'mostStreak'] // เลือกเฉพาะ field ที่ต้องการ
        });

        let userRank = null;
        let userScoreData = null;

        if (username) {
            const userPlayer = await Score.findOne({ where: { username: username } });

            if (userPlayer) {
                const userScoreValue = userPlayer[sortBy];
                // Sequelize: นับจำนวนคนที่มีคะแนนสูงกว่าเรา
                const countHigher = await Score.count({
                    where: {
                        [sortBy]: {
                            [Op.gt]: userScoreValue // Op.gt คือ "greater than"
                        }
                    }
                });
                userRank = countHigher + 1;
                userScoreData = {
                    score: userPlayer.score,
                    mostStreak: userPlayer.mostStreak
                };
            } else {
                // ถ้า user ยังไม่มีคะแนน
                const totalPlayersWithScores = await Score.count();
                userRank = totalPlayersWithScores + 1;
                userScoreData = { score: 0, mostStreak: 0 };
            }
        }

        res.json({
            leaderboard,
            ...(username && userRank && userScoreData && {
                userRank: userRank,
                userScore: userScoreData.score,
                userMostStreak: userScoreData.mostStreak
            })
        });

    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).send('Error fetching leaderboard');
    }
});

// Socket.IO Connection Handling (เหมือนเดิม)
io.on('connection', (socket) => {
  console.log('A user connected via WebSocket:', socket.id);
  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, Reason: ${reason}`);
  });
});

// Error Handling Middleware (เหมือนเดิม)
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err);
  res.status(500).send('Something broke!');
});


const PORT = process.env.PORT || 3000;

// --- ฟังก์ชันสำหรับเริ่มการทำงานของ Server ---
const startServer = async () => {
    await connectDB(); // 1. เชื่อมต่อ DB และสร้างตารางก่อน
    server.listen(PORT, () => { // 2. จากนั้นค่อยเปิด Server
        console.log(`Server (HTTP + Socket.IO) is running on http://localhost:${PORT}`);
    });
};

// --- เริ่มการทำงาน ---
startServer();

module.exports = { app, server, sequelize }; // Export sequelize สำหรับ testing
