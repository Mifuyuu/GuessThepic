require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connectDB = require('./db');

const http = require('http');
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        // origin: "http://localhost:YOUR_FRONTEND_PORT", // <<< ระบุ Origin ของ Frontend (ถ้าแยก Port หรือ domain)
        origin: "*", // อนุญาตทุก Origin (สะดวกสำหรับการทดสอบ แต่ไม่ปลอดภัยสำหรับ Production)
        methods: ["GET", "POST"]
    }
});
// --- End Create HTTP server ---

app.use(express.json());
app.use(cors());

connectDB();

app.use(express.static(path.join(__dirname, '../public')));

// Serve Socket.IO client library
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../node_modules/socket.io/client-dist/socket.io.js'));
});

const secretKey = process.env.JWT_SECRET || 'your_secret_key';

// User Schema and Model
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

// Hash the password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        return next();
    } catch (error) {
        return next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

const User = mongoose.model('User', userSchema);

// Score Schema and Model
const scoreSchema = new mongoose.Schema({
    username: { type: String, required: true, ref: 'User', index: true }, // Added index for faster lookups
    score: { type: Number, default: 0, index: true }, // Added index for sorting
    correctStreak: { type: Number, default: 0 },
    mostStreak: { type: Number, default: 0, index: true } // Added index for sorting
});
const Score = mongoose.model('Score', scoreSchema);

// Middleware function to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        // Allow access to leaderboard even without token (optional, depends on requirements)
        // if (req.path === '/api/leaderboard' && req.method === 'GET') {
        //     return next();
        // }
        return res.status(401).send('Authentication required.');
    }

    jwt.verify(token, secretKey, (err, user) => {
        if (err) {
             // Handle specific JWT errors
             if (err.name === 'TokenExpiredError') {
                return res.status(401).send('Token expired.');
             }
             if (err.name === 'JsonWebTokenError') {
                return res.status(403).send('Invalid token.');
             }
            return res.status(403).send('Invalid token.'); // General fallback
        }

        // Attach user data (userId, username) to the request object
        req.user = { userId: user.userId, username: user.username };
        next();
    });
};


// Register (Sign-up) Endpoint
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).send('Username already exists.');
        }
        if (!username || !password) {
            return res.status(400).send('Please enter a username and password.');
        }
        if (password.length < 8) {
            return res.status(400).send('Password must be at least 8 characters long.');
        }
        if (username.length < 3 || username.length > 12) {
            return res.status(400).send('Username must be between 3 to 12 characters long.');
        }
        const user = new User({ username, password });
        await user.save();
        res.status(201).send('User registered successfully!');
    } catch (error) {
        console.error('Error registering user:', error);
        if (error.code === 11000) {
             return res.status(400).send('Username already exists.');
        }
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
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).send('Invalid username or password.');
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).send('Invalid username or password.');
        }

        // Create JWT payload
        const payload = { userId: user._id, username: user.username };
        // Sign the token
        const token = jwt.sign(payload, secretKey, { expiresIn: '1h' }); // Consider longer expiration or refresh tokens

        // Send token and potentially user info back
        res.status(200).json({
            message: 'Login successful!',
            token: token,
            username: user.username // Sending username back can be useful for the frontend
        });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Error logging in');
    }
});

// Save Score Endpoint (Protected)
app.post('/api/scores', authenticateToken, async (req, res) => {
    // รับค่า score ที่ Client คำนวณเป็น *คะแนนรวมสุดท้าย* แล้ว
    const { score: finalScoreFromClient, correctStreak: currentCorrectStreak, mostStreak: currentMostStreak } = req.body;
    const username = req.user.username;

    // --- การตรวจสอบ Data Type ยังคงเดิม ---
    if (typeof finalScoreFromClient !== 'number' || typeof currentCorrectStreak !== 'number' || typeof currentMostStreak !== 'number') {
        return res.status(400).json({ message: 'Invalid score data types (score, correctStreak, mostStreak must be numbers).' });
    }

    try {
        // --- Step 1: Upsert ยังคงเดิม, ใช้ $setOnInsert เพื่อตั้งค่าเริ่มต้นถ้าไม่มีผู้เล่น ---
        await Score.updateOne(
            { username },
            {
                $setOnInsert: {
                    username,
                    score: 0, // ค่าเริ่มต้นเมื่อสร้างครั้งแรก
                    correctStreak: 0,
                    mostStreak: 0
                }
            },
            { upsert: true }
        );

        // --- Step 2: อัปเดตข้อมูลผู้เล่นที่มีอยู่ ---
        const updatedPlayer = await Score.findOneAndUpdate(
            { username },
            {
                // --- เปลี่ยนจาก $inc เป็น $set สำหรับ score ---
                $set: {
                    score: finalScoreFromClient, // ตั้งค่า score ใน DB ให้เท่ากับคะแนนรวมที่ Client ส่งมา
                    correctStreak: currentCorrectStreak // ตั้งค่า correctStreak ปัจจุบัน
                },
                // --- $max สำหรับ mostStreak ยังคงเดิม เพราะต้องการเก็บค่าสูงสุด ---
                $max: { mostStreak: currentMostStreak }
            },
            {
                new: true, // คืนค่า document ที่อัปเดตแล้ว
                runValidators: true // เรียกใช้ validation ของ schema (ถ้ามี)
            }
        );

        // --- ส่วนที่เหลือของการจัดการ Response และ Error ยังคงเดิม ---
        if (!updatedPlayer) {
            // กรณีนี้ไม่ควรเกิดขึ้นถ้า upsert ทำงานถูกต้อง แต่ใส่ไว้เผื่อ
            console.error('CRITICAL: Could not find or update score for user after upsert:', username);
            return res.status(500).json({ message: 'Server error: Could not update score.' });
        }

        io.emit('scoreUpdated'); // แจ้งเตือน Client อื่นๆ ผ่าน Socket.IO
        console.log(`Score updated for ${username} to ${updatedPlayer.score}. Emitting 'scoreUpdated' event.`);

        // ส่งข้อมูลล่าสุดกลับไปให้ Client ที่ request มา
        res.status(200).json({
            message: 'Score updated successfully',
            username: updatedPlayer.username,
            score: updatedPlayer.score,
            correctStreak: updatedPlayer.correctStreak,
            mostStreak: updatedPlayer.mostStreak
        });

    } catch (error) {
        console.error(`Error updating score for user ${username}:`, error);
        res.status(500).json({ message: 'Server error while updating score' });
    }
});


// Get Player Data Endpoint (Protected) - Optional if game fetches data differently
app.get('/api/player/me', authenticateToken, async (req, res) => {
    const username = req.user.username; // Get username from authenticated token

    try {
        const player = await Score.findOne({ username: username });

        if (player) {
            res.json({
                username: player.username,
                score: player.score,
                correctStreak: player.correctStreak,
                mostStreak: player.mostStreak
            });
        } else {
            // If user exists but has no score record yet
             res.json({
                username: username, // Still return username
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


// Get Leaderboard Endpoint (Protected or Public - using authenticateToken makes it protected)
// authenticateToken middleware ensures req.user exists if a valid token is provided
app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    const sortBy = req.query.sortBy === 'mostStreak' ? 'mostStreak' : 'score'; // Default to 'score'
    const limit = 10; // Number of top players to fetch
    const username = req.user?.username; // Get username from token if authenticated

    try {
        // Fetch top N players sorted by the chosen field
        const leaderboard = await Score.find()
            .sort({ [sortBy]: -1, _id: 1 }) // Secondary sort by _id for consistent ordering on ties
            .limit(limit)
            .select('username score mostStreak -_id') // Select only needed fields, exclude _id
            .lean(); // Use lean for performance if not modifying docs

        let userRank = null;
        let userScoreData = null;

        // If the user is authenticated, find their rank and score
        if (username) {
            // Efficiently get the count of players with a higher score/streak
            const countHigher = await Score.countDocuments({
                [sortBy]: { $gt: (await Score.findOne({ username: username }).select(sortBy).lean())?.[sortBy] ?? -1 } // Find user's score/streak first
            });
            userRank = countHigher + 1; // Rank is count of higher scores + 1

            // Fetch the specific user's score data
            const userPlayerData = await Score.findOne({ username: username })
                                              .select('score mostStreak -_id')
                                              .lean();
            if(userPlayerData) {
                userScoreData = {
                    score: userPlayerData.score,
                    mostStreak: userPlayerData.mostStreak
                }
            } else {
                // User exists but has no score record yet
                userScoreData = { score: 0, mostStreak: 0 };
                // Find rank among all users (even those with 0 score) could be complex,
                // For simplicity, maybe rank them last or don't show rank yet.
                // Here we base rank on existing scores, so rank will be high if score is 0.
                const totalPlayersWithScores = await Score.countDocuments();
                userRank = totalPlayersWithScores + 1; // Simplistic rank if no score record
            }
        }

        res.json({
            leaderboard,
            // Only include user-specific data if authenticated
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

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
  console.log('A user connected via WebSocket:', socket.id);

  // Optional: Handle authentication for Socket.IO connections if needed
  // const token = socket.handshake.auth.token;
  // jwt.verify(token, secretKey, (err, user) => { ... });

  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, Reason: ${reason}`);
  });

  // Example: Listening for a custom event from a client
  socket.on('clientEvent', (data) => {
      console.log(`Received clientEvent from ${socket.id}:`, data);
      // Can broadcast to others: socket.broadcast.emit('eventForOthers', data);
  });

});
// --- End Socket.IO Connection Handling ---

// Fallback for SPA routing (if using client-side routing like React Router, Vue Router)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../public/index.html'));
// });


// Error Handling Middleware (Basic Example)
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err);
  res.status(500).send('Something broke!');
});


const PORT = process.env.PORT || 3000;
// --- Start the HTTP server (which includes Express and Socket.IO) ---
server.listen(PORT, () => {
    console.log(`Server (HTTP + Socket.IO) is running on http://localhost:${PORT}`);
});
// --- End Start Server ---