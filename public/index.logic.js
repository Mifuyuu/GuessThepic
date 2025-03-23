// signin.js

let serverPort = 5000;

// Element selections
const signupUsernameInput = document.getElementById('signup-username');
const signupPasswordInput = document.getElementById('signup-password');
const signinUsernameInput = document.getElementById('signin-username');
const signinPasswordInput = document.getElementById('signin-password');
const signupBtn = document.getElementById('signup-btn');
const signinBtn = document.getElementById('signin-btn');
const authMessageDiv = document.getElementById('auth-message');

async function fetchServerPort() {
    try {
        const response = await fetch('http://localhost:5000/api/port');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        serverPort = data.port;
        console.log('Server port:', serverPort);
    } catch (error) {
        console.error('Error fetching server port:', error);
    }
}

fetchServerPort();

// Sign Up event listener
signupBtn.addEventListener('click', async () => {
    const username = signupUsernameInput.value.trim();
    const password = signupPasswordInput.value.trim();

    if (!username || !password) {
        authMessageDiv.textContent = 'Please enter a username and password.';
        return;
    }

    try {
        const response = await fetch(`http://localhost:${serverPort}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        if (response.ok) {
            authMessageDiv.textContent = 'Sign up successful! Please sign in.';
        } else {
            const errorMessage = await response.text();
            authMessageDiv.textContent = errorMessage || 'Sign up failed.';
        }
    } catch (error) {
        console.error('Error signing up:', error);
        authMessageDiv.textContent = 'Error signing up. Please try again.';
    }
});

// Sign In event listener
signinBtn.addEventListener('click', async () => {
    const signinUsername = signinUsernameInput.value.trim();
    const password = signinPasswordInput.value.trim();

    if (!signinUsername || !password) {
        authMessageDiv.textContent = 'Please enter a username and password.';
        return;
    }

    try {
        const response = await fetch(`http://localhost:${serverPort}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: signinUsername,
                password: password
            })
        });

        if (response.ok) {
            const data = await response.json();
            const token = data.token;
            localStorage.setItem('token', token);
            sessionStorage.setItem('username', signinUsername);
            authMessageDiv.textContent = 'Sign in successful! Redirecting to game...';
            window.location.href = 'game.html'; // Redirect to game.html
        } else {
            const errorMessage = await response.text();
            authMessageDiv.textContent = errorMessage || 'Sign in failed.';
        }
    } catch (error) {
        console.error('Error signing in:', error);
        authMessageDiv.textContent = 'Error signing in. Please try again.';
    }
});