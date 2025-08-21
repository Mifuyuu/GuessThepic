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
- **Player timer system**: Each user gets 60 seconds total game time, starts when clicking "เริ่มเล่น"

### 2. Database Schema (Sequelize)
```javascript
User: { username (unique, case-insensitive validation), password (nullable - not used) }
Score: { username (FK), score, correctStreak, mostStreak, gameStartTime, totalGameTime }
```
- User-Score is 1:1 relationship via `username` foreign key
- Score updates use `findOrCreate` pattern for atomic operations
- Users created via `/api/enter-game` endpoint (one-time username registration)
- Player timer: each user gets 60 seconds total game time tracked via `gameStartTime`
- **Case-insensitive usernames**: "Player" and "player" cannot be used by different users (same username)

### 3. Authentication Pattern
- Single-use usernames: each username can only be used once (prevents duplicate entries)
- Case-insensitive username validation: "Player", "player", "PLAYER" treated as same username
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
// Player timer - 60 seconds total game time per user
let playerTimer = { totalTime: 60, timeRemaining: 60, isActive: false, timer: null };
```

### Player Timer System
- Timer starts only when user clicks "เริ่มเล่น" button (not on page load)
- 60 seconds countdown displayed in side menu with color coding:
  - White: > 40 seconds remaining
  - Orange: 20-40 seconds remaining  
  - Red: < 20 seconds remaining
- Game auto-redirects to leaderboard when timer expires
- Timer managed by `startPlayerTimer()`, `stopPlayerTimer()`, `handlePlayerTimeUp()`
- **Timer pauses during popup display**: Timer stops when answering and resumes after popup closes

### Game UI Changes
- **Removed from game page**: Leaderboard and Logout buttons (simplified UI)
- **Removed from leaderboard page**: Back to Game button (clean leaderboard UI)
- **SweetAlert behavior**: Shows result for 2 seconds, then auto-starts next question
  - No user interaction required (no buttons to click)
  - Automatically moves to next question after showing correct/incorrect result
- **Auto-logout from leaderboard**: Users automatically logged out after 30 seconds on leaderboard page
- **Player time-up popup**: Shows for 3 seconds when player timer expires, then auto-redirects to leaderboard

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
- Use `force: false` by default to preserve existing data
- Use `force: true` for schema changes (destructive - recreates tables)
- SQLite file stored at `data/database.sqlite`
- Database file auto-created if deleted, with empty tables initialized
- Case-insensitive username collation: "Player" and "player" treated as same username

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
- `/api/start-game-timer` endpoint initializes 60-second countdown per player
- Game automatically redirects to leaderboard when player time expires

### New API Endpoints
- `POST /api/enter-game` - Single-step user creation + JWT token generation
- `POST /api/start-game-timer` - Initializes player timer (called on first "เริ่มเล่น")
- `GET /api/player/me` - Returns player data including `timeRemaining` calculation

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
