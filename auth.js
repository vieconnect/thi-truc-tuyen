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

// Bộ nhớ đệm giữ thông tin Google tạm thời khi bổ sung dữ liệu bước cuối
let tempGoogleUser = null;

// Kiểm tra quyền truy cập bảo mật khi điều hướng
(function() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const path = window.location.pathname;
    const isLoginPage = path.includes('index.html') || path.endsWith('/') || path === '';
    
    if (!currentUser && !isLoginPage) {
        window.location.replace('index.html');
    } else if (currentUser && isLoginPage) {
        if (currentUser.role === 'admin') {
            window.location.replace('admin-users.html');
        } else {
            window.location.replace('dashboard.html');
        }
    }
})();

// --- 2. Cơ chế điều khiển SPA Forms ---
function switchForm(formId) {
    const forms = ['loginSection', 'registerSection', 'forgotSection', 'googleUpdateSection'];
    forms.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === formId) ? 'block' : 'none';
    });
}

function cleanUsername(email) {
    return email.replace(/[@.]/g, '_');
}

// --- 3. Các chức năng Authentication ---

// Đăng ký tài khoản mới (Email truyền thống)
async function registerWithEmail(email, password, fullName, userClass, birthday, age, position) {
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
            birthday: birthday || "Chưa cập nhật",
            age: age || "Chưa rõ",
            position: position || "Thí sinh",
            sbd: "TS-" + Math.floor(1000 + Math.random() * 9000),
            isLocked: false,
            role: "user", 
            exams: {},
            examStatus: "Chưa bắt đầu"
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

// Đăng nhập bằng Google
async function loginWithProvider(providerType) {
    let provider = new firebase.auth.GoogleAuthProvider();
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

        // Trường hợp tài khoản mới tinh từ Google chưa có trong hệ thống Realtime DB
        if (!dbUser) {
            tempGoogleUser = {
                username: username,
                email: user.email,
                name: user.displayName,
                sbd: "TS-" + Math.floor(1000 + Math.random() * 9000),
                isLocked: false,
                role: "user",
                exams: {},
                examStatus: "Chưa bắt đầu"
            };
            // Chuyển sang form yêu cầu cập nhật nốt thông tin phụ
            switchForm('googleUpdateSection');
            return;
        }

        // Nếu đã có thông tin rồi thì tiến hành đăng nhập trực tiếp luôn
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

// Hàm bổ sung dữ liệu cho thí sinh đăng nhập bằng Google lần đầu
async function handleGoogleAdditionalData() {
    if (!tempGoogleUser) return;
    
    const uClass = document.getElementById('gClass').value.trim();
    const uPosition = document.getElementById('gPosition').value;
    const uBirthday = document.getElementById('gBirthday').value;
    const uAge = document.getElementById('gAge').value.trim();

    if(!uClass || !uBirthday || !uAge) {
        return alert("Vui lòng nhập đầy đủ Lớp, Ngày sinh và Tuổi của bạn!");
    }

    // Gộp dữ liệu nhập thêm vào cấu trúc gốc
    tempGoogleUser.class = uClass;
    tempGoogleUser.position = uPosition;
    tempGoogleUser.birthday = uBirthday;
    tempGoogleUser.age = uAge;

    try {
        await database.ref('users/' + tempGoogleUser.username).set(tempGoogleUser);
        localStorage.setItem('currentUser', JSON.stringify(tempGoogleUser));
        alert("Cập nhật thông tin tài khoản thành công!");
        
        window.location.replace('dashboard.html');
    } catch(err) {
        alert("Lỗi lưu dữ liệu: " + err.message);
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
    window.location.replace('index.html');
}