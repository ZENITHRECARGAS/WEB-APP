import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collectionGroup, 
    getDocs, 
    doc, 
    updateDoc, 
    collection, 
    onSnapshot, 
    addDoc, 
    setDoc, 
    getDoc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const appId = typeof __app_id !== 'undefined' ? __app_id : 'poor-point';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyCUiQaampVsnUryYS9BamEQ761vFJPDyp4",
    authDomain: "poor-point.firebaseapp.com",
    projectId: "poor-point",
    storageBucket: "poor-point.firebasestorage.app",
    messagingSenderId: "159292993963",
    appId: "1:159292993963:web:7566a4ac37a15ee94122ee"
};

// ==========================================
// CATÁLOGO BASE DE PRECIOS POR DEFECTO (CON SUSCRIPCIONES)
// ==========================================
const baseCatalogPrices = {
    freefire: [
        { id: 'ff-110', name: '110 Diamantes', price: 0.90, status: 'disponible' },
        { id: 'ff-341', name: '341 Diamantes', price: 2.50, status: 'disponible' },
        { id: 'ff-572', name: '572 Diamantes', price: 4.50, status: 'disponible' },
        { id: 'ff-1166', name: '1166 Diamantes', price: 7.90, status: 'disponible' },
        { id: 'ff-2398', name: '2398 Diamantes', price: 15.60, status: 'disponible' },
        { id: 'ff-6160', name: '6160 Diamantes', price: 37.95, status: 'disponible' },
        { id: 'ff-booyah', name: 'Pase Booyah', price: 1.30, status: 'disponible' },
        { id: 'ff-evo-token', name: 'Token EVO', price: 0.10, status: 'disponible' },
        { id: 'ff-evo-box', name: 'Caja EVO', price: 0.20, status: 'disponible' },
        { id: 'ff-weekly-basic', name: 'Tarjeta semanal básica', price: 0.50, status: 'disponible' },
        { id: 'ff-weekly', name: 'Tarjeta semanal', price: 1.95, status: 'disponible' },
        { id: 'ff-monthly', name: 'Tarjeta mensual', price: 8.70, status: 'disponible' }
    ],
    roblox: [
        { id: 'rbx-400', name: '400 Robux', price: 4.99, status: 'disponible' },
        { id: 'rbx-800', name: '800 Robux', price: 9.99, status: 'disponible' },
        { id: 'rbx-1700', name: '1700 Robux', price: 19.99, status: 'disponible' }
    ],
    mobilelegends: [
        { id: 'ml-110', name: '110 Diamonds', price: 1.99, status: 'disponible' },
        { id: 'ml-257', name: '257 Diamonds', price: 4.49, status: 'disponible' },
        { id: 'ml-565', name: '565 Diamonds', price: 9.49, status: 'disponible' }
    ],
    codm: [
        { id: 'cod-80', name: '80 CP', price: 0.99, status: 'disponible' },
        { id: 'cod-420', name: '420 CP', price: 4.99, status: 'disponible' },
        { id: 'cod-880', name: '880 CP', price: 9.99, status: 'disponible' }
    ],
    pubg: [
        { id: 'pubg-60', name: '60 UC', price: 0.99, status: 'disponible' },
        { id: 'pubg-325', name: '325 UC', price: 4.99, status: 'disponible' },
        { id: 'pubg-660', name: '660 UC', price: 9.99, status: 'disponible' }
    ],
    subscriptions: [
        { id: 'sub-netflix', name: 'Netflix Premium (1 Pantalla)', price: 3.50, duration: 'Mes', stockType: 'Ilimitado', status: 'disponible' },
        { id: 'sub-spotify', name: 'Spotify Premium (1 Mes)', price: 2.50, duration: 'Mes', stockType: 'Ilimitado', status: 'disponible' }
    ]
};

let app, db, auth;
let activeSelectedUserId = null;
let unsubscribeChat = null;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    // ==========================================
    // CONFIGURAR PERSISTENCIA LOCAL PERMANENTE
    // ==========================================
    setPersistence(auth, browserLocalPersistence).then(() => {
        const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        if (initialToken) {
            signInWithCustomToken(auth, initialToken).catch(() => {});
        } else {
            if (!auth.currentUser && localStorage.getItem("zenith_admin_logged") !== "true") {
                signInAnonymously(auth).catch(() => {});
            }
        }
    }).catch((err) => {
        console.warn("Error configurando persistencia:", err);
    });

    onAuthStateChanged(auth, (user) => {
        if (localStorage.getItem("zenith_admin_logged") === "true") {
            unlockAdminPanel();
        }
    });
} catch (e) {
    console.warn("Firebase init error:", e);
}

// ==========================================
// AUTENTICACIÓN CON GOOGLE PARA ADMIN (RESTRINGIDA)
// ==========================================
const ALLOWED_ADMIN_EMAILS = [
    "delrosarioandy63@gmail.com"
];

window.loginWithGoogleAdmin = async function() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const userEmail = (user.email || "").toLowerCase();

        if (!ALLOWED_ADMIN_EMAILS.includes(userEmail)) {
            await signOut(auth);
            showNotification("Acceso Denegado", "Este correo no tiene permisos de administrador.", "error");
            return;
        }

        localStorage.setItem("zenith_admin_logged", "true");
        unlockAdminPanel();
        showNotification("Bienvenido", `Sesión iniciada como ${user.displayName || user.email}`, "success");
    } catch (error) {
        console.error("Error al iniciar sesión con Google:", error);
        showNotification("Error de Autenticación", "No se pudo iniciar sesión con Google.", "error");
    }
};

function unlockAdminPanel() {
    const loginScreen = document.getElementById('admin-login-screen') || document.getElementById('admin-login-overlay');
    const mainContent = document.getElementById('admin-dashboard') || document.getElementById('admin-main-content');

    if (loginScreen) loginScreen.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');

    if (typeof loadAdminOrders === 'function') loadAdminOrders();
    if (typeof loadAdminUsersList === 'function') loadAdminUsersList();
    if (typeof loadCatalogPricesForAdmin === 'function') loadCatalogPricesForAdmin();
    if (typeof loadAdminWalletRequests === 'function') loadAdminWalletRequests();
    if (typeof loadClientsDropdown === 'function') loadClientsDropdown();
    if (typeof loadAdminChecksTable === 'function') loadAdminChecksTable();
    if (typeof loadAdminUsersBalance === 'function') loadAdminUsersBalance();
    if (typeof loadAdminTopBuyers === 'function') loadAdminTopBuyers();
    initAdminOrderListener();
}

window.logoutAdmin = function() {
    localStorage.removeItem("zenith_admin_logged");
    signOut(auth).then(() => {
        location.reload();
    });
};

// ==========================================
// 1. GESTIÓN DE CHEQUES
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const checkForm = document.getElementById('adminAddCheckForm');
    const depositInput = document.getElementById('adminCheckCode');
    const hourInput = document.getElementById('adminCheckHour');

    depositInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
    });

    hourInput?.addEventListener('input', (e) => {
        let raw = e.target.value.replace(/\D/g, '');
        if (raw.length > 4) raw = raw.substring(0, 4);
        if (raw.length >= 3) {
            e.target.value = `${raw.substring(0, 2)}:${raw.substring(2)}`;
        } else {
            e.target.value = raw;
        }
    });

    checkForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = depositInput ? depositInput.value.trim() : '';
        const hour = hourInput ? hourInput.value.trim() : '';
        const amount = parseFloat(document.getElementById('adminCheckAmount')?.value) || 0;

        if (code.length < 14 || code.length > 15) {
            showNotification("Atención", "El número de depósito debe tener entre 14 y 15 dígitos.", "warning");
            return;
        }

        const hourRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
        if (!hourRegex.test(hour)) {
            showNotification("Atención", "Ingresa una hora válida en formato 00:00.", "warning");
            return;
        }

        if (amount <= 0) {
            showNotification("Atención", "Ingresa un monto mayor a $0.00.", "warning");
            return;
        }

        if (!db) return;

        try {
            await setDoc(doc(db, 'artifacts', appId, 'admin_checks', code), {
                code, hour, amount, createdAt: new Date().toISOString()
            });
            checkForm.reset();
            showNotification("¡Éxito!", `Cheque ${code} registrado por $${amount.toFixed(2)}.`, "success");
        } catch (err) {
            showNotification("Error", "No se pudo registrar el cheque.", "error");
        }
    });
});

function loadAdminChecksTable() {
    const tableBody = document.getElementById('adminChecksTableBody');
    if (!db || !tableBody) return;

    onSnapshot(collection(db, 'artifacts', appId, 'admin_checks'), (snapshot) => {
        let html = '';
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-500">No hay cheques activos.</td></tr>`;
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            html += `
                <tr class="border-b border-cyber-border hover:bg-cyber-dark/40 transition-colors">
                    <td class="p-3 font-mono text-cyber-neonCyan font-bold">${data.code}</td>
                    <td class="p-3 font-mono text-white">${data.hour}</td>
                    <td class="p-3 text-cyber-neonGreen font-bold font-orbitron">$${(data.amount || 0).toFixed(2)}</td>
                    <td class="p-3 text-center">
                        <button onclick="deleteAdminCheck('${docSnap.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-black transition-all text-[10px] font-bold border border-red-500/30">
                            <i class="fa-solid fa-trash mr-1"></i> Eliminar
                        </button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;
    });
}

window.deleteAdminCheck = async function(docId) {
    if (!db) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'admin_checks', docId));
        showNotification("Eliminado", "Cheque borrado correctamente.", "info");
    } catch (e) {
        showNotification("Error", "No se pudo eliminar.", "error");
    }
};

// ==========================================
// 2. GESTIÓN DE ÓRDENES
// ==========================================
window.loadAdminOrders = async function() {
    const container = document.getElementById('admin-orders-container');
    if (!container || !db) return;

    container.innerHTML = `<div class="p-8 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin text-cyber-neonCyan"></i> Cargando órdenes...</div>`;

    try {
        const querySnapshot = await getDocs(collectionGroup(db, 'orders'));
        let orders = [];
        querySnapshot.forEach(docSnap => {
            orders.push({ id: docSnap.id, refPath: docSnap.ref, ...docSnap.data() });
        });

        orders.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        updateAdminStats(orders);

        if (orders.length === 0) {
            container.innerHTML = `<div class="bg-cyber-dark p-8 rounded-2xl border border-cyber-border text-center text-xs text-gray-400">No hay órdenes registradas.</div>`;
            return;
        }

        let html = '';
        orders.forEach(ord => {
            const dateStr = ord.timestamp ? new Date(ord.timestamp).toLocaleString() : 'Fecha no disponible';
            const imgPreview = ord.paymentReference && ord.paymentReference.startsWith('http') 
                ? `<a href="${ord.paymentReference}" target="_blank" class="text-xs text-cyber-neonCyan underline flex items-center space-x-1 mt-1"><i class="fa-solid fa-image"></i><span>Ver Comprobante</span></a>`
                : `<span class="text-xs text-gray-500">Ref: ${ord.paymentReference || 'N/A'}</span>`;

            let statusBadge = '';
            const currentStatus = (ord.status || '').toLowerCase();
            const isProcessed = currentStatus === 'verificada' || currentStatus === 'completada' || currentStatus === 'rechazada';

            if (currentStatus === 'completada' || currentStatus === 'verificada') {
                statusBadge = `<span class="inline-block px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-bold text-[10px] uppercase">VERIFICADA</span>`;
            } else if (currentStatus === 'rechazada') {
                statusBadge = `<span class="inline-block px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-[10px] uppercase">RECHAZADA</span>`;
            } else {
                statusBadge = `<span class="inline-block px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold text-[10px] uppercase animate-pulse">EN VERIFICACIÓN</span>`;
            }

            let actionButtonsHtml = isProcessed 
                ? `<span class="text-[10px] text-gray-500 italic bg-cyber-card px-3 py-1.5 rounded-xl border border-cyber-border">Procesada</span>`
                : `
                    <div class="flex space-x-2">
                        <button onclick="updateOrderStatus('${ord.refPath.path}', 'Verificada')" class="px-3 py-2 rounded-xl bg-green-600/25 border border-green-500/40 text-green-400 text-xs font-bold hover:bg-green-600 hover:text-white transition-all"><i class="fa-solid fa-check"></i></button>
                        <button onclick="updateOrderStatus('${ord.refPath.path}', 'Rechazada')" class="px-3 py-2 rounded-xl bg-red-600/25 border border-red-500/40 text-red-400 text-xs font-bold hover:bg-red-600 hover:text-white transition-all"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                `;

            html += `
                <div class="bg-cyber-dark p-5 rounded-2xl border border-cyber-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center space-x-2">
                            <span class="px-2 py-0.5 rounded bg-cyan-500/10 text-cyber-neonCyan text-[10px] font-bold uppercase">${ord.game || 'Juego'}</span>
                            <span class="text-xs text-gray-400">${dateStr}</span>
                        </div>
                        <h4 class="font-bold text-white text-base">${ord.product}</h4>
                        
                        <div class="bg-cyber-card p-2.5 rounded-xl border border-cyber-border/80 my-1 space-y-0.5">
                            <p class="text-xs text-gray-300">ID del Jugador: <span class="text-cyber-neonCyan font-mono font-bold text-sm select-all">${ord.playerId || 'No especificado'}</span></p>
                            ${ord.playerName ? `<p class="text-xs text-gray-300">Nombre / Nickname: <span class="text-white font-bold">${ord.playerName}</span></p>` : ''}
                        </div>

                        <p class="text-xs text-gray-400">Método de Pago: <span class="uppercase font-semibold text-white">${ord.paymentMethod}</span></p>
                        ${imgPreview}
                    </div>
                    <div class="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-cyber-border">
                        <div class="text-right space-y-1">
                            <span class="font-orbitron font-bold text-white text-base block">$${Number(ord.price || 0).toFixed(2)}</span>
                            ${statusBadge}
                        </div>
                        <div>${actionButtonsHtml}</div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<div class="p-8 text-center text-red-400 text-xs">Error al cargar órdenes.</div>`;
    }
};

window.updateOrderStatus = async function(docPath, newStatus) {
    if (!db) return;
    let rejectionReason = "";
    if (newStatus === 'Rechazada') {
        rejectionReason = prompt("Ingresa el motivo del rechazo:", "Comprobante no válido.");
        if (rejectionReason === null) return;
    }

    try {
        const orderRef = doc(db, docPath);
        const orderSnap = await getDoc(orderRef);
        let targetUid = 'anonymous-user';
        let productName = 'Recarga';
        
        if (orderSnap.exists()) {
            const data = orderSnap.data();
            productName = data.product || 'Recarga';
            const segs = orderRef.path.split('/');
            const uIdx = segs.indexOf('users');
            if (uIdx !== -1 && segs[uIdx + 1]) targetUid = segs[uIdx + 1];
        }

        await updateDoc(orderRef, { status: newStatus });
        const notifCol = collection(db, 'artifacts', appId, 'notifications');

        if (newStatus === 'Verificada') {
            await addDoc(notifCol, {
                target: targetUid, category: 'success',
                title: '¡Recarga Exitosa y Verificada!',
                body: `Tu orden de ${productName} ha sido aprobada.`,
                timestamp: new Date().toISOString()
            });
            showNotification("Aprobada", "Orden verificada.", "success");
        } else if (newStatus === 'Rechazada') {
            await addDoc(notifCol, {
                target: targetUid, category: 'failed',
                title: 'Recarga Rechazada',
                body: `Tu orden de ${productName} fue rechazada. Motivo: ${rejectionReason}`,
                timestamp: new Date().toISOString()
            });
            showNotification("Rechazada", "Orden rechazada.", "warning");
        }
        loadAdminOrders();
    } catch (e) {
        showNotification("Error", "No se pudo actualizar la orden.", "error");
    }
};

// ==========================================
// 3. GESTIÓN DE BILLETERA
// ==========================================
window.loadAdminWalletRequests = async function() {
    const container = document.getElementById('admin-wallet-requests-container');
    if (!container || !db) return;

    container.innerHTML = `<div class="p-8 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin text-cyber-neonCyan"></i> Cargando solicitudes...</div>`;

    try {
        const querySnapshot = await getDocs(collectionGroup(db, 'wallet_transactions'));
        let allRequests = [];

        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            const segs = docSnap.ref.path.split('/');
            const uIdx = segs.indexOf('users');
            let userId = 'anonymous';
            if (uIdx !== -1 && segs[uIdx + 1]) userId = segs[uIdx + 1];
            allRequests.push({ id: docSnap.id, userId, refPath: docSnap.ref, ...data });
        });

        allRequests.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        if (allRequests.length === 0) {
            container.innerHTML = `<div class="p-6 text-center text-gray-500 text-xs">No hay solicitudes de saldo.</div>`;
            return;
        }

        let html = '';
        allRequests.forEach(tx => {
            const isDeposit = tx.type === "DEPOSITO";
            const badgeClass = isDeposit ? 'text-green-400 bg-green-950/30 border-green-500/30' : 'text-amber-400 bg-amber-950/30 border-amber-500/30';
            const statusColor = tx.status === 'COMPLETADO' ? 'text-green-400' : 'text-amber-400';
            const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'Reciente';

            html += `
                <div class="bg-cyber-dark p-5 rounded-2xl border border-cyber-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center space-x-2">
                            <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badgeClass}">${tx.type}</span>
                            <span class="text-[10px] text-gray-400 font-mono">UID: ${tx.userId.substring(0, 8)}...</span>
                            <span class="text-[10px] text-gray-500">${dateStr}</span>
                        </div>
                        <h4 class="font-bold text-white text-sm">${tx.bank || 'Banco'} - <span class="text-cyber-neonCyan">$${(tx.amount || 0).toFixed(2)}</span></h4>
                        <p class="text-xs text-gray-300">Estado: <strong class="${statusColor}">${tx.status || 'PENDIENTE'}</strong></p>
                    </div>
                    <div>
                        ${tx.status !== 'COMPLETADO' ? `
                            <button onclick="approveWalletTransaction('${tx.userId}', '${tx.id}', ${tx.amount}, '${tx.type}')" class="px-4 py-2 rounded-xl bg-cyber-neonCyan text-black font-bold text-xs hover:opacity-95 shadow-neon-cyan">
                                <i class="fa-solid fa-check mr-1"></i> Aprobar
                            </button>
                        ` : `<span class="px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">Completado</span>`}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
    }
};

window.approveWalletTransaction = async function(userId, txId, amount, type) {
    if (!db) return;
    try {
        const userRef = doc(db, 'artifacts', appId, 'users', userId);
        const txRef = doc(db, 'artifacts', appId, 'users', userId, 'wallet_transactions', txId);

        const userDoc = await getDoc(userRef);
        let currentSaldo = userDoc.exists() ? (userDoc.data().saldo || 0) : 0;
        let newSaldo = type === "DEPOSITO" ? currentSaldo + amount : currentSaldo - amount;

        await setDoc(userRef, { saldo: newSaldo }, { merge: true });
        await updateDoc(txRef, { status: "COMPLETADO" });

        const notifCol = collection(db, 'artifacts', appId, 'notifications');
        await addDoc(notifCol, {
            target: userId, category: 'success',
            title: '¡Depósito Aprobado!',
            body: `Tu solicitud por $${amount.toFixed(2)} ha sido aprobada. Saldo: $${newSaldo.toFixed(2)}.`,
            timestamp: new Date().toISOString()
        });

        showNotification("¡Aprobado!", `Saldo actualizado ($${newSaldo.toFixed(2)}).`, "success");
        loadAdminWalletRequests();
    } catch (e) {
        showNotification("Error", "No se pudo aprobar.", "error");
    }
};

window.addManualBalanceToUser = async function() {
    const userId = document.getElementById('admin-manual-uid').value;
    const amountInput = document.getElementById('admin-manual-amount');
    const reasonInput = document.getElementById('admin-manual-reason');
    
    const amount = parseFloat(amountInput ? amountInput.value : 0);
    const reason = reasonInput ? reasonInput.value.trim() : 'Abono manual del Admin';

    if (!userId || !amount || amount <= 0) {
        showNotification("Atención", "Selecciona un usuario y monto válido.", "warning");
        return;
    }

    try {
        const userRef = doc(db, 'artifacts', appId, 'users', userId);
        const walletCol = collection(db, 'artifacts', appId, 'users', userId, 'wallet_transactions');

        const userDoc = await getDoc(userRef);
        let currentSaldo = userDoc.exists() ? (userDoc.data().saldo || 0) : 0;
        let newSaldo = currentSaldo + amount;

        await setDoc(userRef, { saldo: newSaldo }, { merge: true });
        await addDoc(walletCol, {
            type: "DEPOSITO", amount, bank: `Manual: ${reason}`, status: "COMPLETADO", timestamp: new Date().toISOString()
        });

        const notifCol = collection(db, 'artifacts', appId, 'notifications');
        await addDoc(notifCol, {
            target: userId, category: 'success',
            title: '¡Saldo Abonado por Admin!',
            body: `Se acreditaron $${amount.toFixed(2)}. Motivo: ${reason}`,
            timestamp: new Date().toISOString()
        });

        amountInput.value = '';
        reasonInput.value = '';
        showNotification("¡Acreditado!", `Se sumaron $${amount.toFixed(2)}.`, "success");
        loadAdminWalletRequests();
    } catch (e) {
        showNotification("Error", "No se pudo acreditar.", "error");
    }
};

// ==========================================
// 4. GESTIÓN DE CHATS
// ==========================================
window.loadAdminUsersList = async function() {
    const listContainer = document.getElementById('admin-users-list');
    if (!listContainer || !db) return;

    try {
        const querySnapshot = await getDocs(collectionGroup(db, 'chat_messages'));
        let uniqueUsers = new Set();
        querySnapshot.forEach(docSnap => {
            const segs = docSnap.ref.path.split('/');
            const uIdx = segs.indexOf('users');
            if (uIdx !== -1 && segs[uIdx + 1]) uniqueUsers.add(segs[uIdx + 1]);
        });

        if (uniqueUsers.size === 0) {
            listContainer.innerHTML = `<span class="text-xs text-gray-500">No hay chats activos.</span>`;
            return;
        }

        let usersHtml = '';
        uniqueUsers.forEach(uid => {
            usersHtml += `
                <div onclick="selectUserForChat('${uid}')" class="p-3 rounded-xl bg-cyber-dark border border-cyber-border hover:border-cyber-neonCyan cursor-pointer transition-all flex items-center justify-between">
                    <div>
                        <p class="font-bold text-white text-xs">Cliente</p>
                        <p class="text-[10px] text-gray-400 truncate max-w-[180px]">${uid}</p>
                    </div>
                    <i class="fa-solid fa-chevron-right text-xs text-gray-500"></i>
                </div>
            `;
        });
        listContainer.innerHTML = usersHtml;
    } catch (e) {
        console.error(e);
    }
};

window.selectUserForChat = function(userId) {
    activeSelectedUserId = userId;
    document.getElementById('active-chat-user-title').innerText = `Chat con Cliente`;
    document.getElementById('active-chat-user-id').innerText = `UID: ${userId}`;

    const container = document.getElementById('admin-chat-messages');
    container.innerHTML = `<div class="p-4 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin text-cyber-neonCyan"></i> Cargando chat...</div>`;

    if (unsubscribeChat) unsubscribeChat();

    const chatCol = collection(db, 'artifacts', appId, 'users', userId, 'chat_messages');
    unsubscribeChat = onSnapshot(chatCol, (snapshot) => {
        let messages = [];
        snapshot.forEach(d => messages.push({ id: d.id, ...d.data() }));
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        let html = '';
        if (messages.length === 0) {
            container.innerHTML = `<div class="text-center text-xs text-gray-500 my-auto">No hay mensajes.</div>`;
            return;
        }

        messages.forEach(msg => {
            const isUser = msg.sender === 'user';
            let senderLabel = isUser ? 'Cliente' : (msg.sender === 'bot' ? 'BOT' : 'Soporte');
            let bgClass = isUser ? 'self-start bg-cyber-card border-cyber-border text-gray-300' : 'self-end bg-pink-950/40 border-pink-500/40 text-white';
            let imgHtml = msg.image ? `<a href="${msg.image}" target="_blank"><img src="${msg.image}" class="mt-2 rounded-xl max-h-40 object-cover border border-cyber-border"></a>` : '';
            
            html += `
                <div class="${bgClass} border p-3 rounded-2xl max-w-[80%] text-xs space-y-1">
                    <span class="font-bold text-cyber-neonCyan block">${senderLabel}</span>
                    <p>${msg.text}</p>${imgHtml}
                </div>
            `;
        });
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    });
};

window.sendAdminReply = async function() {
    if (!activeSelectedUserId) return;
    const input = document.getElementById('admin-chat-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    try {
        await addDoc(collection(db, 'artifacts', appId, 'users', activeSelectedUserId, 'chat_messages'), {
            sender: 'support', text, image: null, timestamp: new Date().toISOString()
        });
        input.value = '';
    } catch (e) {
        console.error(e);
    }
};

window.handleAdminChatKey = function(e) {
    if (e.key === 'Enter') sendAdminReply();
};

// ==========================================
// 5. REGISTRO DE JUGADORES
// ==========================================
window.registerPlayerInDB = async function() {
    const idInput = document.getElementById('admin-reg-id');
    const nameInput = document.getElementById('admin-reg-name');
    const levelInput = document.getElementById('admin-reg-level');

    const playerId = idInput ? idInput.value.trim() : '';
    const playerName = nameInput ? nameInput.value.trim() : '';
    const playerLevel = levelInput ? levelInput.value.trim() : 'VIP';

    if (!playerId || !playerName) {
        showNotification("Atención", "Ingresa ID y Nombre.", "warning");
        return;
    }

    try {
        await setDoc(doc(db, 'players_db', playerId), { playerId, name: playerName, level: playerLevel, updatedAt: new Date().toISOString() });
        showNotification("¡Registrado!", `Jugador ${playerName} guardado.`, "success");
        idInput.value = ''; nameInput.value = '';
    } catch (e) {
        showNotification("Error", "No se pudo guardar.", "error");
    }
};

// ==========================================
// 6. GESTIÓN DE PRECIOS Y CATÁLOGO
// ==========================================
window.loadCatalogPricesForAdmin = function() {
    const select = document.getElementById('admin-game-select');
    const container = document.getElementById('admin-prices-list');
    if (!select || !container || !db) return;

    const gameKey = select.value; 
    container.innerHTML = `<div class="p-4 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin text-cyber-neonCyan"></i> Sincronizando...</div>`;

    const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
    onSnapshot(docRef, (docSnap) => {
        let items = docSnap.exists() ? docSnap.data().items : (baseCatalogPrices[gameKey] || []);
        let html = `
            <div class="flex justify-between items-center mb-4">
                <h4 class="font-bold text-white text-sm uppercase">Catálogo de ${gameKey}</h4>
                <button onclick="addNewProductToCatalog('${gameKey}')" class="px-3 py-2 rounded-xl bg-cyber-neonCyan text-black font-bold text-xs flex items-center space-x-1.5 shadow-neon-cyan">
                    <i class="fa-solid fa-plus"></i><span>Agregar Producto</span>
                </button>
            </div>
        `;

        if (items.length === 0) {
            html += `<div class="p-4 text-center text-gray-400 text-xs">No hay precios configurados.</div>`;
            container.innerHTML = html;
            return;
        }

        items.forEach((item, index) => {
            const isAgotado = item.status === 'agotado';
            const statusBadgeClass = isAgotado ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30';
            const durationLabel = item.duration ? `/${item.duration}` : '';
            const stockLabel = item.stockType === 'Limitado' 
                ? `<span class="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold">Stock: ${item.stock}</span>`
                : `<span class="px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30 text-[10px]">Ilimitado</span>`;
            
            html += `
                <div class="bg-cyber-dark p-4 rounded-2xl border border-cyber-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <div class="flex items-center space-x-2">
                            <span class="text-[10px] text-cyber-neonCyan font-mono">${item.id}</span>
                            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusBadgeClass}">${item.status ? item.status.toUpperCase() : 'DISPONIBLE'}</span>
                            ${stockLabel}
                        </div>
                        <h4 class="font-bold text-white text-sm mt-0.5">${item.name}</h4>
                    </div>
                    <div class="flex items-center space-x-2 w-full sm:w-auto justify-end">
                        <span class="text-xs text-gray-400">$</span>
                        <input type="number" step="0.01" id="price-input-${gameKey}-${index}" value="${item.price}" class="w-20 bg-cyber-card border border-cyber-border rounded-xl px-3 py-2 text-white text-xs font-bold">
                        <span class="text-xs text-cyber-neonCyan font-bold">${durationLabel}</span>
                        <button onclick="updateSinglePrice('${gameKey}', ${index}, '${item.id}', '${item.name}')" class="px-3 py-2 rounded-xl bg-cyber-neonCyan text-black font-bold text-xs">Guardar</button>
                        <button onclick="toggleProductStatus('${gameKey}', ${index})" class="px-3 py-2 rounded-xl bg-cyber-card border border-cyber-border text-amber-400 text-xs"><i class="fa-solid fa-ban"></i></button>
                        <button onclick="deleteCatalogItem('${gameKey}', ${index})" class="px-3 py-2 rounded-xl bg-cyber-card border border-cyber-border text-red-400 text-xs"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    });
};

window.updateSinglePrice = async function(gameKey, index, itemId, itemName) {
    const input = document.getElementById(`price-input-${gameKey}-${index}`);
    if (!input) return;
    const newPrice = parseFloat(input.value);

    if (isNaN(newPrice) || newPrice < 0) {
        showNotification("Atención", "Precio no válido.", "warning");
        return;
    }

    try {
        const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
        const docSnap = await getDoc(docRef);
        let items = docSnap.exists() ? [...docSnap.data().items] : [...baseCatalogPrices[gameKey]];
        items[index].price = newPrice;
        await setDoc(docRef, { items }, { merge: true });
        showNotification("¡Actualizado!", `Precio de ${itemName} modificado.`, "success");
    } catch (e) {
        showNotification("Error", "No se pudo actualizar.", "error");
    }
};

window.addNewProductToCatalog = function(gameKey) {
    const modal = document.getElementById('addProductModal');
    if (!modal) return;
    modal.dataset.gameKey = gameKey;
    document.getElementById('modal-product-name').value = '';
    document.getElementById('modal-product-price').value = '';
    document.getElementById('modal-product-limit').value = 'Ilimitado';

    let extraContainer = document.getElementById('modal-extra-fields');
    if (!extraContainer) {
        extraContainer = document.createElement('div');
        extraContainer.id = 'modal-extra-fields';
        extraContainer.className = 'space-y-4 pt-2';
        const limitSelect = document.getElementById('modal-product-limit');
        limitSelect?.parentNode?.insertBefore(extraContainer, limitSelect.nextSibling);
    }

    let extraHtml = '';
    if (gameKey === 'subscriptions') {
        extraHtml += `
            <div class="space-y-1">
                <label class="block text-xs font-semibold text-gray-300 uppercase">Duración de Cobro:</label>
                <select id="modal-product-duration-type" onchange="toggleCustomDurationInput()" class="w-full bg-cyber-dark border border-cyber-border rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neonCyan font-semibold">
                    <option value="Mes">Mes (/Mes)</option>
                    <option value="Año">Año (/Año)</option>
                    <option value="Personalizado">Personalizado (En Días)</option>
                </select>
            </div>
            <div id="modal-custom-days-wrapper" class="hidden space-y-1">
                <label class="block text-xs font-semibold text-gray-300 uppercase">Número de Días:</label>
                <input type="number" id="modal-product-custom-days" placeholder="Ej. 15 o 30" min="1" class="w-full bg-cyber-dark border border-cyber-border rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neonCyan">
            </div>
        `;
    }

    extraHtml += `
        <div id="modal-stock-input-wrapper" class="hidden space-y-1">
            <label class="block text-xs font-semibold text-gray-300 uppercase">Cantidad de Stock Disponible:</label>
            <input type="number" id="modal-product-stock-qty" placeholder="Ej. 10" min="1" class="w-full bg-cyber-dark border border-cyber-border rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neonCyan">
        </div>
    `;
    extraContainer.innerHTML = extraHtml;

    const limitSelect = document.getElementById('modal-product-limit');
    limitSelect.onchange = function() {
        const stockWrapper = document.getElementById('modal-stock-input-wrapper');
        if (stockWrapper) {
            if (this.value === 'Limitado') {
                stockWrapper.classList.remove('hidden');
            } else {
                stockWrapper.classList.add('hidden');
            }
        }
    };

    modal.classList.remove('hidden');
};

window.toggleCustomDurationInput = function() {
    const durationType = document.getElementById('modal-product-duration-type')?.value;
    const customDaysWrapper = document.getElementById('modal-custom-days-wrapper');
    if (customDaysWrapper) {
        if (durationType === 'Personalizado') {
            customDaysWrapper.classList.remove('hidden');
        } else {
            customDaysWrapper.classList.add('hidden');
        }
    }
};

window.closeAddProductModal = function() {
    document.getElementById('addProductModal')?.classList.add('hidden');
};

window.submitNewProductModal = async function() {
    const modal = document.getElementById('addProductModal');
    if (!modal) return;
    const gameKey = modal.dataset.gameKey;
    const name = document.getElementById('modal-product-name').value.trim();
    const price = parseFloat(document.getElementById('modal-product-price').value);
    const limitType = document.getElementById('modal-product-limit').value;
    
    let duration = 'Mes';
    if (gameKey === 'subscriptions') {
        const dType = document.getElementById('modal-product-duration-type')?.value;
        if (dType === 'Personalizado') {
            const days = document.getElementById('modal-product-custom-days')?.value.trim();
            duration = days ? `${days} Días` : '30 Días';
        } else {
            duration = dType || 'Mes';
        }
    }

    const stockQty = parseInt(document.getElementById('modal-product-stock-qty')?.value) || 0;

    if (!name || isNaN(price) || price < 0) {
        showNotification("Atención", "Completa los campos correctamente.", "warning");
        return;
    }

    if (limitType === 'Limitado' && stockQty <= 0) {
        showNotification("Atención", "Ingresa una cantidad de stock válida.", "warning");
        return;
    }

    try {
        const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
        const docSnap = await getDoc(docRef);
        let items = docSnap.exists() && docSnap.data().items ? [...docSnap.data().items] : [...(baseCatalogPrices[gameKey] || [])];
        
        let newProd = {
            id: `${gameKey}-${Date.now()}`,
            name,
            price,
            duration: gameKey === 'subscriptions' ? duration : null,
            stockType: limitType,
            stock: limitType === 'Limitado' ? stockQty : null,
            status: 'disponible'
        };

        items.push(newProd);
        await setDoc(docRef, { items }, { merge: true });
        closeAddProductModal();
        showNotification("¡Éxito!", "Producto agregado correctamente.", "success");
    } catch (e) {
        showNotification("Error", "No se pudo guardar.", "error");
    }
};

window.deleteCatalogItem = async function(gameKey, index) {
    if (!confirm("¿Eliminar este producto?")) return;
    try {
        const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().items) {
            let items = [...docSnap.data().items];
            items.splice(index, 1);
            await setDoc(docRef, { items }, { merge: true });
            showNotification("Eliminado", "Producto removido.", "success");
        }
    } catch (e) {
        showNotification("Error", "No se pudo eliminar.", "error");
    }
};

window.toggleProductStatus = async function(gameKey, index) {
    try {
        const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().items) {
            let items = [...docSnap.data().items];
            items[index].status = (items[index].status === 'disponible') ? 'agotado' : 'disponible';
            await setDoc(docRef, { items }, { merge: true });
            showNotification("Estado Actualizado", `Producto ${items[index].status.toUpperCase()}`, "info");
        }
    } catch (e) {
        showNotification("Error", "No se pudo cambiar el estado.", "error");
    }
};

// ==========================================
// 7. ESTADÍSTICAS Y NOTIFICACIONES
// ==========================================
function updateAdminStats(orders) {
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => (o.status || '').toLowerCase().includes('pendiente') || (o.status || '').toLowerCase().includes('verificaci')).length;
    const totalRevenue = orders.filter(o => ['verificada', 'completada'].includes((o.status || '').toLowerCase())).reduce((sum, o) => sum + Number(o.price || 0), 0);

    if (document.getElementById('stat-total-orders')) document.getElementById('stat-total-orders').innerText = totalOrders;
    if (document.getElementById('stat-pending-orders')) document.getElementById('stat-pending-orders').innerText = pendingOrders;
    if (document.getElementById('stat-total-revenue')) document.getElementById('stat-total-revenue').innerText = `$${totalRevenue.toFixed(2)}`;
}

function showNotification(title, msg, type = 'success') {
    const box = document.getElementById('notification-box');
    if (!box) return;
    document.getElementById('notif-title').innerText = title;
    document.getElementById('notif-msg').innerText = msg;
    box.classList.remove('translate-y-32', 'opacity-0');
    setTimeout(() => box.classList.add('translate-y-32', 'opacity-0'), 3500);
}

window.toggleNotifTargetInput = function() {
    const type = document.getElementById('admin-notif-type').value;
    const wrapper = document.getElementById('notif-user-target-wrapper');
    if (wrapper) {
        if (type === 'user') { wrapper.classList.remove('hidden'); loadClientsDropdown(); }
        else { wrapper.classList.add('hidden'); }
    }
};

window.sendSystemNotification = async function() {
    const type = document.getElementById('admin-notif-type').value;
    const targetUid = document.getElementById('admin-notif-target-uid')?.value.trim() || '';
    const category = document.getElementById('admin-notif-category').value;
    const title = document.getElementById('admin-notif-title').value.trim();
    const body = document.getElementById('admin-notif-body').value.trim();

    if (!title || !body || (type === 'user' && !targetUid)) {
        showNotification("Atención", "Completa los campos obligatorios.", "warning");
        return;
    }

    try {
        await addDoc(collection(db, 'artifacts', appId, 'notifications'), {
            target: type === 'global' ? 'global' : targetUid, category, title, body, timestamp: new Date().toISOString()
        });
        showNotification("¡Enviado!", "Notificación publicada.", "success");
        document.getElementById('admin-notif-title').value = '';
        document.getElementById('admin-notif-body').value = '';
    } catch (e) {
        showNotification("Error", "No se pudo enviar.", "error");
    }
};

window.loadClientsDropdown = async function() {
    const selectNotif = document.getElementById('admin-notif-target-uid');
    const selectManual = document.getElementById('admin-manual-uid');
    if ((!selectNotif && !selectManual) || !db) return;

    try {
        let clientsMap = new Map();
        const usersSnapshot = await getDocs(collection(db, 'artifacts', appId, 'users'));
        usersSnapshot.forEach(d => {
            const data = d.data();
            clientsMap.set(d.id, data.email || data.displayName || `Usuario (${d.id.substring(0, 8)})`);
        });

        let optionsHtml = `<option value="">-- Selecciona un cliente --</option>`;
        clientsMap.forEach((email, uid) => { optionsHtml += `<option value="${uid}">${email}</option>`; });
        
        if (selectNotif) selectNotif.innerHTML = optionsHtml;
        if (selectManual) selectManual.innerHTML = optionsHtml;
    } catch (e) {
        console.error(e);
    }
};

// ==========================================
// 8. GESTIÓN DE USUARIOS Y SALDOS
// ==========================================
window.loadAdminUsersBalance = async function() {
    const tableBody = document.getElementById("adminUsersBalanceTable");
    if (!tableBody || !db) return;

    tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin text-xl text-cyber-neonCyan mr-2"></i>Calculando saldos...</td></tr>`;

    try {
        const snapshot = await getDocs(collection(db, 'artifacts', appId, 'users'));
        let usersList = [];

        for (const docSnap of snapshot.docs) {
            const userData = docSnap.data();
            const uid = docSnap.id;
            let totalSpent = 0;
            try {
                const ordersSnap = await getDocs(collection(db, 'artifacts', appId, 'users', uid, 'orders'));
                ordersSnap.forEach(ord => { if (ord.data().price) totalSpent += parseFloat(ord.data().price); });
            } catch (err) {}

            usersList.push({ uid, ...userData, totalSpent });
        }

        if (usersList.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500">No hay usuarios registrados.</td></tr>`;
            return;
        }

        usersList.sort((a, b) => (b.saldo || 0) - (a.saldo || 0));

        let html = '';
        usersList.forEach(user => {
            const saldo = parseFloat(user.saldo || 0);
            const totalSpent = parseFloat(user.totalSpent || 0);
            const isVerified = user.profileCompleted || user.email;
            const verifyBadge = isVerified 
                ? `<span class="px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-bold">Verificado</span>`
                : `<span class="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">Pendiente</span>`;

            html += `
                <tr class="border-b border-cyber-border hover:bg-cyber-dark/40 transition-colors">
                    <td class="p-3 text-white font-semibold flex items-center space-x-2">
                        <img src="${user.photoURL || 'https://via.placeholder.com/32'}" class="w-6 h-6 rounded-full border border-cyber-neonCyan object-cover">
                        <span>${user.displayName || 'Usuario Zenith'}</span>
                    </td>
                    <td class="p-3 text-cyber-neonCyan font-mono text-xs">${user.email || 'Sin correo'}</td>
                    <td class="p-3 text-center">${verifyBadge}</td>
                    <td class="p-3 text-right font-orbitron font-bold text-sm ${saldo > 0 ? 'text-cyber-neonGreen' : 'text-gray-400'}">$${saldo.toFixed(2)}</td>
                    <td class="p-3 text-right font-orbitron font-bold text-sm text-pink-400">$${totalSpent.toFixed(2)}</td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-red-400">Error al cargar usuarios.</td></tr>`;
    }
};

window.verifyUserByEmail = async function() {
    const emailInput = document.getElementById('search-user-email');
    const emailToSearch = emailInput ? emailInput.value.trim().toLowerCase() : '';
    if (!emailToSearch) return;

    try {
        const snapshot = await getDocs(collection(db, 'artifacts', appId, 'users'));
        let foundUser = null, foundUid = null;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.email && data.email.toLowerCase() === emailToSearch) {
                foundUser = data;
                foundUid = docSnap.id;
            }
        });

        if (!foundUser) {
            showNotification("No Encontrado", "El correo no está registrado.", "error");
            return;
        }

        let totalSpent = 0;
        try {
            const ordersSnap = await getDocs(collection(db, 'artifacts', appId, 'users', foundUid, 'orders'));
            ordersSnap.forEach(ord => { if (ord.data().price) totalSpent += parseFloat(ord.data().price); });
        } catch (err) {}

        document.getElementById('check-user-name').innerText = foundUser.displayName || 'Usuario Zenith';
        document.getElementById('check-user-email').innerText = foundUser.email;
        document.getElementById('check-user-photo').src = foundUser.photoURL || 'https://via.placeholder.com/40';
        document.getElementById('check-user-balance').innerText = `$${parseFloat(foundUser.saldo || 0).toFixed(2)}`;
        document.getElementById('check-user-spent').innerText = `$${totalSpent.toFixed(2)}`;
        document.getElementById('user-check-result').classList.remove('hidden');

        showNotification("Usuario Verificado", `Datos cargados para ${foundUser.email}`, "success");
    } catch (error) {
        showNotification("Error", "Fallo al consultar usuario.", "error");
    }
};

// ==========================================
// 9. ESCUCHADOR EN TIEMPO REAL
// ==========================================
function requestAdminNotificationPermission() {
    if ("Notification" in window) {
        if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }
    }
}

function initAdminOrderListener() {
    if (!db) return;
    requestAdminNotificationPermission();

    onSnapshot(collectionGroup(db, 'orders'), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const ord = change.doc.data();
                
                const orderTime = new Date(ord.timestamp || 0).getTime();
                const now = new Date().getTime();
                if (now - orderTime > 60000) return;

                const orderId = change.doc.id.substring(0, 8);
                const userEmail = ord.subEmail || ord.userEmail || "Cliente Zenith";
                const productName = ord.product || ord.game || "Recarga";
                const price = Number(ord.price || 0).toFixed(2);

                const title = "🚨 AVISO DE RECARGA / COMPRA";
                const body = `ID: ${orderId}\nCORREO: ${userEmail}\nPRODUCTO: ${productName}\nMONTO: $${price}`;

                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification(title, {
                        body: body,
                        icon: "https://cdn-icons-png.flaticon.com/512/3176/3176363.png"
                    });
                }

                if (typeof showNotification === 'function') {
                    showNotification("Nueva Compra Detectada", `Producto: ${productName} ($${price})`, "success");
                }
                
                if (typeof loadAdminOrders === 'function') loadAdminOrders();
            }
        });
    });
}

// ==========================================
// DICCIONARIO GEOGRÁFICO INTEGRAL DEL ECUADOR
// ==========================================
const ecuadorGeography = {
    Costa: {
        "Guayas": {
            "Pedro Carbo": ["Sabanilla", "Valle de la Virgen", "Pedro Carbo Centro"],
            "Guayaquil": ["Tarqui", "Pascuales", "Ximena", "Febres Cordero", "Chongón", "Posorja", "Tenguel"],
            "Daule": ["Daule Centro", "La Aurora", "Limonal", "Los Lojas", "El Salitre"],
            "Salitre": ["Salitre Centro", "Gral. Vernaza", "La Victoria", "Junquillal"],
            "Samborondón": ["Samborondón Centro", "La Puntilla", "Tarifa"],
            "Balzar": ["Balzar Centro"],
            "Colimes": ["Colimes Centro", "San Jacinto"],
            "Santa Lucía": ["Santa Lucía Centro"],
            "Lomas de Sargentillo": ["Lomas Centro"],
            "Nobol": ["Narcisa de Jesús"],
            "Palestina": ["Palestina Centro"],
            "Isidro Ayora": ["Isidro Ayora Centro"],
            "Milagro": ["Milagro Centro", "Chobo", "Mariscal Sucre"],
            "Durán": ["Eloy Alfaro", "El Recreo"],
            "El Empalme": ["Velasco Ibarra", "Guayas", "El Rosario"]
        },
        "Manabí": {
            "Portoviejo": ["Portoviejo Centro", "Crucita", "18 de Octubre", "Andrés de Vera", "Pichincha"],
            "Manta": ["Manta Centro", "Tarqui", "Los Esteros", "San Mateo", "El Aromo"],
            "Chone": ["Chone Centro", "Santa Rita", "Eloy Alfaro"],
            "Monte Cristi": ["Montecristi Centro", "La Pila"],
            "Jipijapa": ["Jipijapa Centro", "Puerto Cayo"],
            "Pedernales": ["Pedernales Centro", "Cojimíes"]
        },
        "Los Ríos": {
            "Babahoyo": ["Babahoyo Centro", "Barreiro", "Caracol", "La Unión", "Puebloviejo"],
            "Quevedo": ["Quevedo Centro", "San Camilo", "Viva Alfaro", "Venus del Río"],
            "Buena Fe": ["San Jacinto de Buena Fe", "Patricia Pilar"],
            "Vinces": ["Vinces Centro", "Antonio Sotomayor"],
            "Ventanas": ["Ventanas Centro", "Zapotal"]
        },
        "Santa Elena": {
            "Santa Elena": ["Santa Elena Centro", "Ballenita", "Manglaralto", "Montañita", "Colonche"],
            "Salinas": ["Salinas Centro", "Anconcito", "San José de Ancón"],
            "La Libertad": ["La Libertad Centro"]
        },
        "El Oro": {
            "Machala": ["Machala Centro", "Puerto Bolívar", "El Cambio"],
            "Huaquillas": ["Huaquillas Centro"],
            "Pasaje": ["Pasaje Centro", "Buenavista"]
        },
        "Esmeraldas": {
            "Esmeraldas": ["Esmeraldas Centro", "Vuelta Larga", "Tonsupa"],
            "Atacames": ["Atacames Centro", "Súa", "Tonsupa", "Same"]
        },
        "Santo Domingo de los Tsáchilas": {
            "Santo Domingo": ["Santo Domingo Centro", "Alluriquín", "Luz de América"],
            "La Concordia": ["La Concordia Centro", "Plan Piloto"]
        }
    },
    Sierra: {
        "Pichincha": {
            "Quito": ["Iñaquito", "Carcelén", "Quitumbe", "Calderón", "Cotocollao", "Cumbayá", "Tumbaco"],
            "Rumiñahui": ["Sangolquí", "San Rafael"]
        },
        "Azuay": {
            "Cuenca": ["Cuenca Centro", "El Sagrario", "Yanuncay", "Ricaurte", "Turi", "Sayausí"]
        },
        "Tungurahua": {
            "Ambato": ["Ambato Centro", "Atocha", "Ficoa", "Huachi Grande"],
            "Baños": ["Baños de Agua Santa"]
        }
    },
    Oriente: {
        "Napo": { "Tena": ["Tena Centro", "Ahuano"] },
        "Pastaza": { "Puyo": ["Puyo Centro", "Shell"] }
    },
    Insular: {
        "Galápagos": {
            "Santa Cruz": ["Puerto Ayora"],
            "San Cristóbal": ["Puerto Baquerizo Moreno"],
            "Isabela": ["Puerto Villamil"]
        }
    }
};

// ==========================================
// CONTROL DE CAMBIOS DINÁMICOS EN CASCADA
// ==========================================
window.onRegionChange = function(regionName) {
    const provinceSelect = document.getElementById('adminTopProvince');
    if (!provinceSelect) return;

    const provinces = ecuadorGeography[regionName] ? Object.keys(ecuadorGeography[regionName]) : [];
    provinceSelect.innerHTML = provinces.map(p => `<option value="${p}">${p}</option>`).join('');
    
    if (provinces.length > 0) window.onProvinceChange(provinces[0]);
};

window.onProvinceChange = function(provinceName) {
    const regionName = document.getElementById('adminTopRegion')?.value || 'Costa';
    const cantonSelect = document.getElementById('adminTopCanton');
    if (!cantonSelect) return;

    const cantons = (ecuadorGeography[regionName] && ecuadorGeography[regionName][provinceName]) 
        ? Object.keys(ecuadorGeography[regionName][provinceName]) 
        : [];
    
    cantonSelect.innerHTML = cantons.map(c => `<option value="${c}">${c}</option>`).join('');
    if (cantons.length > 0) window.onCantonChange(cantons[0]);
};

window.onCantonChange = function(cantonName) {
    const regionName = document.getElementById('adminTopRegion')?.value || 'Costa';
    const provinceName = document.getElementById('adminTopProvince')?.value || 'Guayas';
    const sectorSelect = document.getElementById('adminTopSector');
    if (!sectorSelect) return;

    const sectors = (ecuadorGeography[regionName] && ecuadorGeography[regionName][provinceName] && ecuadorGeography[regionName][provinceName][cantonName])
        ? ecuadorGeography[regionName][provinceName][cantonName]
        : [cantonName];

    sectorSelect.innerHTML = sectors.map(s => `<option value="${s}">${s}</option>`).join('');
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('adminTopRegion')) {
        window.onRegionChange('Costa');
    }
});

// ==========================================
// 10. GESTIÓN DEL TOP VIP CON BADGE DE VERIFICACIÓN
// ==========================================
window.loadAdminTopBuyers = function() {
    if (!db) return;
    
    const selectedFilter = document.getElementById('adminTopCityFilter')?.value.trim() || 'Sabanilla';
    const cleanKey = selectedFilter.replace(/\s+/g, '_');
    const topRef = doc(db, 'artifacts', appId, 'config', `top_ranking_${cleanKey}`);
    
    onSnapshot(topRef, async (docSnap) => {
        const tableBody = document.getElementById('adminTopBuyersTableBody');
        if (!tableBody) return;

        if (!docSnap.exists() || !docSnap.data().buyers || docSnap.data().buyers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500">No hay registros para <strong>${selectedFilter}</strong>.</td></tr>`;
            return;
        }

        const buyers = docSnap.data().buyers;
        const medals = ["🥇", "🥈", "🥉"];
        let html = '';

        buyers.forEach((buyer, index) => {
            const verifiedBadge = buyer.verified ? `<i class="fa-solid fa-circle-check text-cyan-400 ml-1" title="Verificado"></i>` : '';
            
            html += `
                <tr class="border-b border-cyber-border hover:bg-cyber-dark/40 transition-colors text-xs">
                    <td class="p-3 font-bold text-amber-400 text-sm">${medals[index] || `#${index + 1}`}</td>
                    <td class="p-3 font-bold text-white flex items-center">${buyer.name} ${verifiedBadge}</td>
                    <td class="p-3 text-[10px] text-gray-300 font-mono">${buyer.sector}</td>
                    <td class="p-3 font-orbitron font-bold text-cyber-neonGreen">$${parseFloat(buyer.total || 0).toFixed(2)}</td>
                    <td class="p-3 text-center">
                        <button onclick="removeBuyerFromTop('${buyer.name}', '${selectedFilter}')" class="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white transition-all text-xs font-bold">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;
    });
};

window.addOrUpdateTopBuyer = async function() {
    const name = document.getElementById('adminTopName')?.value.trim().toUpperCase() || '';
    const region = document.getElementById('adminTopRegion')?.value || 'Costa';
    const province = document.getElementById('adminTopProvince')?.value || 'Guayas';
    const canton = document.getElementById('adminTopCanton')?.value || 'Pedro Carbo';
    const sector = document.getElementById('adminTopSector')?.value || 'Sabanilla';
    const amount = parseFloat(document.getElementById('adminTopAmount')?.value || 0);
    const verified = document.getElementById('adminTopVerified')?.checked || false;

    if (!name || isNaN(amount) || amount <= 0) {
        alert("Ingresa un nombre de usuario y un valor válido.");
        return;
    }

    const keyName = sector.replace(/\s+/g, '_');

    try {
        const topRef = doc(db, 'artifacts', appId, 'config', `top_ranking_${keyName}`);
        const docSnap = await getDoc(topRef);
        
        let currentBuyers = docSnap.exists() && docSnap.data().buyers ? docSnap.data().buyers : [];

        const existingIndex = currentBuyers.findIndex(b => b.name.toUpperCase() === name);
        if (existingIndex !== -1) {
            currentBuyers[existingIndex] = { name, region, province, canton, sector, total: amount, verified };
        } else {
            currentBuyers.push({ name, region, province, canton, sector, total: amount, verified });
        }

        currentBuyers.sort((a, b) => b.total - a.total);

        await setDoc(topRef, { locationKey: sector, canton, province, region, buyers: currentBuyers }, { merge: true });

        document.getElementById('adminTopName').value = '';
        document.getElementById('adminTopAmount').value = '';
        document.getElementById('adminTopVerified').checked = false;

        const filterInput = document.getElementById('adminTopCityFilter');
        if (filterInput) {
            filterInput.value = sector;
            loadAdminTopBuyers();
        }

        if (typeof showNotification === 'function') {
            showNotification("¡Guardado!", `VIP registrado con verificación en ${sector}.`, "success");
        }
    } catch (e) {
        console.error("Error guardando Top VIP:", e);
    }
};

window.removeBuyerFromTop = async function(userName, locationKey) {
    if (!confirm(`¿Remover a ${userName} de ${locationKey}?`)) return;

    try {
        const cleanKey = locationKey.replace(/\s+/g, '_');
        const topRef = doc(db, 'artifacts', appId, 'config', `top_ranking_${cleanKey}`);
        const docSnap = await getDoc(topRef);

        if (!docSnap.exists()) return;

        let currentBuyers = docSnap.data().buyers || [];
        currentBuyers = currentBuyers.filter(b => b.name.toUpperCase() !== userName.toUpperCase());

        await setDoc(topRef, { buyers: currentBuyers }, { merge: true });
        if (typeof showNotification === 'function') showNotification("Removido", "Usuario borrado del ranking.", "info");
    } catch (e) {
        console.error(e);
    }
};