# GuessThePic - AI Coding Instructions
### Critical Developer Patterns

### Game State Management
```javascript
// Game penalties stored in localStorage for page refresh recovery
const PENDING_PENALTY_KEY = 'pendingPenaltyScore';
// Per-user played images tracking
function getPlayedImagesKey() { return `playedImages_${username}`; }
// Player timer - 60 seconds total game time per user
let playerTimer = { totalTime: 60, timeRemaining: 60, isActive: false, timer: null };
```

### SweetAlert Configuration
- All popups configured with `allowOutsideClick: false` and `allowEscapeKey: false`
- Prevents users from dismissing popups by clicking outside or pressing escape
- Forces users to wait for timer-based auto-close (2-3 seconds depending on popup type)ecture Overview

This is a real-time multiplayer picture guessing game built with:
- **Backend**: Node.js/Express with Socket.IO for real-time updates
- **Database**: SQLite with Sequelize ORM (models: User, Score)
- **Frontend**: Vanilla JS with dynamic DOM manipulation
- **Auth**: JWT tokens (username-only entry system)

## Key Components & Data Flow

### 1. Game Flow Architecture
- `public/data.json` defines all questions (path, choices, correct answer index)
- Smart image selection prevents repetition per user using `localStorage`
- Game state managed in `game.logic.js` with penalty system for page refresh/navigation
- Real-time score updates via Socket.IO broadcast to leaderboard
- **Player timer system**: Each user gets 60 seconds total game time, starts when clicking "เริ่มเล่น"

### 2. Database Schema (Sequelize)
```javascript
User: { username (unique, case-sensitive validation) }
Score: { username (FK), score, correctStreak, mostStreak, gameStartTime, totalGameTime }
```
- User-Score is 1:1 relationship via `username` foreign key
- Score updates use `findOrCreate` pattern for atomic operations
- Users created via `/api/enter-game` endpoint (one-time username registration)
- Player timer: each user gets 60 seconds total game time tracked via `gameStartTime`
- **Case-insensitive username validation**: "Player" and "player" cannot be used by different users (same username)
- **Database collation**: Username field uses BINARY collation but validation logic implements case-insensitive checks

### 3. Authentication Pattern
- Single-use usernames: each username can only be used once (prevents duplicate entries)
- Case-insensitive username validation: "Player", "player", "PLAYER" treated as same username via server-side logic
- Username field in database uses BINARY collation but server implements case-insensitive checks with LOWER() function
- JWT stored in `localStorage`, username in `sessionStorage`
- `/api/enter-game` endpoint creates user + returns token in one step
- All game APIs protected with `authenticateToken` middleware
- Frontend redirects to `/` on 401/403 responses

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
- Timer starts immediately when user clicks "เริ่มเล่น" button (not on page load)
- 60 seconds countdown displayed in side menu with color coding:
  - White: > 40 seconds remaining
  - Orange: 20-40 seconds remaining  
  - Red: < 20 seconds remaining
- Game auto-redirects to leaderboard when timer expires
- Timer managed by `startPlayerTimer()`, `stopPlayerTimer()`, `handlePlayerTimeUp()`
- **Timer continues during popups**: Player timer continues counting during result popups
- **Fixed timer initialization**: Player timer now starts counting down immediately upon first game start

### Game UI Changes
- **Removed from game page**: Leaderboard and Logout buttons (simplified UI)
- **Removed from leaderboard page**: Back to Game button (clean leaderboard UI)
- **SweetAlert behavior**: Shows result for 2 seconds, then auto-starts next question
  - No user interaction required (no buttons to click)  
  - User cannot dismiss popup by clicking outside or pressing escape
  - Automatically moves to next question after showing correct/incorrect result
- **Auto-logout from leaderboard**: Users automatically logged out after 15 seconds on leaderboard page
- **Player time-up popup**: Shows for 3 seconds when player timer expires, then auto-redirects to leaderboard
- **Reveal button placement**: Random reveal button moved to side menu (bottom-right area)
- **Enhanced button styles**: Choice buttons and reveal button use modern gradient designs with hover effects

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
npm run dev    # Development with nodemon (auto-restart on changes)
npm start      # Production (node server directly)
```

### Database Operations
- Auto-sync tables via `sequelize.sync()` in `server/db.js`
- Use `force: false` by default to preserve existing data (changed from `force: true`)
- Use `force: true` for schema changes (destructive - recreates tables)
- SQLite file stored at `data/database.sqlite`
- Database file auto-created if deleted, with empty tables initialized
- Username validation: BINARY collation in database + case-insensitive server logic using LOWER() function

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

### Clean URL Routes
- `GET /` - serves `index.html` (login page)
- `GET /game` - serves `game.html` (game page) 
- `GET /leaderboard` - serves `scoreboard.html` (leaderboard page)
- All frontend redirects use clean URLs without .html extension

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
- Enhanced UI components:
  - Choice buttons use gradient backgrounds with individual color schemes
  - Reveal button positioned in side menu with modern styling
  - Hover effects and animations for better user experience

## Project-Specific Conventions

- Thai language used for user-facing messages and questions
- Streak bonuses: `1 + (0.1 * correctStreak)` multiplier
- Time bonuses: `1 + (0.1 * Math.floor(timeLeft / 5))` multiplier  
- Consistent 100-point penalties for wrong answers/timeouts/refresh
- Socket.IO emits `scoreUpdated` (no data) - clients fetch updated leaderboard
- Environment variables in `examples.env` template (copy to `.env`)
- Current branch: 3.0.0 (development version)
- Project created by Seksun
