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

// Middleware to verify JWT (เหมือนเดิม)
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
        req.user = { userId: user.userId, username: user.username };
        next();
    });
};


// Register (Sign-up) Endpoint
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Please enter a username and password.');
    }
    if (password.length < 8) {
        return res.status(400).send('Password must be at least 8 characters long.');
    }
    if (username.length < 3 || username.length > 12) {
        return res.status(400).send('Username must be between 3 to 12 characters long.');
    }

    try {
        // Sequelize: ใช้ User.create() ซึ่งจะสร้างและบันทึกข้อมูลลง DB ทันที
        // Hook 'beforeCreate' ที่เราตั้งไว้ใน db.js จะทำการ hash password อัตโนมัติ
        await User.create({ username, password });
        res.status(201).send('User registered successfully!');
    } catch (error) {
        // Sequelize จะโยน error ที่มี name: 'SequelizeUniqueConstraintError' ถ้า username ซ้ำ
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).send('Username already exists.');
        }
        console.error('Error registering user:', error);
        res.status(500).send('Error registering user');
    }
});

// Login (Sign-in) Endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

     if (!username || !password) {
        return res.status(400).send('Please provide username and password.');
    }

    try {
        // Sequelize: ใช้ findOne และระบุเงื่อนไขใน 'where'
        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(401).send('Invalid username or password.');
        }

        // Method 'comparePassword' ที่เราเพิ่มใน db.js ยังคงใช้ได้เหมือนเดิม
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).send('Invalid username or password.');
        }

        // userId ใน Sequelize คือ 'id' (primary key)
        const payload = { userId: user.id, username: user.username };
        const token = jwt.sign(payload, secretKey, { expiresIn: '1h' });

        res.status(200).json({
            message: 'Login successful!',
            token: token,
            username: user.username
        });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Error logging in');
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
            res.json({
                username: player.username,
                score: player.score,
                correctStreak: player.correctStreak,
                mostStreak: player.mostStreak
            });
        } else {
             res.json({
                username: username,
                score: 0,
                correctStreak: 0,
                mostStreak: 0
             });
        }
    } catch (error) {
        console.error('Error fetching player data for', username, ':', error);
        res.status(500).send('Error fetching player data');
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
