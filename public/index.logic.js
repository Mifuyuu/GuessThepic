// Element selections (คงเดิม)
const signupUsernameInput = document.getElementById('signup-username');
const signupPasswordInput = document.getElementById('signup-password');
const signinUsernameInput = document.getElementById('signin-username');
const signinPasswordInput = document.getElementById('signin-password');
const signupBtn = document.getElementById('signup-btn');
const signinBtn = document.getElementById('signin-btn');
const signup_noti = document.getElementById('signup-noti');
const signin_noti = document.getElementById('signin-noti');

// Function to display messages
function showSignupMessage(message, isError = false) {
    signup_noti.textContent = message;
    signup_noti.style.color = isError ? '#fa4646' : '#5ae06c';
}
function showSigninMessage(message, isError = false) {
    signin_noti.textContent = message;
    signin_noti.style.color = isError ? '#fa4646' : '#5ae06c';
}

// Function to clear messages
function clearSignupMsg() {
    signup_noti.textContent = '';
}
function clearSigninMsg() {
    signin_noti.textContent = '';
}


// Sign Up event listener
signupBtn.addEventListener('click', async () => {
    clearSignupMsg();
    const username = signupUsernameInput.value.trim();
    const password = signupPasswordInput.value.trim();


    try {
        // --- ใช้ Relative URL ---
        const response = await fetch('/api/register', { // <--- เปลี่ยนตรงนี้
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });
        // --- สิ้นสุดการเปลี่ยน ---

        const responseBodyText = await response.text(); // อ่าน response body เสมอ

        if (response.ok) { // Status 200-299
            showSignupMessage('Sign up successful! Please sign in.', false);
            // Optionally clear fields
            signupUsernameInput.value = '';
            signupPasswordInput.value = '';
        } else { // Status 4xx, 5xx
            // แสดงข้อความจาก server ถ้ามี, หรือข้อความทั่วไป
            showSignupMessage(responseBodyText || `Sign up failed (Status: ${response.status}).`, true);
        }
    } catch (error) {
        console.error('Error signing up:', error);
        showSignupMessage('Network error during sign up. Please check connection and try again.', true);
    }
});

// Sign In event listener
signinBtn.addEventListener('click', async () => {
    clearSigninMsg(); // Clear previous messages
    const signinUsername = signinUsernameInput.value.trim();
    const password = signinPasswordInput.value.trim();

    if (!signinUsername || !password) {
        showSigninMessage('Please enter your username and password.', true);
        return;
    }

    try {
        // --- ใช้ Relative URL ---
        const response = await fetch('/api/login', { // <--- เปลี่ยนตรงนี้
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: signinUsername,
                password: password
            })
        });
        // --- สิ้นสุดการเปลี่ยน ---

        if (response.ok) { // Status 200
            const data = await response.json(); // Login สำเร็จ คาดหวัง JSON
            const token = data.token;
            const responseUsername = data.username; // รับ username จาก response เพื่อความแน่นอน

            if (!token || !responseUsername) {
                 console.error("Login response missing token or username:", data);
                 showSigninMessage('Login failed: Invalid response from server.', true);
                 return;
            }

            localStorage.setItem('token', token);
            sessionStorage.setItem('username', responseUsername); // ใช้ username จาก response
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
                 window.location.href = 'game.html'; // Ensure game.html exists
            }, 2000);

        } else { // Status 4xx, 5xx
            const errorMessage = await response.text(); // อ่าน text error
            showSigninMessage(errorMessage || `Sign in failed (Status: ${response.status}).`, true);
        }
    } catch (error) {
        console.error('Error signing in:', error);
        showSigninMessage('Network error during sign in. Please check connection and try again.', true);
    }
});