# GuessThePic - AI Coding Instructions

## Architecture Overview

This is a real-time multiplayer picture guessing game built with:
- **Backend**: Node.js/Express with Socket.IO for real-time updates
- **Database**: SQLite with Sequelize ORM (models: User, Score)
- **Frontend**: Vanilla JS with dynamic DOM manipulation
- **Auth**: JWT tokens (no passwords - username-only entry system)

## Key Components & Data Flow

### 1. Game Flow Architecture
- `public/data.json` defines all questions (path, choices, correct answer index)
- Smart image selection prevents repetition per user using `localStorage`
- Game state managed in `game.logic.js` with penalty system for page refresh/navigation
- Real-time score updates via Socket.IO broadcast to leaderboard

### 2. Database Schema (Sequelize)
```javascript
User: { username (unique), password (nullable - not used) }
Score: { username (FK), score, correctStreak, mostStreak }
```
- User-Score is 1:1 relationship via `username` foreign key
- Score updates use `findOrCreate` pattern for atomic operations
- Users created via `/api/enter-game` endpoint (one-time username registration)

### 3. Authentication Pattern
- Single-use usernames: each username can only be used once (prevents duplicate entries)
- JWT stored in `localStorage`, username in `sessionStorage`
- `/api/enter-game` endpoint creates user + returns token in one step
- All game APIs protected with `authenticateToken` middleware
- Frontend redirects to `index.html` on 401/403 responses

## Critical Developer Patterns

### Game State Management
```javascript
// Game penalties stored in localStorage for page refresh recovery
const PENDING_PENALTY_KEY = 'pendingPenaltyScore';
// Per-user played images tracking
function getPlayedImagesKey() { return `playedImages_${username}`; }
```

### Real-time Updates
- Server emits `scoreUpdated` event after score saves
- Leaderboard auto-refreshes via Socket.IO listeners
- Animated DOM updates with CSS transitions in `leaderboard.logic.js`

### Error Handling Convention
```javascript
// Consistent debug logging pattern across all files
const debug = false;
const log = (msg) => debug && console.log("[DEBUG] " + msg);
```

## Development Workflows

### Starting the Application
```bash
npm run dev    # Development with nodemon
npm start      # Production
```

### Database Operations
- Auto-sync tables via `sequelize.sync()` in `server/db.js`
- No manual migrations - schema changes require `force: true` (destructive)
- SQLite file stored at `data/database.sqlite`

### Adding New Questions
1. Add entries to `public/data.json` with format:
```json
{
  "path": "imgs/XXX.webp",
  "questions": "ภาพนี้คืออะไร?", 
  "correct": 0,
  "choices": ["Answer1", "Answer2", "Answer3", "Answer4"]
}
```
2. Place corresponding image in `public/imgs/`

## Key Integration Points

### Frontend-Backend Communication
- All authenticated routes expect `Authorization: Bearer ${token}` header
- Score updates require all three values: `score`, `correctStreak`, `mostStreak`
- Socket.IO connection established on leaderboard page for live updates

### Client-Side State Persistence
- Game progress survives page refresh via penalty recovery system
- User-specific played images tracked per username in localStorage
- Authentication state split: token in localStorage, username in sessionStorage

### CSS Grid System
- Game uses 5x5 tile grid with dynamic background positioning
- Each tile shows portion of image via calculated `backgroundPosition`
- Reveal animations handled through opacity transitions on `.tile-cover`

## Project-Specific Conventions

- Thai language used for user-facing messages and questions
- Streak bonuses: `1 + (0.1 * correctStreak)` multiplier
- Time bonuses: `1 + (0.1 * Math.floor(timeLeft / 5))` multiplier  
- Consistent 100-point penalties for wrong answers/timeouts/refresh
- Socket.IO emits `scoreUpdated` (no data) - clients fetch updated leaderboard
- Environment variables in `examples.env` template (copy to `.env`)
