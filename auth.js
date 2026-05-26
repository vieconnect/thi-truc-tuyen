// --- 1. Khởi tạo cấu hình Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyChxMftJKVMw0IHxzIml5QMzSrjLpB93Uo",
  authDomain: "thi-truc-tuyen-vieedu.firebaseapp.com",
  databaseURL: "https://thi-truc-tuyen-vieedu-default-rtdb.firebaseio.com",
  projectId: "thi-truc-tuyen-vieedu",
  storageBucket: "thi-truc-tuyen-vieedu.firebasestorage.app",
  messagingSenderId: "910705881844",
  appId: "1:910705881844:web:8cf9d67e4f3cf53cee24a1"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

// Kiểm tra quyền truy cập bảo mật khi điều hướng
(function() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const path = window.location.pathname;
    const isLoginPage = path.includes('index.html') || path.endsWith('/') || path === '';
    
    if (!currentUser && !isLoginPage) {
        window.location.replace('index.html');
    } else if (currentUser && isLoginPage) {
        // Nếu đã đăng nhập mà cố quay lại trang login
        if (currentUser.role === 'admin') {
            window.location.replace('admin-users.html');
        } else {
            window.location.replace('dashboard.html');
        }
    }
})();

// --- 2. Cơ chế điều khiển SPA Forms ---
function switchForm(formId) {
    const forms = ['loginSection', 'registerSection', 'forgotSection'];
    forms.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === formId) ? 'block' : 'none';
    });
}

function cleanUsername(email) {
    return email.replace(/[@.]/g, '_');
}

// --- 3. Các chức năng Authentication ---

// Đăng ký tài khoản mới
async function registerWithEmail(email, password, fullName, userClass) {
    if (!email || !password || !fullName) return alert("Vui lòng điền đầy đủ thông tin bắt buộc!");
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const username = cleanUsername(email);

        const userData = {
            username: username,
            email: email,
            password: password, 
            name: fullName,
            class: userClass || "Thí sinh tự do",
            sbd: "TS-" + Math.floor(1000 + Math.random() * 9000),
            birthday: "Chưa cập nhật",
            isLocked: false,
            role: "user", // Tài khoản đăng ký mặc định là user
            exams: {},
            examStatus: "Chưa bắt đầu" // Trạng thái làm bài realtime
        };

        await database.ref('users/' + username).set(userData);
        alert("Đăng ký thành công tài khoản!");
        switchForm('loginSection');
    } catch (error) {
        alert("Lỗi đăng ký: " + error.message);
    }
}

// Đăng nhập hệ thống (Phân quyền Admin / User)
async function loginWithEmail(email, password) {
    try {
        const username = cleanUsername(email);
        const snapshot = await database.ref('users/' + username).once('value');
        const dbUser = snapshot.val();

        // Tài khoản đặc biệt cho Admin (nếu chưa có trong DB nhánh users, bạn có thể set thủ công role: "admin")
        if (dbUser && dbUser.isLocked && dbUser.role !== 'admin') {
            showLockModal(dbUser.lockInfo);
            return;
        }

        await auth.signInWithEmailAndPassword(email, password);
        localStorage.setItem('currentUser', JSON.stringify(dbUser));
        
        if (dbUser && dbUser.role === 'admin') {
            window.location.replace('admin-users.html');
        } else {
            window.location.replace('dashboard.html');
        }
    } catch (error) {
        alert("Tài khoản hoặc mật khẩu không chính xác!");
    }
}

// Khôi phục mật khẩu
async function resetPassword(email) {
    if (!email) return alert("Vui lòng nhập Email cần khôi phục!");
    try {
        await auth.sendPasswordResetEmail(email);
        alert("Liên kết thay đổi mật khẩu đã được gửi! Vui lòng kiểm tra Hòm thư của bạn.");
        switchForm('loginSection');
    } catch (error) {
        alert("Thao tác thất bại: " + error.message);
    }
}

// Đăng nhập bằng Google / Facebook
async function loginWithProvider(providerType) {
    let provider = providerType === 'google' ? new firebase.auth.GoogleAuthProvider() : new firebase.auth.FacebookAuthProvider();
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const username = cleanUsername(user.email);

        const snapshot = await database.ref('users/' + username).once('value');
        let dbUser = snapshot.val();

        if (dbUser && dbUser.isLocked && dbUser.role !== 'admin') {
            showLockModal(dbUser.lockInfo);
            auth.signOut();
            return;
        }

        if (!dbUser) {
            dbUser = {
                username: username,
                email: user.email,
                name: user.displayName,
                class: "Thí sinh tự do",
                sbd: "TS-" + Math.floor(1000 + Math.random() * 9000),
                birthday: "Chưa cập nhật",
                isLocked: false,
                role: "user",
                exams: {},
                examStatus: "Chưa bắt đầu"
            };
            await database.ref('users/' + username).set(dbUser);
        }

        localStorage.setItem('currentUser', JSON.stringify(dbUser));
        
        if (dbUser.role === 'admin') {
            window.location.replace('admin-users.html');
        } else {
            window.location.replace('dashboard.html');
        }
    } catch (error) {
        alert("Liên kết tài khoản mạng xã hội thất bại: " + error.message);
    }
}

function showLockModal(lockInfo) {
    if (document.getElementById('lockAccountModal')) {
        document.getElementById('displayName').innerText = lockInfo?.name || 'Tài khoản';
        document.getElementById('displayLockReason').innerText = lockInfo?.reason || 'Vi phạm nội quy';
        document.getElementById('displayLockTime').innerText = `Từ: ${lockInfo?.startTime || '---'} | Thời hạn: ${lockInfo?.duration || '---'}`;
        new bootstrap.Modal(document.getElementById('lockAccountModal')).show();
    } else {
        alert(`Tài khoản [${lockInfo?.sbd}] đang bị khóa!\nLý do: ${lockInfo?.reason}\nThời gian: ${lockInfo?.duration}`);
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    // Dùng replace để người dùng không bấm "Back" lại trang cũ được
    window.location.replace('index.html');
}
