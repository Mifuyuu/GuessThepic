// Element selections (คงเดิม)
const signupUsernameInput = document.getElementById('signup-username');
const signupPasswordInput = document.getElementById('signup-password');
const signinUsernameInput = document.getElementById('signin-username');
const signinPasswordInput = document.getElementById('signin-password');
const signupBtn = document.getElementById('signup-btn');
const signinBtn = document.getElementById('signin-btn');
const authMessageDiv = document.getElementById('auth-message');

// --- ลบส่วนที่เกี่ยวกับ serverPort และ fetchServerPort ออก ---
// let serverPort = 3000; // ไม่ต้องใช้แล้ว
// async function fetchServerPort() { ... } // ไม่ต้องใช้แล้ว
// fetchServerPort(); // ไม่ต้องเรียกแล้ว
// --- สิ้นสุดการลบ ---

// Function to display messages
function showAuthMessage(message, isError = false) {
    authMessageDiv.textContent = message;
    authMessageDiv.style.color = isError ? 'red' : 'green'; // หรือใช้ class CSS
}

// Function to clear messages
function clearAuthMessage() {
    authMessageDiv.textContent = '';
}

// Sign Up event listener
signupBtn.addEventListener('click', async () => {
    clearAuthMessage();
    const username = signupUsernameInput.value.trim();
    const password = signupPasswordInput.value.trim();

    if (!username || !password) {
        showAuthMessage('Please enter a username and password.', true);
        return;
    }
    // Basic validation (ควรเพิ่มให้ดีขึ้น)
    if (username.length < 3) {
         showAuthMessage('Username must be at least 3 characters long.', true);
         return;
    }
    if (password.length < 8) {
         showAuthMessage('Password must be at least 8 characters long.', true);
         return;
    }


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
            showAuthMessage('Sign up successful! Please sign in.', false);
            // Optionally clear fields
            signupUsernameInput.value = '';
            signupPasswordInput.value = '';
        } else { // Status 4xx, 5xx
            // แสดงข้อความจาก server ถ้ามี, หรือข้อความทั่วไป
            showAuthMessage(responseBodyText || `Sign up failed (Status: ${response.status}).`, true);
        }
    } catch (error) {
        console.error('Error signing up:', error);
        showAuthMessage('Network error during sign up. Please check connection and try again.', true);
    }
});

// Sign In event listener
signinBtn.addEventListener('click', async () => {
    clearAuthMessage(); // Clear previous messages
    const signinUsername = signinUsernameInput.value.trim();
    const password = signinPasswordInput.value.trim();

    if (!signinUsername || !password) {
        showAuthMessage('Please enter your username and password.', true);
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
                 showAuthMessage('Login failed: Invalid response from server.', true);
                 return;
            }

            localStorage.setItem('token', token);
            sessionStorage.setItem('username', responseUsername); // ใช้ username จาก response
            showAuthMessage('Sign in successful! Redirecting...', false);
            // Redirect after a short delay to show the message
            setTimeout(() => {
                 window.location.href = 'game.html'; // Ensure game.html exists
            }, 1000);

        } else { // Status 4xx, 5xx
            const errorMessage = await response.text(); // อ่าน text error
            showAuthMessage(errorMessage || `Sign in failed (Status: ${response.status}).`, true);
        }
    } catch (error) {
        console.error('Error signing in:', error);
        showAuthMessage('Network error during sign in. Please check connection and try again.', true);
    }
});