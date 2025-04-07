const sortBySelect = document.getElementById('sort-by');
const leaderboardDiv = document.getElementById('leaderboard');
const userRankDiv = document.getElementById('user-rank');
const statusMessage = document.getElementById('status-message');
const backToGameButton = document.getElementById('back-to-game');
const USER_OUTSIDE_ROW_ID = 'user-rank-outside-row';
const TRANSITION_DURATION = 500;

// --- State Variables ---
let playerElements = new Map(); // Map: username -> { element: HTMLElement, data: Object, currentRank: number }
let currentUsername = sessionStorage.getItem('username');
const token = localStorage.getItem('token');
let isFetchingLeaderboard = false;

// --- Socket.IO Client Setup ---
const socket = io({ /* auth: { token: token } */ });

// --- Debugging Functionality ---
const debug = true;
const prefix = "[DEBUG] ";
const log = (msg) => debug && console.log(prefix + msg);
const warn = (msg) => debug && console.warn(prefix + msg);
const err = (msg) => debug && console.error(prefix + msg);
// --- End Debugging Functionality ---

socket.on('connect', () => log('Socket.IO Connected: ' + socket.id));
socket.on('scoreUpdated', () => {
    log('Received "scoreUpdated" event.');
    requestLeaderboardUpdate();
});
socket.on('disconnect', (reason) => {
    warn('Socket.IO Disconnected. Reason: ' + reason);
    setStatusMessage('Real-time updates disconnected.', 'warning');
});
socket.on('connect_error', (error) => {
    err('Socket.IO Connection Error: ' + error);
    setStatusMessage(`Connection error: ${error.message}. Real-time updates unavailable.`, 'error');
});
// --- End Socket.IO Setup ---

// --- Helper Functions ---
function setStatusMessage(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.style.display = 'block';
    // Optionally hide rows visually during loading/error
    // leaderboardDiv.querySelectorAll('.scoreboard-row:not(.removing)').forEach(el => el.style.opacity = '0.3');
    userRankDiv.style.display = 'none';
}

function clearStatusMessage() {
    statusMessage.style.display = 'none';
    // Restore row opacity if changed in setStatusMessage
    // leaderboardDiv.querySelectorAll('.scoreboard-row:not(.removing)').forEach(el => el.style.opacity = '1');
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
    window.location.href = 'index.html'; // Redirect to login/home
}
// --- End Helper Functions ---

// --- Function to request update (with guard) ---
function requestLeaderboardUpdate() {
    if (isFetchingLeaderboard) {
        log("Already fetching leaderboard, skipping.");
        return;
    }
    isFetchingLeaderboard = true;
    log("Setting fetch flag to TRUE.");
    fetchLeaderboard(sortBySelect.value)
        .catch(err => {
            err("Error caught after fetchLeaderboard call: " + err);
            // Ensure status message reflects error if not handled inside fetchLeaderboard
            if (!statusMessage.textContent.includes('Error') && !statusMessage.textContent.includes('Failed')) {
                 setStatusMessage('An unexpected error occurred.', 'error');
            }
        })
        .finally(() => {
            isFetchingLeaderboard = false;
            log("Fetch process complete, flag reset to FALSE.");
        });
}

// --- Event Listeners ---
backToGameButton.addEventListener('click', () => window.location.href = 'game.html');
sortBySelect.addEventListener('change', () => {
    log(`Sort changed to: ${sortBySelect.value}`);
    // Clear board instantly for visual feedback before loading new sort order
    // removeAllRowsAnimated(); // Optional: clear immediately
    requestLeaderboardUpdate();
});
// --- End Event Listeners ---


// --- Core Function: Fetch and Update Leaderboard ---
async function fetchLeaderboard(sortBy = 'score') {
    log(`Attempting fetch: sortBy = "${sortBy}"`);
    currentUsername = sessionStorage.getItem('username'); // Refresh just in case
    const currentToken = localStorage.getItem('token');
    if (!currentToken || !currentUsername) {
        err('Auth missing before fetch. Redirecting.');
        clearAuthDataAndRedirect();
        throw new Error("Authentication missing"); // Stop execution
    }

    setStatusMessage('Loading leaderboard...', 'info');
    // Mark the special user row for removal animation if it exists
    document.getElementById(USER_OUTSIDE_ROW_ID)?.classList.add('removing');

    try {
        const response = await fetch(`/api/leaderboard?sortBy=${sortBy}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (response.status === 401 || response.status === 403) {
            err(`Auth Error (${response.status}) fetching. Redirecting...`);
            clearAuthDataAndRedirect();
            throw new Error("Authentication failed"); // Stop execution
        }
        if (!response.ok) {
            const errorText = await response.text();
            setStatusMessage(`Error loading: ${response.status} ${response.statusText}. ${errorText}`, 'error');
            throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
        }

        const data = await response.json();
        clearStatusMessage(); // Hide loading message

        if (!data || !Array.isArray(data.leaderboard)) {
            err("Invalid data format received: " + JSON.stringify(data));
            setStatusMessage("Failed to process leaderboard data.", 'error');
            throw new Error("Invalid data format");
        }

        // --- DOM Update Logic ---
        log("Received data:", data);
        const newLeaderboardData = data.leaderboard.slice(0, 10); // Max top 10
        const currentUserRankData = {
            rank: data.userRank,
            score: data.userScore,
            mostStreak: data.userMostStreak
        };
        const currentUserIsRanked = currentUserRankData.rank !== null && currentUserRankData.rank !== undefined;

        const newUsernamesInTop10 = new Set(newLeaderboardData.map(p => p.username));
        const nextPlayerElements = new Map();
        const elementsToRemove = new Map(playerElements); // Clone old map to track removals

        // 1. Update or Create TOP 10 elements
        newLeaderboardData.forEach((playerData, index) => {
            const username = playerData.username || 'Unknown';
            const value = sortBy === 'score' ? (playerData.score ?? 0) : (playerData.mostStreak ?? 0);
            const rank = index + 1; // Rank based on sorted array order

            let existingEntry = playerElements.get(username);
            let playerDiv;

            if (existingEntry) {
                // --- UPDATE EXISTING ---
                playerDiv = existingEntry.element;
                elementsToRemove.delete(username); // Mark this element to keep

                log(` -> Updating ${username} to Rank ${rank}`);

                // Update content if changed
                const nameSpan = playerDiv.querySelector('span:first-child');
                const valueSpan = playerDiv.querySelector('span:last-child');
                const currentText = `${rank}. ${username}`;
                const currentValue = `${value}`;
                if (nameSpan && nameSpan.textContent !== currentText) nameSpan.textContent = currentText;
                if (valueSpan && valueSpan.textContent !== currentValue) valueSpan.textContent = currentValue;

                // Update position (CSS transition handles animation)
                playerDiv.style.setProperty('--i', index);

                // Update rank class for styling
                const newRankClass = `rank-${rank}`;
                if (!playerDiv.classList.contains(newRankClass)) {
                    playerDiv.className = playerDiv.className.replace(/rank-\d+/g, '').trim(); // Remove old rank class
                    playerDiv.classList.add('scoreboard-row', newRankClass);
                }

                // Update highlight
                if (username === currentUsername) playerDiv.classList.add('user-highlight');
                else playerDiv.classList.remove('user-highlight');

                // Ensure it's not marked for removal or entering
                playerDiv.classList.remove('removing', 'entering');

                nextPlayerElements.set(username, { element: playerDiv, data: playerData, currentRank: rank });

            } else {
                // --- CREATE NEW ---
                log(` -> Creating ${username} at Rank ${rank}`);
                playerDiv = document.createElement('div');
                // Start with 'entering' class for animation
                playerDiv.className = `scoreboard-row rank-${rank} entering`;
                if (username === currentUsername) playerDiv.classList.add('user-highlight');
                playerDiv.style.setProperty('--i', index); // Set target position
                playerDiv.innerHTML = `
                    <span>${rank}. ${username}</span>
                    <span>${value}</span>
                `;
                leaderboardDiv.appendChild(playerDiv);

                // Force reflow/repaint before removing 'entering' class to trigger transition
                // Using double requestAnimationFrame for broader compatibility
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // Check if element still exists before removing class
                       if (leaderboardDiv.contains(playerDiv)) {
                           playerDiv.classList.remove('entering');
                       }
                    });
                });

                nextPlayerElements.set(username, { element: playerDiv, data: playerData, currentRank: rank });
            }
        });

        // 2. Animate and Remove elements no longer in the Top 10 list
        elementsToRemove.forEach((entryToRemove, username) => {
            removeElementAnimated(entryToRemove.element, username);
        });

        // 3. Update the main state map
        playerElements = nextPlayerElements;

        // 4. Handle the special row for user outside top 10 (with animation)
        handleUserOutsideTop10(currentUserRankData, newUsernamesInTop10, sortBy);

        // 5. Update User Rank Summary Display (separate div)
        if (currentUserIsRanked) {
            const userValue = sortBy === 'score' ? (currentUserRankData.score ?? 0) : (currentUserRankData.mostStreak ?? 0);
            const rankString = formatRank(currentUserRankData.rank);
            userRankDiv.innerHTML = `Your Rank: <span id="user-rank-text">${rankString} (${sortBy === 'score' ? 'Score' : 'Streak'}: ${userValue})</span>`;
            userRankDiv.style.display = 'block';
        } else {
            userRankDiv.style.display = 'none';
        }


        // Handle empty state AFTER processing everything
        if (playerElements.size === 0 && !document.getElementById(USER_OUTSIDE_ROW_ID) && !currentUserIsRanked) {
            // Show empty message only if top 10 is empty, user isn't shown outside, and user isn't ranked at all
            setStatusMessage("No players on the leaderboard yet.", 'info');
        }

    } catch (error) {
        // Errors (like auth, network, data format) are caught here
        err('Error during fetchLeaderboard execution: ' + error);
        // Status message should already be set by the error handling steps above.
        // Avoid setting a generic status message here if a specific one exists.
    }
    // finally block moved outside catch to ensure it always runs after try/catch
}

// --- Helper function for animated removal ---
function removeElementAnimated(element, usernameForLog = 'element') {
    if (!element || !leaderboardDiv.contains(element) || element.classList.contains('removing')) {
        // Skip if element doesn't exist, isn't in the leaderboard, or is already being removed
        return;
    }

    log(` -> Animating removal for ${usernameForLog}`);
    element.classList.add('removing');

    // Function to handle removal after transition ends
    const handleTransitionEnd = (event) => {
        // Ensure the transition completing is one we care about (opacity or transform)
        // and the element hasn't been re-added somehow
        if ((event.propertyName === 'opacity' || event.propertyName === 'transform') && element.classList.contains('removing')) {
           if (element.parentNode === leaderboardDiv) {
               log(` -> Removing ${usernameForLog} from DOM after transition`);
               leaderboardDiv.removeChild(element);
           }
           // Clean up listener regardless of removal success
           element.removeEventListener('transitionend', handleTransitionEnd);
           clearTimeout(fallbackTimeout); // Clear the fallback timer
        }
    };

    // Fallback timer in case transitionend event doesn't fire
    const fallbackTimeout = setTimeout(() => {
        warn(` -> Fallback timeout removing ${usernameForLog}`);
        if (element.classList.contains('removing') && element.parentNode === leaderboardDiv) {
            leaderboardDiv.removeChild(element);
        }
        element.removeEventListener('transitionend', handleTransitionEnd); // Clean up listener
    }, TRANSITION_DURATION + 150); // Wait slightly longer than transition duration

    // Add the event listener
    element.addEventListener('transitionend', handleTransitionEnd);
}


// --- Helper function specifically for the user outside top 10 row (with animation) ---
function handleUserOutsideTop10(userData, top10Usernames, sortBy) {
    let userRowOutside = document.getElementById(USER_OUTSIDE_ROW_ID);
    const userIsRanked = userData.rank !== null && userData.rank !== undefined;
    // Condition: User is ranked, rank > 10, AND user is NOT in the current top 10 list being displayed
    const shouldShowOutside = userIsRanked && userData.rank > 10 && !top10Usernames.has(currentUsername);

    if (shouldShowOutside) {
        const userValue = sortBy === 'score' ? (userData.score ?? 0) : (userData.mostStreak ?? 0);
        const rankString = formatRank(userData.rank); // Use formatRank

        if (!userRowOutside) { // Create if doesn't exist
            log(` -> Creating special row for user ${currentUsername} (Rank ${userData.rank})`);
            userRowOutside = document.createElement('div');
            userRowOutside.id = USER_OUTSIDE_ROW_ID;
            // Add 'entering' class to animate in
            userRowOutside.className = 'scoreboard-row user-rank-outside entering';
            userRowOutside.style.setProperty('--i', 10); // Position as the 11th item (index 10)
            userRowOutside.innerHTML = `
                <span>${rankString}. ${currentUsername}</span> <!-- Show formatted rank -->
                <span>${userValue}</span>
            `;
            leaderboardDiv.appendChild(userRowOutside);

            // Trigger animation like other new rows
            requestAnimationFrame(() => {
                 requestAnimationFrame(() => {
                      if (leaderboardDiv.contains(userRowOutside)){
                           userRowOutside.classList.remove('entering');
                      }
                 });
            });

        } else { // Update if exists
            log(` -> Updating special row for user ${currentUsername} (Rank ${userData.rank})`);
            userRowOutside.innerHTML = `
                <span>${rankString}. ${currentUsername}</span>
                <span>${userValue}</span>
            `;
            // Ensure it's visible and not marked for removal/entering
            userRowOutside.classList.remove('removing', 'entering');
             // Explicitly set opacity to 1 in case it was fading out
            userRowOutside.style.opacity = '1';
            userRowOutside.style.transform = 'scale(1)'; // Reset scale too
            // Update position (should always be 10 for this row)
            userRowOutside.style.setProperty('--i', 10);
        }
    } else if (userRowOutside) {
        // Remove if exists and shouldn't be shown
        removeElementAnimated(userRowOutside, `special row ${currentUsername}`);
    }
}

// --- Initial Load ---
window.addEventListener('load', () => {
    currentUsername = sessionStorage.getItem('username');
    const currentToken = localStorage.getItem('token');
    if (currentToken && currentUsername) {
        log('Token and username found on load. Fetching initial leaderboard.');
        requestLeaderboardUpdate();
    } else {
        warn('Auth missing on load. Redirecting to index.html.');
        // window.location.href = 'index.html'; // Redirect if not logged in
        clearAuthDataAndRedirect();
    }
});