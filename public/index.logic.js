const signupUsernameInput = document.getElementById('signup-username');
const signupPasswordInput = document.getElementById('signup-password');
const signinUsernameInput = document.getElementById('signin-username');
const signinPasswordInput = document.getElementById('signin-password');
const signupBtn = document.getElementById('signup-btn');
const signinBtn = document.getElementById('signin-btn');
const signup_noti = document.getElementById('signup-noti');
const signin_noti = document.getElementById('signin-noti');

// --- Debugging Functionality ---
const debug = false;
const prefix = "[DEBUG] ";

const log = (msg) => debug && console.log(prefix + msg);
const warn = (msg) => debug && console.warn(prefix + msg);
const err = (msg) => debug && console.error(prefix + msg);
// --- End Debugging Functionality ---

function showSignupMessage(message, isError = false) {
    signup_noti.textContent = message;
    signup_noti.style.color = isError ? '#fa4646' : '#5ae06c';
}
function showSigninMessage(message, isError = false) {
    signin_noti.textContent = message;
    signin_noti.style.color = isError ? '#fa4646' : '#5ae06c';
}

function clearSignupMsg() {
    signup_noti.textContent = '';
}
function clearSigninMsg() {
    signin_noti.textContent = '';
}


signupBtn.addEventListener('click', async () => {
    clearSignupMsg();
    const username = signupUsernameInput.value.trim();
    const password = signupPasswordInput.value.trim();


    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const responseBodyText = await response.text();

        if (response.ok) {
            showSignupMessage('Sign up successful! Please sign in.', false);
            signupUsernameInput.value = '';
            signupPasswordInput.value = '';
        } else {
            showSignupMessage(responseBodyText || `Sign up failed (Status: ${response.status}).`, true);
        }
    } catch (error) {
        console.error('Error signing up:', error);
        showSignupMessage('Network error during sign up. Please check connection and try again.', true);
    }
});

signinBtn.addEventListener('click', async () => {
    clearSigninMsg();
    const signinUsername = signinUsernameInput.value.trim();
    const password = signinPasswordInput.value.trim();

    if (!signinUsername || !password) {
        showSigninMessage('Please enter your username and password.', true);
        return;
    }

    try {
        const response = await fetch('/api/login', {
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
            const responseUsername = data.username;

            if (!token || !responseUsername) {
                 err("Login response missing token or username:", data);
                 showSigninMessage('Login failed: Invalid response from server.', true);
                 return;
            }

            localStorage.setItem('token', token);
            sessionStorage.setItem('username', responseUsername);
            // showSigninMessage('Sign in successful! Redirecting...', false);
            Swal.fire({
                // position: "top-end",
                icon: "success",
                title: "Sign in successful! Redirecting...",
                showConfirmButton: false,
                timer: 1500,
                theme: "dark"
            });

            setTimeout(() => {
                 window.location.href = 'game.html';
            }, 2000);

        } else {
            const errorMessage = await response.text();
            showSigninMessage(errorMessage || `Sign in failed (Status: ${response.status}).`, true);
        }
    } catch (error) {
        err('Error signing in:', error);
        showSigninMessage('Network error during sign in. Please check connection and try again.', true);
    }
});