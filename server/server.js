require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // Added jwt
const connectDB = require('./db');

const app = express();
app.use(express.json());
app.use(cors());

connectDB();

app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/port', (req, res) => {
    res.json({ port: process.env.PORT || 5000 });
});

const secretKey = process.env.JWT_SECRET || 'your_secret_key'; // Replace with a strong, secret key.  Store in .env

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
    username: { type: String, required: true, ref: 'User' }, // Reference the User model
    score: Number,
    correctStreak: Number,
    mostStreak: Number
});
const Score = mongoose.model('Score', scoreSchema);

// Middleware function to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];  // Bearer <token>

    if (!token) {
        return res.status(401).send('Authentication required.');
    }

    jwt.verify(token, secretKey, (err, user) => {
        if (err) {
            return res.status(403).send('Invalid token.');
        }

        req.user = user;  // Add user information to the request object
        next(); // Proceed to the next middleware or route handler
    });
};


// Register (Sign-up) Endpoint
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Check if the username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).send('Username already exists.');
        }

        const user = new User({ username, password });
        await user.save();
        res.status(201).send('User registered successfully!');
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).send('Error registering user: ' + error.message);
    }
});

// Login (Sign-in) Endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).send('Invalid username or password.');
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).send('Invalid username or password.');
        }

        // Generate a JWT token
        const token = jwt.sign({ userId: user._id, username: user.username }, secretKey, { expiresIn: '1h' });

        res.status(200).json({ message: 'Login successful!', token: token });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Error logging in: ' + error.message);
    }
});

// Save Score Endpoint (Protected)
app.post('/api/scores', authenticateToken, async (req, res) => {
    const { score, correctStreak, mostStreak, action } = req.body;
    const username = req.user.username;  // Get the username from the token

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).send('User not found.');
        }

        let player = await Score.findOne({ username: user.username });

        if (player) {
            // Fetch existing score
            const existingScore = player.score;

            // Calculate new score based on action
            let newScore = existingScore;
            if (action === 'remove') {
                newScore = Math.max(0, existingScore - score);
            } else {
                newScore = existingScore + score;
            }

            // Delete existing record
            await Score.deleteOne({ username: user.username });

            // Create new record with updated score
            player = new Score({ username: user.username, score: newScore, correctStreak, mostStreak });
        }
        else {
             if (action === 'remove') {
                return res.status(400).send('Cannot remove score for non-existent player.');
            }
            player = new Score({ username: user.username, score: score, correctStreak, mostStreak });
        }
        await player.save();

        res.status(200).json({ message: 'Score updated successfully!', newScore: player.score });
    } catch (error) {
        console.error('Error updating score:', error);
        res.status(500).send('Error updating score: ' + error.message);
    }
});

// Get Player Data Endpoint (Protected)
app.get('/api/player/:username', authenticateToken, async (req, res) => {
    const { username } = req.params;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).send('User not found.');
        }

        const player = await Score.findOne({ username: user.username }); // Find score by username

        if (player) {
            res.json({ score: player.score, correctStreak: player.correctStreak, mostStreak: player.mostStreak });
        } else {
            res.json({ score: 0, correctStreak: 0, mostStreak: 0 });
        }
    } catch (error) {
        console.error('Error fetching player data:', error);
        res.status(500).send('Error fetching player data: ' + error.message);
    }
});

// Get Leaderboard Endpoint (Protected)
app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    const sortBy = req.query.sortBy === 'mostStreak' ? 'mostStreak' : 'score';
    const username = req.user.username;  // Get the username from the token
    try {
        const leaderboard = await Score.find().sort({ [sortBy]: -1 }).limit(10).lean();

        let userRank = null;
        let userScore = 0;
        let userMostStreak = 0;

        if (username) {
            const allPlayers = await Score.find().sort({ [sortBy]: -1 }).lean();
            const playerIndex = allPlayers.findIndex(player => player.username === username);

            if (playerIndex !== -1) {
                userRank = playerIndex + 1;
                const player = allPlayers[playerIndex];
                userScore = player.score;
                userMostStreak = player.mostStreak;
            }
        }
        res.json({ leaderboard, userRank, userScore, userMostStreak });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).send('Error fetching leaderboard');
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});