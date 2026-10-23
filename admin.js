import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collectionGroup, getDocs, doc, updateDoc, collection, onSnapshot, addDoc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
// CATÁLOGO BASE DE PRECIOS POR DEFECTO (TODOS LOS JUEGOS)
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
    ]
};

// ==========================================
// CONFIGURACIÓN DE ACCESO ADMIN (LEÍDO DESDE FIREBASE)
// ==========================================
const ADMIN_USER = "admin";
const ADMIN_PASS = "12345"; 

let app, db, auth;
let activeSelectedUserId = null;
let unsubscribeChat = null;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    if (initialToken) {
        signInWithCustomToken(auth, initialToken).catch(() => {});
    } else {
        signInAnonymously(auth).catch(() => {});
    }

    onAuthStateChanged(auth, (user) => {
        if (sessionStorage.getItem("zenith_admin_logged") === "true") {
            unlockAdminPanel();
        }
    });
} catch (e) {
    console.warn("Firebase init error:", e);
}

// Verificar Usuario, Contraseña y Llave Secreta ESTRICTAMENTE desde Firestore
window.verifyAdminLogin = async function() {
    const userInput = document.getElementById('admin-user').value.trim();
    const passInput = document.getElementById('admin-pass').value.trim();
    const pinInput = document.getElementById('admin-pin').value.trim();

    if (userInput !== ADMIN_USER || passInput !== ADMIN_PASS) {
        showNotification("Error", "Usuario o contraseña incorrectos.", "error");
        return;
    }

    if (!pinInput) {
        showNotification("Atención", "Ingresa la llave secreta de seguridad.", "warning");
        return;
    }

    if (!db) {
        showNotification("Error", "Base de datos no disponible.", "error");
        return;
    }

    try {
        const authDocRef = doc(db, 'artifacts', appId, 'config', 'admin_auth');
        const authSnap = await getDoc(authDocRef);

        if (!authSnap.exists()) {
            showNotification("Error de Configuración", "No se encontró el registro de autenticación en Firestore. Configura el documento 'admin_auth' en la base de datos.", "error");
            return;
        }

        const realPin = authSnap.data().pin;

        if (pinInput === realPin) {
            sessionStorage.setItem("zenith_admin_logged", "true");
            unlockAdminPanel();
            showNotification("¡Acceso Concedido!", "Bienvenido al Panel Admin.", "success");
        } else {
            showNotification("Llave Incorrecta", "La llave secreta ingresada es inválida.", "error");
        }

    } catch (e) {
        console.error("Error al validar llave en Firestore:", e);
        showNotification("Error", "No se pudo verificar la llave con el servidor.", "error");
    }
};

function unlockAdminPanel() {
    document.getElementById('admin-login-overlay').classList.add('hidden');
    document.getElementById('admin-main-content').classList.remove('hidden');
    
    loadAdminOrders();
    loadAdminUsersList();
    loadCatalogPricesForAdmin();
    loadAdminWalletRequests(); 
    loadClientsDropdown();     
    loadAdminChecksTable(); // Cargar la tabla de cheques activos
}

window.logoutAdmin = function() {
    sessionStorage.removeItem("zenith_admin_logged");
    location.reload();
}

// ==========================================
// 1. GESTIÓN Y REGISTRO DE CÓDIGOS DE CHEQUES
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const checkForm = document.getElementById('adminAddCheckForm');
    const depositInput = document.getElementById('adminCheckCode');
    const hourInput = document.getElementById('adminCheckHour');

    // Auto-filtrar a solo números para el número de depósito (14 a 15 dígitos)
    depositInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
    });

    // Auto-formatear hora a formato HH:MM (00:00)
    hourInput?.addEventListener('input', (e) => {
        let raw = e.target.value.replace(/\D/g, '');
        if (raw.length > 4) raw = raw.substring(0, 4);

        if (raw.length >= 3) {
            e.target.value = `${raw.substring(0, 2)}:${raw.substring(2)}`;
        } else {
            e.target.value = raw;
        }
    });

    // Registrar cheque en Firestore desde el panel de Admin
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
            showNotification("Atención", "Ingresa una hora válida en formato 00:00 (Ej. 14:00).", "warning");
            return;
        }

        if (amount <= 0) {
            showNotification("Atención", "Ingresa un monto mayor a $0.00.", "warning");
            return;
        }

        if (!db) return;

        try {
            await setDoc(doc(db, 'artifacts', appId, 'admin_checks', code), {
                code: code,
                hour: hour,
                amount: amount,
                createdAt: new Date().toISOString()
            });

            checkForm.reset();
            showNotification("¡Éxito!", `Cheque ${code} registrado correctamente por $${amount.toFixed(2)}.`, "success");
        } catch (err) {
            console.error("Error al registrar cheque:", err);
            showNotification("Error", "No se pudo registrar el cheque en la base de datos.", "error");
        }
    });
});

// Escuchar y listar cheques activos en la tabla del panel de Admin
function loadAdminChecksTable() {
    const tableBody = document.getElementById('adminChecksTableBody');
    if (!db || !tableBody) return;

    const checksCol = collection(db, 'artifacts', appId, 'admin_checks');
    
    onSnapshot(checksCol, (snapshot) => {
        let html = '';
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-500">No hay cheques activos en el sistema actualmente.</td></tr>`;
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

// Eliminar un cheque permanentemente de Firestore
window.deleteAdminCheck = async function(docId) {
    if (!db) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'admin_checks', docId));
        showNotification("Eliminado", "El cheque fue borrado permanentemente de la base de datos.", "info");
    } catch (e) {
        console.error("Error al eliminar cheque:", e);
        showNotification("Error", "No se pudo eliminar el cheque.", "error");
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
                ? `<a href="${ord.paymentReference}" target="_blank" class="text-xs text-cyber-neonCyan underline flex items-center space-x-1 mt-1"><i class="fa-solid fa-image"></i><span>Ver Comprobante Subido</span></a>`
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

            let actionButtonsHtml = '';
            if (isProcessed) {
                actionButtonsHtml = `<span class="text-[10px] text-gray-500 italic bg-cyber-card px-3 py-1.5 rounded-xl border border-cyber-border">Procesada</span>`;
            } else {
                actionButtonsHtml = `
                    <div class="flex space-x-2">
                        <button onclick="updateOrderStatus('${ord.refPath.path}', 'Verificada')" class="px-3 py-2 rounded-xl bg-green-600/25 border border-green-500/40 text-green-400 text-xs font-bold hover:bg-green-600 hover:text-white transition-all" title="Aprobar / Marcar Verificada">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button onclick="updateOrderStatus('${ord.refPath.path}', 'Rechazada')" class="px-3 py-2 rounded-xl bg-red-600/25 border border-red-500/40 text-red-400 text-xs font-bold hover:bg-red-600 hover:text-white transition-all" title="Rechazar">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                `;
            }

            html += `
                <div class="bg-cyber-dark p-5 rounded-2xl border border-cyber-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center space-x-2">
                            <span class="px-2 py-0.5 rounded bg-cyan-500/10 text-cyber-neonCyan text-[10px] font-bold uppercase">${ord.game || 'Juego'}</span>
                            <span class="text-xs text-gray-400">${dateStr}</span>
                        </div>
                        <h4 class="font-bold text-white text-base">${ord.product}</h4>
                        <p class="text-xs text-gray-300">Datos / ID: <span class="text-cyber-neonCyan font-mono">${ord.playerId}</span> | Pago: <span class="uppercase font-semibold text-white">${ord.paymentMethod}</span></p>
                        ${imgPreview}
                    </div>

                    <div class="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-cyber-border">
                        <div class="text-right space-y-1">
                            <span class="font-orbitron font-bold text-white text-base block">$${Number(ord.price || 0).toFixed(2)}</span>
                            ${statusBadge}
                        </div>
                        <div>
                            ${actionButtonsHtml}
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

    } catch (e) {
        console.error("Error loading admin orders:", e);
        container.innerHTML = `<div class="p-8 text-center text-red-400 text-xs">Error al cargar las órdenes.</div>`;
    }
};

window.updateOrderStatus = async function(docPath, newStatus) {
    if (!db) return;
    
    let rejectionReason = "";
    if (newStatus === 'Rechazada') {
        rejectionReason = prompt("Ingresa el motivo del rechazo:", "Comprobante no válido o no confirmado.");
        if (rejectionReason === null) return;
    }

    try {
        const orderRef = doc(db, docPath);
        const orderSnap = await getDoc(orderRef);
        let targetUid = 'anonymous-user';
        let productName = 'Recarga';
        
        if (orderSnap.exists()) {
            const orderData = orderSnap.data();
            productName = orderData.product || 'Recarga';
            const pathSegments = orderRef.path.split('/');
            const userIndex = pathSegments.indexOf('users');
            if (userIndex !== -1 && pathSegments[userIndex + 1]) {
                targetUid = pathSegments[userIndex + 1];
            }
        }

        await updateDoc(orderRef, { status: newStatus });
        const notifCol = collection(db, 'artifacts', appId, 'notifications');
        
        if (newStatus === 'Verificada') {
            await addDoc(notifCol, {
                target: targetUid,
                category: 'success',
                title: '¡Recarga Exitosa y Verificada!',
                body: `Tu orden de ${productName} ha sido aprobada y acreditada correctamente.`,
                timestamp: new Date().toISOString()
            });
            showNotification("Aprobada", "Orden verificada correctamente.", "success");
        } else if (newStatus === 'Rechazada') {
            await addDoc(notifCol, {
                target: targetUid,
                category: 'failed',
                title: 'Recarga No Exitosa / Rechazada',
                body: `Tu orden de ${productName} fue rechazada. Motivo: ${rejectionReason}`,
                timestamp: new Date().toISOString()
            });
            showNotification("Rechazada", "Orden rechazada.", "warning");
        }

        loadAdminOrders();
    } catch (e) {
        console.error("Error:", e);
        showNotification("Error", "No se pudo actualizar la orden.", "error");
    }
};

// ==========================================
// 3. GESTIÓN DE BILLETERA Y SALDO
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
            const pathSegments = docSnap.ref.path.split('/');
            const userIndex = pathSegments.indexOf('users');
            let userId = 'anonymous';
            if (userIndex !== -1 && pathSegments[userIndex + 1]) {
                userId = pathSegments[userIndex + 1];
            }
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
                    <div class="flex items-center space-x-3 w-full sm:w-auto justify-end">
                        ${tx.status !== 'COMPLETADO' ? `
                            <button onclick="approveWalletTransaction('${tx.userId}', '${tx.id}', ${tx.amount}, '${tx.type}')" class="px-4 py-2 rounded-xl bg-cyber-neonCyan text-black font-bold text-xs hover:opacity-95 shadow-neon-cyan">
                                <i class="fa-solid fa-check mr-1"></i> Aprobar y Sumar Saldo
                            </button>
                        ` : `
                            <span class="px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">Completado</span>
                        `}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) {
        console.error("Error:", e);
    }
};

window.approveWalletTransaction = async function(userId, txId, amount, type) {
    if (!db) return;
    try {
        const userRef = doc(db, 'artifacts', appId, 'users', userId);
        const txRef = doc(db, 'artifacts', appId, 'users', userId, 'wallet_transactions', txId);

        const userDoc = await getDoc(userRef);
        let currentSaldo = 0;
        if (userDoc.exists()) {
            currentSaldo = userDoc.data().saldo || 0;
        }

        let newSaldo = type === "DEPOSITO" ? currentSaldo + amount : currentSaldo - amount;

        await setDoc(userRef, { saldo: newSaldo }, { merge: true });
        await updateDoc(txRef, { status: "COMPLETADO" });

        const notifCol = collection(db, 'artifacts', appId, 'notifications');
        await addDoc(notifCol, {
            target: userId,
            category: 'success',
            title: type === "DEPOSITO" ? '¡Depósito Aprobado!' : '¡Retiro Procesado!',
            body: `Tu solicitud de ${type.toLowerCase()} por $${amount.toFixed(2)} ha sido aprobada. Saldo actual: $${newSaldo.toFixed(2)}.`,
            timestamp: new Date().toISOString()
        });

        showNotification("¡Aprobado!", `Saldo actualizado correctamente ($${newSaldo.toFixed(2)}).`, "success");
        loadAdminWalletRequests();
    } catch (e) {
        showNotification("Error", "No se pudo procesar la aprobación.", "error");
    }
};

window.addManualBalanceToUser = async function() {
    const userId = document.getElementById('admin-manual-uid').value;
    const amountInput = document.getElementById('admin-manual-amount');
    const reasonInput = document.getElementById('admin-manual-reason');
    
    const amount = parseFloat(amountInput ? amountInput.value : 0);
    const reason = reasonInput ? reasonInput.value.trim() : 'Abono manual del Administrador';

    if (!userId) {
        showNotification("Atención", "Selecciona un usuario.", "warning");
        return;
    }

    if (!amount || amount <= 0) {
        showNotification("Atención", "Ingresa un monto válido.", "warning");
        return;
    }

    try {
        const userRef = doc(db, 'artifacts', appId, 'users', userId);
        const walletCol = collection(db, 'artifacts', appId, 'users', userId, 'wallet_transactions');

        const userDoc = await getDoc(userRef);
        let currentSaldo = 0;
        if (userDoc.exists()) {
            currentSaldo = userDoc.data().saldo || 0;
        }

        let newSaldo = currentSaldo + amount;

        await setDoc(userRef, { saldo: newSaldo }, { merge: true });
        await addDoc(walletCol, {
            type: "DEPOSITO",
            amount: amount,
            bank: `Manual: ${reason}`,
            status: "COMPLETADO",
            timestamp: new Date().toISOString()
        });

        const notifCol = collection(db, 'artifacts', appId, 'notifications');
        await addDoc(notifCol, {
            target: userId,
            category: 'success',
            title: '¡Saldo Abonado por el Admin!',
            body: `Se acreditaron $${amount.toFixed(2)}. Motivo: ${reason}. Saldo actual: $${newSaldo.toFixed(2)}`,
            timestamp: new Date().toISOString()
        });

        amountInput.value = '';
        reasonInput.value = '';

        showNotification("¡Acreditado!", `Se sumaron $${amount.toFixed(2)} correctamente.`, "success");
        loadAdminWalletRequests();
    } catch (e) {
        showNotification("Error", "No se pudo acreditar el saldo.", "error");
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
            const pathSegments = docSnap.ref.path.split('/');
            const userIndex = pathSegments.indexOf('users');
            if (userIndex !== -1 && pathSegments[userIndex + 1]) {
                uniqueUsers.add(pathSegments[userIndex + 1]);
            }
        });

        let usersHtml = '';
        if (uniqueUsers.size === 0) {
            listContainer.innerHTML = `<span class="text-xs text-gray-500">No hay chats activos.</span>`;
            return;
        }

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
        console.error("Error:", e);
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
            let senderLabel = 'Cliente';
            let bgClass = 'self-end bg-pink-950/40 border-pink-500/40 text-white';

            if (isUser) {
                senderLabel = 'Cliente';
                bgClass = 'self-start bg-cyber-card border-cyber-border text-gray-300';
            } else if (msg.sender === 'bot') {
                senderLabel = 'BOT';
                bgClass = 'self-end bg-blue-950/40 border-blue-500/40 text-white';
            }

            let imgHtml = msg.image ? `<a href="${msg.image}" target="_blank"><img src="${msg.image}" class="mt-2 rounded-xl max-h-40 object-cover border border-cyber-border"></a>` : '';
            
            html += `
                <div class="${bgClass} border p-3 rounded-2xl max-w-[80%] text-xs space-y-1">
                    <span class="font-bold ${isUser ? 'text-cyber-neonCyan' : 'text-cyber-neonPink'} block">${senderLabel}</span>
                    <p>${msg.text}</p>
                    ${imgHtml}
                </div>
            `;
        });
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    });
};

window.sendAdminReply = async function() {
    if (!activeSelectedUserId) {
        showNotification("Atención", "Selecciona un usuario.", "warning");
        return;
    }
    const input = document.getElementById('admin-chat-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    try {
        const chatCol = collection(db, 'artifacts', appId, 'users', activeSelectedUserId, 'chat_messages');
        await addDoc(chatCol, {
            sender: 'support',
            text: text,
            image: null,
            timestamp: new Date().toISOString()
        });
        input.value = '';
    } catch (e) {
        console.error("Error:", e);
    }
};

window.handleAdminChatKey = function(e) {
    if (e.key === 'Enter') {
        sendAdminReply();
    }
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
        const playerRef = doc(db, 'players_db', playerId);
        await setDoc(playerRef, { playerId, name: playerName, level: playerLevel, updatedAt: new Date().toISOString() });
        showNotification("¡Registrado!", `Jugador ${playerName} guardado.`, "success");
        idInput.value = ''; nameInput.value = ''; levelInput.value = '';
    } catch (e) {
        showNotification("Error", "No se pudo guardar.", "error");
    }
};

// ==========================================
// 6. GESTIÓN DE PRECIOS, ESTADOS Y NUEVOS PRODUCTOS
// ==========================================
window.loadCatalogPricesForAdmin = function() {
    const select = document.getElementById('admin-game-select');
    const container = document.getElementById('admin-prices-list');
    if (!select || !container || !db) return;

    const gameKey = select.value; 
    container.innerHTML = `<div class="p-4 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin text-cyber-neonCyan"></i> Sincronizando precios de ${gameKey.toUpperCase()}...</div>`;

    const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
    
    onSnapshot(docRef, (docSnap) => {
        let items = docSnap.exists() ? docSnap.data().items : (baseCatalogPrices[gameKey] || []);

        let html = `
            <div class="flex justify-between items-center mb-4">
                <h4 class="font-bold text-white text-sm">Paquetes de ${gameKey.toUpperCase()}</h4>
                <button onclick="addNewProductToCatalog('${gameKey}')" class="px-3 py-2 rounded-xl bg-cyber-neonCyan text-black font-bold text-xs flex items-center space-x-1.5 shadow-neon-cyan">
                    <i class="fa-solid fa-plus"></i>
                    <span>Agregar Producto</span>
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
            const statusText = isAgotado ? 'AGOTADO' : 'DISPONIBLE';

            html += `
                <div class="bg-cyber-dark p-4 rounded-2xl border border-cyber-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <div class="flex items-center space-x-2">
                            <span class="text-[10px] text-cyber-neonCyan font-mono">${item.id}</span>
                            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusBadgeClass}">${statusText}</span>
                        </div>
                        <h4 class="font-bold text-white text-sm">${item.name}</h4>
                    </div>
                    
                    <div class="flex items-center space-x-2 w-full sm:w-auto justify-end">
                        <span class="text-xs text-gray-400">$</span>
                        <input type="number" step="0.01" id="price-input-${gameKey}-${index}" value="${item.price}" class="w-20 bg-cyber-card border border-cyber-border rounded-xl px-3 py-2 text-white text-xs font-bold focus:outline-none focus:border-cyber-neonCyan">
                        
                        <button onclick="updateSinglePrice('${gameKey}', ${index}, '${item.id}', '${item.name}')" class="px-3 py-2 rounded-xl bg-cyber-neonCyan text-black font-bold text-xs hover:opacity-90">
                            Guardar
                        </button>
                        
                        <button onclick="toggleProductStatus('${gameKey}', ${index})" class="px-3 py-2 rounded-xl bg-cyber-card border border-cyber-border text-amber-400 hover:bg-amber-500 hover:text-black text-xs" title="Cambiar estado Agotado/Disponible">
                            <i class="fa-solid fa-ban"></i>
                        </button>

                        <button onclick="deleteCatalogItem('${gameKey}', ${index})" class="px-3 py-2 rounded-xl bg-cyber-card border border-cyber-border text-red-400 hover:bg-red-500 hover:text-black text-xs" title="Eliminar producto">
                            <i class="fa-solid fa-trash"></i>
                        </button>
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
        showNotification("Atención", "Ingresa un precio válido.", "warning");
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
    
    modal.classList.remove('hidden');
};

window.closeAddProductModal = function() {
    const modal = document.getElementById('addProductModal');
    if (modal) modal.classList.add('hidden');
};

window.submitNewProductModal = async function() {
    const modal = document.getElementById('addProductModal');
    if (!modal) return;
    
    const gameKey = modal.dataset.gameKey;
    const name = document.getElementById('modal-product-name').value.trim();
    const priceStr = document.getElementById('modal-product-price').value;
    const limitType = document.getElementById('modal-product-limit').value;

    if (!name) {
        showNotification("Atención", "Ingresa el nombre del producto.", "warning");
        return;
    }

    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) {
        showNotification("Atención", "Ingresa un precio válido.", "warning");
        return;
    }

    const itemId = `${gameKey}-${Date.now()}`;

    try {
        const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
        const docSnap = await getDoc(docRef);
        
        let items = [];
        if (docSnap.exists() && docSnap.data().items) {
            items = [...docSnap.data().items];
        } else if (baseCatalogPrices[gameKey]) {
            items = [...baseCatalogPrices[gameKey]];
        }

        const newProduct = {
            id: itemId,
            name: name,
            price: price,
            stockType: limitType,
            status: 'disponible'
        };

        items.push(newProduct);

        await setDoc(docRef, { items }, { merge: true });
        closeAddProductModal();
        showNotification("¡Éxito!", "Producto agregado correctamente.", "success");
        loadCatalogPricesForAdmin();
    } catch (e) {
        console.error("Error al guardar producto:", e);
        showNotification("Error", "No se pudo guardar el producto.", "error");
    }
};

window.deleteCatalogItem = async function(gameKey, index) {
    if (!confirm("¿Estás seguro de eliminar este producto?")) return;

    try {
        const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
        const docSnap = await getDoc(docRef);
        
        let items = [];
        if (docSnap.exists() && docSnap.data().items) {
            items = [...docSnap.data().items];
        } else if (baseCatalogPrices[gameKey]) {
            items = [...baseCatalogPrices[gameKey]];
        }

        if (items.length > index) {
            items.splice(index, 1);

            await setDoc(docRef, { items }, { merge: true });
            showNotification("Eliminado", "Producto removido del catálogo.", "success");
            loadCatalogPricesForAdmin();
        }
    } catch (e) {
        console.error("Error al eliminar producto:", e);
        showNotification("Error", "No se pudo eliminar el producto.", "error");
    }
};

window.toggleProductStatus = async function(gameKey, index) {
    try {
        const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
        const docSnap = await getDoc(docRef);
        
        let items = [];
        if (docSnap.exists() && docSnap.data().items) {
            items = [...docSnap.data().items];
        } else if (baseCatalogPrices[gameKey]) {
            items = [...baseCatalogPrices[gameKey]];
        }

        if (items.length > index) {
            const currentStatus = items[index].status || 'disponible';
            items[index].status = currentStatus === 'disponible' ? 'agotado' : 'disponible';

            await setDoc(docRef, { items }, { merge: true });
            showNotification("Estado Actualizado", `El producto ahora está ${items[index].status.toUpperCase()}`, "info");
            loadCatalogPricesForAdmin();
        }
    } catch (e) {
        console.error("Error al cambiar estado:", e);
        showNotification("Error", "No se pudo cambiar el estado.", "error");
    }
};

// ==========================================
// 7. ESTADÍSTICAS Y NOTIFICACIONES
// ==========================================
function updateAdminStats(orders) {
    const totalOrders = orders.length;
    
    const pendingOrders = orders.filter(o => {
        const st = (o.status || '').toLowerCase();
        return st.includes('pendiente') || st.includes('verificaci');
    }).length;

    const totalRevenue = orders
        .filter(o => {
            const st = (o.status || '').toLowerCase();
            return st === 'verificada' || st === 'completada';
        })
        .reduce((sum, o) => sum + Number(o.price || 0), 0);

    const totalEl = document.getElementById('stat-total-orders');
    const pendingEl = document.getElementById('stat-pending-orders');
    const revenueEl = document.getElementById('stat-total-revenue');

    if (totalEl) totalEl.innerText = totalOrders;
    if (pendingEl) pendingEl.innerText = pendingOrders;
    if (revenueEl) revenueEl.innerText = `$${totalRevenue.toFixed(2)}`;
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
        if (type === 'user') {
            wrapper.classList.remove('hidden');
            loadClientsDropdown();
        } else {
            wrapper.classList.add('hidden');
        }
    }
};

window.sendSystemNotification = async function() {
    const type = document.getElementById('admin-notif-type').value;
    const selectTarget = document.getElementById('admin-notif-target-uid');
    const targetUid = selectTarget ? selectTarget.value.trim() : '';
    const category = document.getElementById('admin-notif-category').value;
    const title = document.getElementById('admin-notif-title').value.trim();
    const body = document.getElementById('admin-notif-body').value.trim();

    if (!title || !body) {
        showNotification("Atención", "Completa título y cuerpo.", "warning");
        return;
    }

    if (type === 'user' && !targetUid) {
        showNotification("Atención", "Selecciona un cliente.", "warning");
        return;
    }

    try {
        const notifCol = collection(db, 'artifacts', appId, 'notifications');
        await addDoc(notifCol, {
            target: type === 'global' ? 'global' : targetUid,
            category: category,
            title: title,
            body: body,
            timestamp: new Date().toISOString()
        });

        showNotification("¡Enviado!", "Notificación publicada con éxito.", "success");
        document.getElementById('admin-notif-title').value = '';
        document.getElementById('admin-notif-body').value = '';
        if (selectTarget) selectTarget.value = '';
    } catch (e) {
        showNotification("Error", "No se pudo enviar la notificación.", "error");
    }
};

window.fillNotifTemplate = function(type) {
    const categorySelect = document.getElementById('admin-notif-category');
    const titleInput = document.getElementById('admin-notif-title');
    const bodyInput = document.getElementById('admin-notif-body');

    if (!categorySelect || !titleInput || !bodyInput) return;

    if (type === 'success') {
        categorySelect.value = 'success';
        titleInput.value = '¡Recarga Exitosa y Acreditada!';
        bodyInput.value = 'Tu pago ha sido verificado correctamente. ¡Gracias por confiar en ZenithRecargas!';
    } else if (type === 'failed') {
        categorySelect.value = 'failed';
        titleInput.value = 'Recarga No Exitosa';
        bodyInput.value = 'Lo sentimos, tu comprobante no pudo ser confirmado. Por favor, contáctanos.';
    } else if (type === 'update') {
        categorySelect.value = 'update';
        titleInput.value = 'Actualización del Sistema';
        bodyInput.value = 'Hemos implementado mejoras en nuestra plataforma.';
    }
    showNotification("Plantilla Cargada", "Campos completados.", "info");
};

window.loadClientsDropdown = async function() {
    const selectNotif = document.getElementById('admin-notif-target-uid');
    const selectManual = document.getElementById('admin-manual-uid');
    
    if ((!selectNotif && !selectManual) || !db) return;

    if (selectNotif) selectNotif.innerHTML = `<option value="">Cargando clientes...</option>`;
    if (selectManual) selectManual.innerHTML = `<option value="">Cargando clientes...</option>`;

    try {
        let clientsMap = new Map();
        const usersCol = collection(db, 'artifacts', appId, 'users');
        const usersSnapshot = await getDocs(usersCol);

        usersSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            const uid = docSnap.id;
            const email = data.email || data.userEmail || data.displayName || `Usuario (${uid.substring(0, 8)}...)`;
            clientsMap.set(uid, email);
        });

        if (clientsMap.size === 0) {
            const ordersSnapshot = await getDocs(collectionGroup(db, 'orders'));
            ordersSnapshot.forEach(docSnap => {
                const data = docSnap.data();
                const pathSegments = docSnap.ref.path.split('/');
                const userIndex = pathSegments.indexOf('users');
                if (userIndex !== -1 && pathSegments[userIndex + 1]) {
                    const uid = pathSegments[userIndex + 1];
                    const email = data.userEmail || data.email || `Usuario (${uid.substring(0, 8)}...)`;
                    clientsMap.set(uid, email);
                }
            });
        }

        if (clientsMap.size === 0) {
            if (selectNotif) selectNotif.innerHTML = `<option value="">No hay clientes registrados</option>`;
            if (selectManual) selectManual.innerHTML = `<option value="">No hay clientes registrados</option>`;
            return;
        }

        let optionsHtml = `<option value="">-- Selecciona un cliente --</option>`;
        clientsMap.forEach((email, uid) => {
            optionsHtml += `<option value="${uid}">${email}</option>`;
        });
        
        if (selectNotif) selectNotif.innerHTML = optionsHtml;
        if (selectManual) selectManual.innerHTML = optionsHtml;
    } catch (e) {
        console.error("Error cargando clientes:", e);
    }
};

// ==========================================
// 8. ESCÁNER DE PRECIOS CON IA / OCR (TESSERACT)
// ==========================================
let parsedOcrItems = [];

window.handlePriceImageUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    showNotification("Procesando", "Leyendo imagen con IA y extrayendo precios...", "info");

    try {
        const { data: { text } } = await Tesseract.recognize(file, 'spa');
        parsedOcrItems = parsePricesFromText(text);

        if (parsedOcrItems.length === 0) {
            showNotification("Atención", "No se detectaron precios claros. Intenta con otra imagen más nítida.", "warning");
            return;
        }

        renderOcrPreviewModal();
    } catch (e) {
        console.error("Error OCR:", e);
        showNotification("Error", "No se pudo leer la imagen.", "error");
    }
};

function parsePricesFromText(text) {
    const lines = text.split('\n');
    let items = [];
    
    lines.forEach((line, index) => {
        const cleanLine = line.trim();
        if (cleanLine.length < 3) return;

        const priceMatch = cleanLine.match(/\$?\s*(\d+[\.,]\d{2})/);
        
        if (priceMatch) {
            const price = parseFloat(priceMatch[1].replace(',', '.'));
            const name = cleanLine.replace(priceMatch[0], '').trim() || `Paquete ${index + 1}`;
            
            items.push({
                id: `ocr-${Date.now()}-${index}`,
                name: name,
                price: price,
                status: 'disponible'
            });
        }
    });

    return items;
}

function renderOcrPreviewModal() {
    const container = document.getElementById('ocr-items-container');
    const modal = document.getElementById('ocrPreviewModal');
    if (!container || !modal) return;

    let html = '';
    parsedOcrItems.forEach((item, index) => {
        html += `
            <div class="bg-cyber-dark p-4 rounded-2xl border border-cyber-border flex flex-col sm:flex-row items-center justify-between gap-3">
                <div class="w-full sm:w-3/5 space-y-1">
                    <label class="text-[9px] text-gray-400 uppercase">Producto</label>
                    <input type="text" id="ocr-name-${index}" value="${item.name}" class="w-full bg-cyber-card border border-cyber-border rounded-xl px-3 py-2 text-white text-xs font-bold focus:outline-none focus:border-cyber-neonCyan">
                </div>
                <div class="w-full sm:w-1/4 space-y-1">
                    <label class="text-[9px] text-gray-400 uppercase">Precio ($)</label>
                    <input type="number" step="0.01" id="ocr-price-${index}" value="${item.price}" class="w-full bg-cyber-card border border-cyber-border rounded-xl px-3 py-2 text-white text-xs font-bold focus:outline-none focus:border-cyber-neonCyan">
                </div>
                <div class="pt-4">
                    <button onclick="removeOcrItem(${index})" class="px-3 py-2 rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white text-xs">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    modal.classList.remove('hidden');
}

window.removeOcrItem = function(index) {
    parsedOcrItems.splice(index, 1);
    renderOcrPreviewModal();
};

window.closeOcrModal = function() {
    const modal = document.getElementById('ocrPreviewModal');
    if (modal) modal.classList.add('hidden');
};

window.saveOcrCatalogToFirestore = async function() {
    const select = document.getElementById('admin-game-select');
    const gameKey = select ? select.value : 'freefire';

    let finalItems = [];
    parsedOcrItems.forEach((item, index) => {
        const nameInput = document.getElementById(`ocr-name-${index}`);
        const priceInput = document.getElementById(`ocr-price-${index}`);

        if (nameInput && priceInput) {
            finalItems.push({
                id: item.id || `${gameKey}-${Date.now()}-${index}`,
                name: nameInput.value.trim(),
                price: parseFloat(priceInput.value) || 0,
                status: 'disponible'
            });
        }
    });

    if (finalItems.length === 0) {
        showNotification("Atención", "No hay productos válidos para guardar.", "warning");
        return;
    }

    try {
        const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
        await setDoc(docRef, { items: finalItems });

        closeOcrModal();
        showNotification("¡Éxito!", "Catálogo actualizado y publicado en la tienda principal.", "success");
        loadCatalogPricesForAdmin();
    } catch (e) {
        console.error("Error al guardar catálogo OCR:", e);
        showNotification("Error", "No se pudo guardar en la base de datos.", "error");
    }
};