const sortBySelect = document.getElementById('sort-by');
const leaderboardDiv = document.getElementById('leaderboard');
const userRankDiv = document.getElementById('user-rank');
const statusMessage = document.getElementById('status-message');
const backToGameButton = document.getElementById('back-to-game');
const USER_OUTSIDE_ROW_ID = 'user-rank-outside-row';

// --- State Variables ---
let playerElements = new Map(); // Map: username -> { element: HTMLElement, data: Object, currentRank: number }
let currentUsername = sessionStorage.getItem('username');
const token = localStorage.getItem('token');
let isFetchingLeaderboard = false;

// --- Socket.IO Client Setup ---
const socket = io({ /* auth: { token: token } */ });

// --- Debugging Functionality ---
const debug = false;
const prefix = "[DEBUG] ";

const log = (msg) => debug && console.log(prefix + msg);
const warn = (msg) => debug && console.warn(prefix + msg);
const err = (msg) => debug && console.error(prefix + msg);
// --- End Debugging Functionality ---

socket.on('connect', () => console.log('Socket.IO Connected:', socket.id));
socket.on('scoreUpdated', () => {
    log('Received "scoreUpdated" event.');
    requestLeaderboardUpdate();
});
socket.on('disconnect', (reason) => {
    console.warn('Socket.IO Disconnected. Reason:', reason);
    setStatusMessage('Real-time updates disconnected.', 'warning');
});
socket.on('connect_error', (error) => {
    console.error('Socket.IO Connection Error:', error);
    setStatusMessage(`Connection error: ${error.message}. Real-time updates unavailable.`, 'error');
});
// --- End Socket.IO Setup ---

// --- Helper Functions ---
function setStatusMessage(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.style.display = 'block';
    leaderboardDiv.querySelectorAll('.scoreboard-row').forEach(el => el.style.opacity = '0');
    userRankDiv.style.display = 'none';
}

function formatRank(rank) {
    if (rank === null || rank === undefined || rank <= 0) return '';
    const j = rank % 10, k = rank % 100;
    if (j == 1 && k != 11) return rank + "st";
    if (j == 2 && k != 12) return rank + "nd";
    if (j == 3 && k != 13) return rank + "rd";
    return rank + "th";
}

function clearAuthDataAndRedirect() {
    localStorage.removeItem('token');
    sessionStorage.removeItem('username');
    window.location.href = 'index.html';
}
// --- End Helper Functions ---

// --- Function to request update (with guard) ---
function requestLeaderboardUpdate() {
    if (isFetchingLeaderboard) {
        console.log("Already fetching leaderboard, skipping.");
        return;
    }
    isFetchingLeaderboard = true;
    console.log("Setting fetch flag to TRUE.");
    fetchLeaderboard(sortBySelect.value)
        .catch(err => console.error("Error caught after fetchLeaderboard:", err))
        .finally(() => {
            isFetchingLeaderboard = false;
            console.log("Fetch process complete, flag reset to FALSE.");
        });
}

// --- Event Listeners ---
backToGameButton.addEventListener('click', () => window.location.href = 'game.html');
sortBySelect.addEventListener('change', () => {
    console.log(`Sort changed to: ${sortBySelect.value}`);
    requestLeaderboardUpdate();
});
// --- End Event Listeners ---

// --- Core Function: Fetch and Update Leaderboard ---
async function fetchLeaderboard(sortBy = 'score') {
    console.log(`Attempting fetch: sortBy = "${sortBy}"`);
    currentUsername = sessionStorage.getItem('username');
    const currentToken = localStorage.getItem('token');
    if (!currentToken || !currentUsername) {
        console.error('Auth missing before fetch. Redirecting.');
        clearAuthDataAndRedirect();
        throw new Error("Authentication missing");
    }

    setStatusMessage('Loading leaderboard...', 'info');
    // Ensure the special user row is hidden during load
    document.getElementById(USER_OUTSIDE_ROW_ID)?.remove();


    try {
        const response = await fetch(`/api/leaderboard?sortBy=${sortBy}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (response.status === 401 || response.status === 403) {
            console.error(`Auth Error (${response.status}) fetching. Redirecting...`);
            clearAuthDataAndRedirect();
            throw new Error("Authentication failed");
        }
        if (!response.ok) {
            setStatusMessage(`Error loading: ${response.status} ${response.statusText}`, 'error');
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        statusMessage.style.display = 'none'; // Hide loading/error
        leaderboardDiv.querySelectorAll('.scoreboard-row').forEach(el => el.style.opacity = '1'); // Make rows potentially visible

        if (!data || !Array.isArray(data.leaderboard)) {
            console.error("Invalid data format:", data);
            setStatusMessage("Failed to process data.", 'error');
            throw new Error("Invalid data format");
        }

        // --- DOM Update Logic ---
        console.log("Received data:", data);
        const newLeaderboardData = data.leaderboard.slice(0, 10); // Ensure only top 10 max
        const currentUserRankData = {
            rank: data.userRank,
            score: data.userScore,
            mostStreak: data.userMostStreak
        };
        const currentUserIsRanked = currentUserRankData.rank !== null && currentUserRankData.rank !== undefined;

        const newUsernamesInTop10 = new Set(newLeaderboardData.map(p => p.username));
        const nextPlayerElements = new Map();

        // 1. Update or Create TOP 10 elements
        newLeaderboardData.forEach((playerData, index) => {
            const username = playerData.username || 'Unknown';
            // ** Calculate the value based on current sortBy **
            const value = sortBy === 'score' ? (playerData.score ?? 0) : (playerData.mostStreak ?? 0);
            const rank = index + 1; // Rank based on array order (server handled tie-breaking)

            let existingEntry = playerElements.get(username);
            let playerDiv;

            if (existingEntry) {
                // --- UPDATE EXISTING ---
                playerDiv = existingEntry.element;
                const nameSpan = playerDiv.querySelector('span:first-child');
                const valueSpan = playerDiv.querySelector('span:last-child');

                if (nameSpan) nameSpan.textContent = `${rank}. ${username}`;
                if (valueSpan) valueSpan.textContent = value; // Update value

                playerDiv.style.setProperty('--i', index); // Update position

                const newRankClass = `rank-${rank}`; // Update rank class for styling
                if (!playerDiv.classList.contains(newRankClass)) {
                    playerDiv.className = playerDiv.className.replace(/rank-\d+/g, '').trim(); // Remove old rank class
                    playerDiv.classList.add('scoreboard-row', newRankClass);
                }
                // Update highlight
                if (username === currentUsername) playerDiv.classList.add('user-highlight');
                else playerDiv.classList.remove('user-highlight');

                playerElements.delete(username); // Mark as processed

            } else {
                // --- CREATE NEW ---
                playerDiv = document.createElement('div');
                playerDiv.className = `scoreboard-row rank-${rank}`;
                if (username === currentUsername) playerDiv.classList.add('user-highlight');
                playerDiv.style.setProperty('--i', index);
                playerDiv.innerHTML = `
                            <span>${rank}. ${username}</span>
                            <span>${value}</span>
                        `;
                leaderboardDiv.appendChild(playerDiv);
            }
            nextPlayerElements.set(username, { element: playerDiv, data: playerData, currentRank: rank });
        });

        // 2. Remove elements no longer in the Top 10 list
        playerElements.forEach((entryToRemove, username) => {
            console.log(` -> Removing element for ${username} (dropped off top 10)`);
            const element = entryToRemove.element;
            element.classList.add('removing');
            setTimeout(() => {
                if (element.parentNode === leaderboardDiv && !nextPlayerElements.has(username)) {
                    leaderboardDiv.removeChild(element);
                }
            }, 500); // Animation time
        });

        // 3. Update the main state map
        playerElements = nextPlayerElements;

        // 4. Handle the special row for user outside top 10
        handleUserOutsideTop10(currentUserRankData, newUsernamesInTop10, sortBy);

        // 5. Update User Rank Summary Display (optional div)
        if (currentUserIsRanked) {
            const userValue = sortBy === 'score' ? (currentUserRankData.score ?? 0) : (currentUserRankData.mostStreak ?? 0);
            const rankString = formatRank(currentUserRankData.rank);
            userRankDiv.innerHTML = `Your Rank: <span id="user-rank-text">${rankString} (${sortBy === 'score' ? 'Score' : 'Streak'}: ${userValue})</span>`;
            userRankDiv.style.display = 'block';
        } else {
            userRankDiv.style.display = 'none'; // Hide if user is unranked
        }


        // Handle empty state AFTER processing everything
        if (playerElements.size === 0 && !document.getElementById(USER_OUTSIDE_ROW_ID) && !currentUserIsRanked) {
            // Show empty message only if top 10 is empty, user isn't shown outside, and user isn't ranked at all
            setStatusMessage("No players on the leaderboard yet.", 'info');
        }

    } catch (error) {
        console.error('Error during fetchLeaderboard execution:', error);
        // Status message is likely set already, or redirect happened.
        // Avoid setting status message again if auth error caused redirect.
        if (!error.message.includes("Authentication") && !error.message.includes("Invalid data format")) {
            setStatusMessage('Could not load leaderboard.', 'error');
        }
        // Ensure the fetch flag is reset even on error within the try block
        isFetchingLeaderboard = false;
        console.log("Fetch error occurred, flag reset to FALSE.");
        // No need to re-throw here unless something else needs to catch it upstream
    }
}

// --- Helper function specifically for the user outside top 10 row ---
function handleUserOutsideTop10(userData, top10Usernames, sortBy) {
    let userRowOutside = document.getElementById(USER_OUTSIDE_ROW_ID);
    const userIsRanked = userData.rank !== null && userData.rank !== undefined;
    // ** Condition: User is ranked, rank > 10, AND user is NOT in the current top 10 list **
    const shouldShowOutside = userIsRanked && userData.rank > 10 && !top10Usernames.has(currentUsername);

    if (shouldShowOutside) {
        // Calculate value based on current sort
        const userValue = sortBy === 'score' ? (userData.score ?? 0) : (userData.mostStreak ?? 0);
        const rankString = formatRank(userData.rank); // Use formatRank

        if (!userRowOutside) { // Create if doesn't exist
            console.log(` -> Creating special row for user ${currentUsername} (Rank ${userData.rank})`);
            userRowOutside = document.createElement('div');
            userRowOutside.id = USER_OUTSIDE_ROW_ID;
            // Add both base class and specific class for styling/targeting
            userRowOutside.className = 'scoreboard-row user-rank-outside';
            // Position it as the 11th item (index 10)
            userRowOutside.style.setProperty('--i', 10);
            leaderboardDiv.appendChild(userRowOutside);
        } else {
            console.log(` -> Updating special row for user ${currentUsername} (Rank ${userData.rank})`);
        }

        userRowOutside.innerHTML = `
                      <span>${rankString}. ${currentUsername}</span> <!-- Show formatted rank -->
                      <span>${userValue}</span>
                 `;
        userRowOutside.style.opacity = '1';

    } else if (userRowOutside) {
        log(` -> Removing special row for user ${currentUsername}`);
        userRowOutside.remove();
    }
}

window.addEventListener('load', () => {
    currentUsername = sessionStorage.getItem('username');
    const currentToken = localStorage.getItem('token');
    if (currentToken && currentUsername) {
        requestLeaderboardUpdate();
    } else {
        console.log('Auth missing on load. Redirecting.');
        window.location.href = 'index.html';
    }
});