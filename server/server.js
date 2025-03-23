require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const connectDB = require('./db');

const app = express();
app.use(express.json());
app.use(cors());

connectDB();

app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/port', (req, res) => {
    res.json({ port: process.env.PORT || 5000 });
});

const scoreSchema = new mongoose.Schema({
    username: String,
    score: Number,
    correctStreak: Number,
    mostStreak: Number
});
const Score = mongoose.model('Score', scoreSchema);

app.post('/api/scores', async (req, res) => {
    const { username, score, correctStreak, mostStreak } = req.body;

    try {
        let player = await Score.findOne({ username });

        if (player) {
            player.score += score;
            player.correctStreak = correctStreak;
            player.mostStreak = Math.max(player.mostStreak, mostStreak);
        } else {
            player = new Score({ username, score, correctStreak, mostStreak });
        }

        await player.save();
        res.status(201).send('Score saved successfully!');
    } catch (error) {
        res.status(500).send('Error saving score: ' + error.message);
    }
});

app.get('/api/player/:username', async (req, res) => {
    const { username } = req.params;

    try {
        const player = await Score.findOne({ username });
        if (player) {
            res.json({ score: player.score, correctStreak: player.correctStreak, mostStreak: player.mostStreak });
        } else {
            res.json({ score: 0, correctStreak: 0, mostStreak: 0 });
        }
    } catch (error) {
        res.status(500).send('Error fetching player data: ' + error.message);
    }
});

app.get('/api/leaderboard', async (req, res) => {
    const sortBy = req.query.sortBy === 'mostStreak' ? 'mostStreak' : 'score';
    const username = req.query.username;
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