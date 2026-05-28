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

// Biến lưu giữ ID luồng đếm thời gian tự động đăng xuất ngầm (Áp dụng cho mọi trang trong)
let autoLogoutTimer = null;
// Bộ nhớ đệm giữ thông tin Google tạm thời khi bổ sung dữ liệu bước cuối
let tempGoogleUser = null;

function cleanUsername(email) {
    return email ? email.replace(/[@.]/g, '_') : '';
}

// ===================================================
// CƠ CHẾ BẢO MẬT & LẮNG NGHE KHÓA REALTIME TOÀN HỆ THỐNG
// ===================================================
(function() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const path = window.location.pathname;
    const isLoginPage = path.includes('index.html') || path.endsWith('/') || path === '';
    
    // 1. Điều hướng bảo vệ tài nguyên cơ bản
    if (!currentUser && !isLoginPage) {
        window.location.replace('index.html');
        return;
    } else if (currentUser && isLoginPage) {
        if (currentUser.role === 'admin') {
            window.location.replace('admin-users.html');
        } else {
            window.location.replace('dashboard.html');
        }
        return;
    }

    // 2. "CẮM MẮT" THEO DÕI REALTIME TRÊN TOÀN BỘ CÁC TRANG TRONG (Dashboard, Tiến độ, Vào thi,...)
    if (currentUser && !isLoginPage && currentUser.role !== 'admin') {
        const username = currentUser.username || cleanUsername(currentUser.email);
        
        // Luôn luôn kết nối trực tiếp đến nhánh user của thí sinh trên DB để cập nhật trạng thái
        database.ref('users/' + username).on('value', (snapshot) => {
            const dbUser = snapshot.val();
            
            // Nếu phát hiện trạng thái tài khoản bị chuyển thành Khóa (isLocked === true)
            if (dbUser && dbUser.isLocked === true) {
                const lockInfo = dbUser.lockInfo || {};
                
                // Bước 1: Xóa localStorage để chặn việc tải lại trang lách luật
                localStorage.removeItem('currentUser');
                
                // Bước 2: Ép hiển thị Modal thông báo kỷ luật chặn tương tác tại trang thí sinh đang đứng
                showLockModal(lockInfo);
                
                // Bước 3: Thiết lập đếm ngược 6 giây tự động trục xuất session khỏi Firebase
                if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
                autoLogoutTimer = setTimeout(() => {
                    executeDirectLogout();
                }, 6000);
            }
        });
    }
})();

// Lắng nghe sự thay đổi Auth nội bộ của Firebase
auth.onAuthStateChanged((user) => {
    // Đã loại bỏ hoàn toàn việc tự ý xóa localStorage.removeItem('currentUser') tại đây để sửa lỗi văng trang trên Tiến độ / Vào thi.
});

// --- 2. Cơ chế điều khiển Forms nội bộ (Trang index) ---
function switchForm(formId) {
    const forms = ['loginSection', 'registerSection', 'forgotSection', 'googleUpdateSection'];
    forms.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === formId) ? 'block' : 'none';
    });
}

// --- 3. Các chức năng Authentication nghiệp vụ ---

// Đăng ký tài khoản Email
async function registerWithEmail(email, password, fullName, userClass, birthday, age, position) {
    if (!email || !password || !fullName) return showToast("Vui lòng điền đầy đủ thông tin bắt buộc!" , "danger");
    try {
        await auth.createUserWithEmailAndPassword(email, password);
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

// Đăng nhập tài khoản bằng Email & Mật khẩu
async function loginWithEmail(email, password) {
    if (!email) return showToast("Vui lòng nhập Email tài khoản!", "danger");

    const username = cleanUsername(email);
    localStorage.removeItem('currentUser'); // Clear cache trước khi login mới

    try {
        await auth.signInWithEmailAndPassword(email, password);

        const snapshot = await database.ref('users/' + username).once('value');
        const dbUser = snapshot.val();

        // Kiểm tra nếu tài khoản đang bị khóa từ trước
        if (dbUser && dbUser.isLocked && dbUser.role !== 'admin') {
            const lockInfo = dbUser.lockInfo || {};
            localStorage.removeItem('currentUser');
            showLockModal(lockInfo); 
            await auth.signOut();
            return; 
        }

        // Đăng nhập thành công hoàn toàn
        localStorage.setItem('currentUser', JSON.stringify(dbUser));
        if (dbUser && dbUser.role === 'admin') {
            window.location.replace('admin-users.html');
        } else {
            window.location.replace('dashboard.html');
        }

    } catch (error) {
        // Quét DB ngầm phòng trường hợp sai mật khẩu nhưng tài khoản thực tế đã bị khóa sẵn
        try {
            const snapshot = await database.ref('users/' + username).once('value');
            const dbUser = snapshot.val();

            if (dbUser && dbUser.isLocked && dbUser.role !== 'admin') {
                const lockInfo = dbUser.lockInfo || {};
                localStorage.removeItem('currentUser');
                showLockModal(lockInfo); 
                await auth.signOut().catch(() => {});
                return; 
            }
        } catch (dbErr) {
            console.error(dbErr);
        }
        showToast("Tài khoản hoặc mật khẩu không chính xác!", "danger");
    }
}

// Khôi phục mật khẩu tài khoản
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

// Đăng nhập bằng tài khoản Google
async function loginWithProvider(providerType) {
    let provider = new firebase.auth.GoogleAuthProvider();
    localStorage.removeItem('currentUser');
    
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const username = cleanUsername(user.email);

        const snapshot = await database.ref('users/' + username).once('value');
        let dbUser = snapshot.val();

        if (dbUser && dbUser.isLocked && dbUser.role !== 'admin') {
            const lockInfo = dbUser.lockInfo || {};
            localStorage.removeItem('currentUser');
            showLockModal(lockInfo);
            await auth.signOut();
            return;
        }

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
            switchForm('googleUpdateSection');
            return;
        }

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

// Cập nhật thông tin bổ sung cho tài khoản Google lần đầu đăng nhập
async function handleGoogleAdditionalData() {
    if (!tempGoogleUser) return;
    
    const uClass = document.getElementById('gClass').value.trim();
    const uPosition = document.getElementById('gPosition').value;
    const uBirthday = document.getElementById('gBirthday').value;
    const uAge = document.getElementById('gAge').value.trim();

    if(!uClass || !uBirthday || !uAge) {
        return showToast("Vui lòng nhập đầy đủ Lớp, Ngày sinh và Tuổi của bạn!","danger");
    }

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

// --- 4. Khởi tạo giao diện Modal thông báo Khóa độc lập ---
function showLockModal(lockInfo) {
    const path = window.location.pathname;
    const isLoginPage = path.includes('index.html') || path.endsWith('/') || path === '';

    if (isLoginPage) {
        // MODAL HIỂN THỊ TẠI TRANG ĐĂNG NHẬP INDEX.HTML
        let loginLockModalEl = document.getElementById('indexPageLockModal');
        if (!loginLockModalEl) {
            const indexModalHtml = `
                <div class="modal fade" id="indexPageLockModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content border-danger shadow-lg" style="border-radius: 12px; overflow: hidden;">
                            <div class="modal-header bg-danger text-white py-3">
                                <h5 class="modal-title fw-bold d-flex align-items-center mb-0">
                                    <i class="bi bi-shield-lock-fill me-2 fs-4"></i> ĐĂNG NHẬP THẤT BẠI
                                </h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body py-4 text-center">
                                <div class="text-danger mb-3">
                                    <i class="bi bi-person-x-fill" style="font-size: 3.5rem;"></i>
                                </div>
                                <h5 class="fw-bold text-dark mb-2">Tài khoản hiện đang bị khóa</h5>
                                <p class="text-muted small px-3 mb-3">Hệ thống từ chối quyền truy cập do tài khoản này đang chịu hình thức kỷ luật từ phía Hội đồng thi.</p>
                                
                                <div class="bg-light p-3 rounded border text-start mb-4 mx-2 small">
                                    <p class="mb-1 text-secondary"><strong>Mã biên bản:</strong> <span id="idxLockId" class="text-dark fw-bold">---</span></p>
                                    <p class="mb-1 text-secondary"><strong>Thời gian khóa:</strong> <span id="idxLockTime" class="text-dark">---</span></p>
                                    <p class="mb-1 text-secondary"><strong>Thời hạn phạt:</strong> <span id="idxLockDuration" class="text-primary fw-bold">---</span></p>
                                    <p class="mb-0 text-secondary"><strong>Lý do xử lý:</strong> <span id="idxLockReason" class="text-danger fw-bold">---</span></p>
                                </div>
                                
                                <button type="button" class="btn btn-secondary w-100 fw-bold py-2 shadow-sm" data-bs-dismiss="modal">
                                    <i class="bi bi-check-lg me-2"></i> Đã hiểu
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', indexModalHtml);
            loginLockModalEl = document.getElementById('indexPageLockModal');
        }

        document.getElementById('idxLockId').innerText = lockInfo?.id || 'KỶ LUẬT ĐĂNG NHẬP';
        document.getElementById('idxLockTime').innerText = lockInfo?.startTime || 'Vừa mới đây';
        document.getElementById('idxLockDuration').innerText = lockInfo?.duration || 'Vô thời hạn';
        document.getElementById('idxLockReason').innerText = lockInfo?.reason || 'Vi phạm nội quy phòng thi';

        const bsIndexModal = new bootstrap.Modal(loginLockModalEl);
        bsIndexModal.show();

    } else {
        // MODAL ÉP HIỂN THỊ TẠI TẤT CẢ CÁC TRANG TRONG TRUY CẬP (dashboard, thi-truc-tuyen, tien-do-cong-viec,...)
        let lockModalEl = document.getElementById('globalSystemLockModal');
        if (!lockModalEl) {
            const modalHtml = `
                <div class="modal fade" id="globalSystemLockModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false" style="z-index: 100000 !important;">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content border-danger shadow-lg" style="border-radius: 12px; overflow: hidden;">
                            <div class="modal-header bg-danger text-white py-3">
                                <h5 class="modal-title fw-bold d-flex align-items-center mb-0">
                                    <i class="bi bi-shield-lock-fill me-2 fs-4"></i> TÀI KHOẢN BỊ KHÓA TRUY CẬP
                                </h5>
                            </div>
                            <div class="modal-body py-4 text-center">
                                <div class="text-danger mb-3">
                                    <i class="bi bi-exclamation-triangle-fill" style="font-size: 3.5rem;"></i>
                                </div>
                                <h5 class="fw-bold text-dark mb-2">Quyền truy cập của bạn đã bị đình chỉ</h5>
                                <p class="text-muted small px-3 mb-3">Hệ thống phát hiện tài khoản này vi phạm quy chế nghiêm trọng hoặc đã bị Giám thị xử lý trực tiếp.</p>
                                
                                <div class="bg-light p-3 rounded border text-start mb-3 mx-2 small">
                                    <p class="mb-1 text-secondary"><strong>Mã biên bản:</strong> <span id="modalLockId" class="text-dark fw-bold">---</span></p>
                                    <p class="mb-1 text-secondary"><strong>Thời gian khóa:</strong> <span id="modalLockTime" class="text-dark">---</span></p>
                                    <p class="mb-1 text-secondary"><strong>Thời hạn phạt:</strong> <span id="modalLockDuration" class="text-primary fw-bold">---</span></p>
                                    <p class="mb-0 text-secondary"><strong>Lý do xử lý:</strong> <span id="modalLockReason" class="text-danger fw-bold">---</span></p>
                                </div>
                                
                                <div class="d-flex align-items-center justify-content-center text-muted mb-3 fs-7" style="font-size: 0.85rem; font-style: italic;">
                                    <div class="spinner-border spinner-border-sm text-secondary me-2" role="status" style="width: 0.9rem; height: 0.9rem;"></div>
                                    <span>Hệ thống tự động chuyển hướng đăng xuất sau <strong class="text-danger">6 giây</strong>...</span>
                                </div>
                                
                                <button type="button" class="btn btn-danger w-100 fw-bold py-2 shadow-sm" onclick="executeDirectLogout()">
                                    <i class="bi bi-box-arrow-right me-2"></i> Đăng xuất ngay lập tức
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            lockModalEl = document.getElementById('globalSystemLockModal');
        }

        document.getElementById('modalLockId').innerText = lockInfo?.id || 'KỶ LUẬT TỰ ĐỘNG';
        document.getElementById('modalLockTime').innerText = lockInfo?.startTime || 'Vừa mới đây';
        document.getElementById('modalLockDuration').innerText = lockInfo?.duration || 'Vô thời hạn';
        document.getElementById('modalLockReason').innerText = lockInfo?.reason || 'Vi phạm nội quy phòng thi';
        
        const bsLockModal = new bootstrap.Modal(lockModalEl, {
            backdrop: 'static',
            keyboard: false
        });
        bsLockModal.show();
    }
}

// Thực thi hủy bỏ kết nối phiên đăng nhập trực tiếp
function executeDirectLogout() {
    if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
    localStorage.removeItem('currentUser');
    
    auth.signOut().then(() => {
        const path = window.location.pathname;
        if (!path.includes('index.html') && path !== '/' && path !== '') {
            window.location.replace('index.html');
        }
    }).catch(err => {
        window.location.replace('index.html');
    });
}

function logout() {
    executeDirectLogout();
}

// --- 5. Hàm Toast thông báo trạng thái ---
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

// Hàm kiểm tra quyền Admin bằng trường role
function checkAdminAccess() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    
    // Kiểm tra xem trường role có tồn tại và có bằng 'admin' (không phân biệt hoa thường) hay không
    if (!currentUser || !currentUser.role || currentUser.role.toLowerCase() !== 'admin') {
        showToast("Bạn không có quyền truy cập trang này!","danger");
        window.location.replace('dashboard.html');
        return false;
    }
    return true;
}