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
    if (!email || !password || !fullName) return showToast("Vui lòng điền đầy đủ thông tin bắt buộc!" , "danger");
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
            sbd: "EIO-" + Math.floor(1000 + Math.random() * 9000),
            isLocked: false,
            role: "user", 
            exams: {},
            examStatus: "Chưa bắt đầu"
        };

        await database.ref('users/' + username).set(userData);
        showToast("Đăng ký thành công tài khoản!" , "success");
        switchForm('loginSection');
    } catch (error) {
        showToast("Lỗi đăng ký: " + error.message , "danger");
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
        showToast("Tài khoản hoặc mật khẩu không chính xác!" , "danger");
    }
}

// Khôi phục mật khẩu
async function resetPassword(email) {
    if (!email) return showToast("Vui lòng nhập Email cần khôi phục!" , "danger");
    try {
        await auth.sendPasswordResetEmail(email);
        showToast("Liên kết thay đổi mật khẩu đã được gửi! Vui lòng kiểm tra Hòm thư của bạn." , "success");
        switchForm('loginSection');
    } catch (error) {
        showToast("Thao tác thất bại: " + error.message , "danger");
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
        showToast("Liên kết tài khoản mạng xã hội thất bại: " + error.message , "danger");
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
        return showToast("Vui lòng nhập đầy đủ Lớp, Ngày sinh và Tuổi của bạn!","danger");
    }

    // Gộp dữ liệu nhập thêm vào cấu trúc gốc
    tempGoogleUser.class = uClass;
    tempGoogleUser.position = uPosition;
    tempGoogleUser.birthday = uBirthday;
    tempGoogleUser.age = uAge;

    try {
        await database.ref('users/' + tempGoogleUser.username).set(tempGoogleUser);
        localStorage.setItem('currentUser', JSON.stringify(tempGoogleUser));
        showToast("Cập nhật thông tin tài khoản thành công!","success");
        
        window.location.replace('dashboard.html');
    } catch(err) {
        showToast("Lỗi lưu dữ liệu: " + err.message , "danger");
    }
}

function showLockModal(lockInfo) {
    if (document.getElementById('lockAccountModal')) {
        document.getElementById('displayName').innerText = lockInfo?.name || 'Tài khoản';
        document.getElementById('displayLockReason').innerText = lockInfo?.reason || 'Vi phạm nội quy';
        document.getElementById('displayLockTime').innerText = `Từ: ${lockInfo?.startTime || '---'} | Thời hạn: ${lockInfo?.duration || '---'}`;
        new bootstrap.Modal(document.getElementById('lockAccountModal')).show();
    } else {
        showToast("Tài khoản [${lockInfo?.sbd}] đang bị khóa!\nLý do: ${lockInfo?.reason}\nThời gian: ${lockInfo?.duration}","danger");
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    window.location.replace('index.html');
}

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toastId = 'toast_' + Date.now();
    let bgColor = 'bg-success';
    let icon = '<i class="bi bi-check-circle-fill me-2 fs-5"></i>';
    
    if (type === 'danger' || type === 'error') {
        bgColor = 'bg-danger';
        icon = '<i class="bi bi-exclamation-triangle-fill me-2 fs-5"></i>';
    } else if (type === 'warning') {
        bgColor = 'bg-warning text-dark';
        icon = '<i class="bi bi-exclamation-circle-fill me-2 fs-5"></i>';
    } else if (type === 'info') {
        bgColor = 'bg-info text-dark';
        icon = '<i class="bi bi-info-circle-fill me-2 fs-5"></i>';
    }

    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white ${bgColor} border-0 shadow mb-2" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="6000">
            <div class="d-flex">
                <div class="toast-body d-flex align-items-center">
                    ${icon}
                    <span>${message}</span>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="progress" style="height: 3px; background: rgba(255,255,255,0.2);">
                <div class="progress-bar" role="progressbar" style="width: 100%; background-color: #fff; transition: width 6s linear;"></div>
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    const toastElement = document.getElementById(toastId);
    const bsToast = new bootstrap.Toast(toastElement);
    bsToast.show();

    const progressBar = toastElement.querySelector('.progress-bar');
    setTimeout(() => {
        if(progressBar) progressBar.style.width = '0%';
    }, 50);

    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}
