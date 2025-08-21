const usernameInput = document.getElementById('username-input');
const enterGameBtn = document.getElementById('enter-game-btn');
const enterGameNoti = document.getElementById('enter-game-noti');

// --- Debugging Functionality ---
const debug = false;
const prefix = "[DEBUG] ";

const log = (msg) => debug && console.log(prefix + msg);
const warn = (msg) => debug && console.warn(prefix + msg);
const err = (msg) => debug && console.error(prefix + msg);
// --- End Debugging Functionality ---

function showMessage(message, isError = false) {
    enterGameNoti.textContent = message;
    enterGameNoti.style.color = isError ? '#fa4646' : '#5ae06c';
}

function clearMessage() {
    enterGameNoti.textContent = '';
}

// Enter key support
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        enterGameBtn.click();
    }
});

enterGameBtn.addEventListener('click', async () => {
    clearMessage();
    const username = usernameInput.value.trim();

    if (!username) {
        showMessage('กรุณากรอกชื่อผู้เล่น', true);
        return;
    }

    if (username.length < 3 || username.length > 12) {
        showMessage('ชื่อผู้เล่นต้องมีความยาว 3-12 ตัวอักษร', true);
        return;
    }

    try {
        enterGameBtn.disabled = true;
        enterGameBtn.textContent = 'กำลังเข้าสู่เกม...';

        const response = await fetch('/api/enter-game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username
            })
        });

        if (response.ok) {
            const data = await response.json();
            const token = data.token;
            const responseUsername = data.username;

            if (!token || !responseUsername) {
                err("Enter game response missing token or username:", data);
                showMessage('เกิดข้อผิดพลาด: ไม่สามารถเข้าเกมได้', true);
                return;
            }

            localStorage.setItem('token', token);
            sessionStorage.setItem('username', responseUsername);

            Swal.fire({
                icon: "success",
                title: `ยินดีต้อนรับ ${responseUsername}!`,
                text: "เตรียมพร้อมเข้าสู่เกม...",
                showConfirmButton: false,
                timer: 2000,
                theme: "dark"
            });

            setTimeout(() => {
                window.location.href = '/game';
            }, 2000);

        } else {
            const errorMessage = await response.text();
            showMessage(errorMessage || 'ไม่สามารถเข้าเกมได้', true);
        }
    } catch (error) {
        err('Error entering game:', error);
        showMessage('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง', true);
    } finally {
        enterGameBtn.disabled = false;
        enterGameBtn.textContent = 'เข้าสู่เกม';
    }
});