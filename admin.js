import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collectionGroup, getDocs, doc, updateDoc, collection, onSnapshot, addDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
// CONFIGURACIÓN DE ACCESO Y GOOGLE AUTHENTICATOR
// ==========================================
const ADMIN_USER = "admin";
const ADMIN_PASS = "12345"; 
const ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP"; 

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

// Verificar Usuario, Contraseña y Llave Secreta desde Firestore
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

        let realPin = null;

        if (authSnap.exists()) {
            realPin = authSnap.data().pin;
        } else {
            realPin = "734948";
            await setDoc(authDocRef, { pin: realPin });
        }

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
}

window.logoutAdmin = function() {
    sessionStorage.removeItem("zenith_admin_logged");
    location.reload();
}

// ==========================================
// 1. GESTIÓN DE ÓRDENES
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
    try {
        const orderRef = doc(db, docPath);
        await updateDoc(orderRef, { status: newStatus });
        showNotification("Actualizado", `Orden marcada como ${newStatus}`, "success");
        loadAdminOrders();
    } catch (e) {
        showNotification("Error", "No se pudo actualizar la orden.", "error");
    }
};

// ==========================================
// 2. GESTIÓN DE CHATS DE SOPORTE
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
                        <p class="font-bold text-white text-xs">Cliente / UID</p>
                        <p class="text-[10px] text-gray-400 truncate max-w-[180px]">${uid}</p>
                    </div>
                    <i class="fa-solid fa-chevron-right text-xs text-gray-500"></i>
                </div>
            `;
        });
        listContainer.innerHTML = usersHtml;
    } catch (e) {
        console.error("Error loading users:", e);
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
            let senderLabel = 'ADMIN';
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
        showNotification("Atención", "Selecciona un usuario de la lista.", "warning");
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
        console.error("Error sending admin reply:", e);
    }
};

window.handleAdminChatKey = function(e) {
    if (e.key === 'Enter') {
        sendAdminReply();
    }
};

window.sendQuickBotResponse = async function(type) {
    if (!activeSelectedUserId) {
        showNotification("Atención", "Selecciona un usuario.", "warning");
        return;
    }

    let messageText = type === 'success' 
        ? "¡Tu recarga ha sido procesada con éxito! Los diamantes o monedas ya fueron enviados a tu ID. ¡Gracias por preferir ZenithRecargas!" 
        : "Lo sentimos, tu comprobante no pudo ser validado o el pago no fue confirmado. Por favor, verifica los datos e intenta nuevamente.";

    try {
        const chatCol = collection(db, 'artifacts', appId, 'users', activeSelectedUserId, 'chat_messages');
        await addDoc(chatCol, {
            sender: 'bot',
            text: messageText,
            image: null,
            timestamp: new Date().toISOString()
        });
        showNotification("Enviado", "Mensaje automático del Bot enviado.", "success");
    } catch (e) {
        console.error("Error:", e);
    }
};

// ==========================================
// 3. REGISTRO DE JUGADORES
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
// 4. GESTIÓN DE PRECIOS EN TIEMPO REAL
// ==========================================
const baseCatalogPrices = {
    freefire: [
        { id: 'ff-110', name: '110 Diamantes', price: 0.90 },
        { id: 'ff-341', name: '341 Diamantes', price: 2.50 },
        { id: 'ff-572', name: '572 Diamantes', price: 4.50 },
        { id: 'ff-1166', name: '1166 Diamantes', price: 7.90 },
        { id: 'ff-2398', name: '2398 Diamantes', price: 15.60 },
        { id: 'ff-6160', name: '6160 Diamantes', price: 37.95 },
        { id: 'ff-booyah', name: 'Pase Booyah', price: 1.30 },
        { id: 'ff-evo-token', name: 'Token EVO', price: 0.10 },
        { id: 'ff-evo-box', name: 'Caja EVO', price: 0.20 },
        { id: 'ff-weekly-basic', name: 'Tarjeta semanal básica', price: 0.50 },
        { id: 'ff-weekly', name: 'Tarjeta semanal', price: 1.95 },
        { id: 'ff-monthly', name: 'Tarjeta mensual', price: 8.70 }
    ],
    roblox: [
        { id: 'rbx-400', name: '400 Robux', price: 4.99 },
        { id: 'rbx-800', name: '800 Robux', price: 9.99 },
        { id: 'rbx-1700', name: '1700 Robux', price: 19.99 }
    ],
    mobilelegends: [
        { id: 'ml-110', name: '110 Diamonds', price: 1.99 },
        { id: 'ml-257', name: '257 Diamonds', price: 4.49 },
        { id: 'ml-565', name: '565 Diamonds', price: 9.49 }
    ],
    codm: [
        { id: 'cod-80', name: '80 CP', price: 0.99 },
        { id: 'cod-420', name: '420 CP', price: 4.99 },
        { id: 'cod-880', name: '880 CP', price: 9.99 }
    ],
    pubg: [
        { id: 'pubg-60', name: '60 UC', price: 0.99 },
        { id: 'pubg-325', name: '325 UC', price: 4.99 },
        { id: 'pubg-660', name: '660 UC', price: 9.99 }
    ]
};

window.loadCatalogPricesForAdmin = function() {
    const select = document.getElementById('admin-game-select');
    const container = document.getElementById('admin-prices-list');
    if (!select || !container || !db) return;

    const gameKey = select.value;
    container.innerHTML = `<div class="p-4 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin text-cyber-neonCyan"></i> Sincronizando precios...</div>`;

    const docRef = doc(db, 'artifacts', appId, 'config', `prices_${gameKey}`);
    
    onSnapshot(docRef, (docSnap) => {
        let items = docSnap.exists() ? docSnap.data().items : baseCatalogPrices[gameKey];

        let html = '';
        items.forEach((item, index) => {
            html += `
                <div class="bg-cyber-dark p-4 rounded-2xl border border-cyber-border flex items-center justify-between gap-4">
                    <div>
                        <span class="text-[10px] text-cyber-neonCyan font-mono">${item.id}</span>
                        <h4 class="font-bold text-white text-sm">${item.name}</h4>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="text-xs text-gray-400">$</span>
                        <input type="number" step="0.01" id="price-input-${gameKey}-${index}" value="${item.price}" class="w-24 bg-cyber-card border border-cyber-border rounded-xl px-3 py-2 text-white text-xs font-bold focus:outline-none focus:border-cyber-neonCyan">
                        <button onclick="updateSinglePrice('${gameKey}', ${index}, '${item.id}', '${item.name}')" class="px-4 py-2 rounded-xl bg-cyber-neonCyan text-black font-bold text-xs hover:opacity-90 transition-all">
                            Guardar
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
        items[index] = { id: itemId, name: itemName, price: newPrice };

        await setDoc(docRef, { items });
        showNotification("¡Actualizado!", `Precio de ${itemName} modificado.`, "success");
    } catch (e) {
        showNotification("Error", "No se pudo actualizar.", "error");
    }
};

// ==========================================
// 5. AUXILIARES Y ESTADÍSTICAS (CORREGIDO)
// ==========================================
function updateAdminStats(orders) {
    const totalOrders = orders.length;
    
    const pendingOrders = orders.filter(o => {
        const st = (o.status || '').toLowerCase();
        return st.includes('pendiente') || st.includes('verificaci');
    }).length;

    // Suma correctamente las órdenes Verificadas o Completadas
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

// Mostrar/Ocultar input del UID según el tipo de destinatario seleccionado
window.toggleNotifTargetInput = function() {
    const type = document.getElementById('admin-notif-type').value;
    const wrapper = document.getElementById('notif-user-target-wrapper');
    if (wrapper) {
        if (type === 'user') {
            wrapper.classList.remove('hidden');
        } else {
            wrapper.classList.add('hidden');
        }
    }
};

// Guardar y transmitir Notificación/Anuncio
window.sendSystemNotification = async function() {
    const type = document.getElementById('admin-notif-type').value;
    const targetUid = document.getElementById('admin-notif-target-uid').value.trim();
    const category = document.getElementById('admin-notif-category').value;
    const title = document.getElementById('admin-notif-title').value.trim();
    const body = document.getElementById('admin-notif-body').value.trim();

    if (!title || !body) {
        showNotification("Atención", "Por favor completa el título y el cuerpo del mensaje.", "warning");
        return;
    }

    if (type === 'user' && !targetUid) {
        showNotification("Atención", "Ingresa el UID del cliente destinatario.", "warning");
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

        showNotification("¡Enviado!", "El anuncio fue publicado en la bandeja de entrada.", "success");
        document.getElementById('admin-notif-title').value = '';
        document.getElementById('admin-notif-body').value = '';
        if (document.getElementById('admin-notif-target-uid')) document.getElementById('admin-notif-target-uid').value = '';
    } catch (e) {
        console.error("Error al enviar notificación:", e);
        showNotification("Error", "No se pudo guardar la notificación.", "error");
    }
};

// Autocompletar plantillas de notificación de manera automática
window.fillNotifTemplate = function(type) {
    const categorySelect = document.getElementById('admin-notif-category');
    const titleInput = document.getElementById('admin-notif-title');
    const bodyInput = document.getElementById('admin-notif-body');

    if (!categorySelect || !titleInput || !bodyInput) return;

    if (type === 'success') {
        categorySelect.value = 'success';
        titleInput.value = '¡Recarga Exitosa y Acreditada!';
        bodyInput.value = 'Tu pago ha sido verificado correctamente y los diamantes/fondos ya fueron enviados a tu ID de jugador. ¡Gracias por confiar en ZenithRecargas!';
    } else if (type === 'failed') {
        categorySelect.value = 'failed';
        titleInput.value = 'Recarga No Exitosa / Comprobante Inválido';
        bodyInput.value = 'Lo sentimos, tu comprobante no pudo ser confirmado o los datos ingresados son incorrectos. Por favor, contáctanos por soporte.';
    } else if (type === 'update') {
        categorySelect.value = 'update';
        titleInput.value = 'Actualización del Sistema';
        bodyInput.value = 'Hemos implementado mejoras en nuestra plataforma para brindarte un servicio más rápido y seguro.';
    }

    showNotification("Plantilla Cargada", "Los campos se han completado automáticamente.", "info");
};