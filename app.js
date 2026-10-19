import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const appId = typeof __app_id !== 'undefined' ? __app_id : 'poor-point';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyCUiQaampVsnUryYS9BamEQ761vFJPDyp4",
    authDomain: "poor-point.firebaseapp.com",
    projectId: "poor-point",
    storageBucket: "poor-point.firebasestorage.app",
    messagingSenderId: "159292993963",
    appId: "1:159292993963:web:7566a4ac37a15ee94122ee"
};

let app, db, auth;
let currentUser = null;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    if (initialToken) {
        signInWithCustomToken(auth, initialToken).catch(() => signInAnonymously(auth));
    } else {
        signInAnonymously(auth).catch(e => console.log("Anon auth fallback", e));
    }

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateAuthUI(user);
        if (user) {
            loadUserOrders();
            loadLiveChatMessages();
        }
    });
} catch (e) {
    console.warn("Firebase init error:", e);
}

window.dbInstance = () => db;
window.authInstance = () => auth;

window.loginWithGoogle = async () => {
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        closeAuthModal();
        showNotification("¡Bienvenido!", "Sesión iniciada correctamente.", "success");
    } catch (err) {
        showNotification("Error", err.message, "error");
    }
};

window.logoutUser = async () => {
    await signOut(auth);
    showNotification("Sesión Cerrada", "Has salido de tu cuenta.", "info");
};

// ==========================================
// NOTIFICACIONES Y BANDEJA DE ENTRADA
// ==========================================
window.toggleNotificationCenter = function() {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
};

window.markAllNotificationsRead = function() {
    const badge = document.getElementById('unread-notif-count');
    if (badge) badge.classList.add('hidden');
    showNotification("Bandeja", "Notificaciones marcadas como leídas.", "info");
};

function listenNotifications(user) {
    const listContainer = document.getElementById('notifications-list');
    const badge = document.getElementById('unread-notif-count');
    if (!listContainer || !db || !user) return;

    const notifCol = collection(db, 'artifacts', appId, 'notifications');
    
    onSnapshot(notifCol, (snapshot) => {
        let notifs = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.target === 'global' || data.target === user.uid) {
                notifs.push({ id: docSnap.id, ...data });
            }
        });

        notifs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        if (notifs.length === 0) {
            listContainer.innerHTML = `<p class="text-xs text-gray-500 text-center py-4">No tienes notificaciones nuevas.</p>`;
            if (badge) badge.classList.add('hidden');
            return;
        }

        if (badge) {
            badge.innerText = notifs.length;
            badge.classList.remove('hidden');
        }

        let html = '';
        notifs.forEach(n => {
            let iconClass = 'fa-bell text-cyber-neonCyan';
            let bgStyle = 'bg-cyber-dark border-cyber-border';

            if (n.category === 'success') {
                iconClass = 'fa-circle-check text-green-400';
                bgStyle = 'bg-green-950/20 border-green-500/30';
            } else if (n.category === 'failed') {
                iconClass = 'fa-circle-xmark text-red-400';
                bgStyle = 'bg-red-950/20 border-red-500/30';
            } else if (n.category === 'update') {
                iconClass = 'fa-arrows-rotate text-amber-400';
                bgStyle = 'bg-amber-950/20 border-amber-500/30';
            }

            const timeStr = n.timestamp ? new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            html += `
                <div class="p-3 rounded-xl border ${bgStyle} space-y-1">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-white text-xs flex items-center space-x-1.5">
                            <i class="fa-solid ${iconClass}"></i>
                            <span>${n.title}</span>
                        </span>
                        <span class="text-[9px] text-gray-500">${timeStr}</span>
                    </div>
                    <p class="text-xs text-gray-300 pl-5">${n.body}</p>
                </div>
            `;
        });
        listContainer.innerHTML = html;
    });
}

// GESTIÓN DE UI DE AUTENTICACIÓN (Única declaración)
function updateAuthUI(user) {
    const container = document.getElementById('auth-container');
    if (!container) return;

    if (user && !user.isAnonymous) {
        container.innerHTML = `
            <div class="flex items-center space-x-2">
                <img src="${user.photoURL || 'https://via.placeholder.com/32'}" class="w-8 h-8 rounded-full border border-cyber-neonCyan">
                <button onclick="logoutUser()" class="px-3 py-1.5 rounded-xl bg-cyber-dark border border-cyber-border text-gray-300 hover:text-white text-xs font-semibold">
                    Salir
                </button>
            </div>
        `;
        listenNotifications(user);
    } else {
        container.innerHTML = `
            <button onclick="openAuthModal()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-cyber-neonCyan to-blue-600 text-black font-bold text-xs sm:text-sm shadow-neon-cyan hover:opacity-90 transition-all flex items-center space-x-2">
                <i class="fa-solid fa-user-shield"></i>
                <span>Ingresar</span>
            </button>
        `;
    }
}

// Firestore ID Verification
window.verifyPlayerId = async function() {
    const mainInput = document.getElementById('player-id-input');
    const playerId = mainInput ? mainInput.value.trim() : '';
    
    if (!playerId) {
        showNotification("Atención", "Ingresa un ID de jugador válido.", "warning");
        return;
    }

    const verifyBtn = document.getElementById('verify-btn');
    if (verifyBtn) verifyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        let foundPlayer = null;
        const db = window.dbInstance();
        
        if (db) {
            const docRef = doc(db, 'players_db', playerId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                foundPlayer = docSnap.data();
            } else {
                const q = query(collection(db, 'players_db'), where("playerId", "==", playerId));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((d) => { foundPlayer = d.data(); });
            }
        }

        if (verifyBtn) verifyBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Verificar</span>';
        const resultBox = document.getElementById('player-verification-result');
        if (resultBox) resultBox.classList.remove('hidden');

        if (foundPlayer) {
            const playerName = foundPlayer.name || foundPlayer.nickname || 'Jugador Registrado';
            const playerLevel = foundPlayer.level ? `(Nivel ${foundPlayer.level})` : '';
            
            document.getElementById('verified-nickname').innerText = `${playerName} ${playerLevel}`;
            showNotification("¡Jugador Encontrado!", `Verificado: ${playerName}`, "success");
        } else {
            document.getElementById('verified-nickname').innerText = "ID no registrado en el sistema";
            showNotification("Error", "Este ID no se encuentra registrado en nuestra base de datos.", "error");
        }
    } catch (e) {
        console.error("Error verificando ID:", e);
        if (verifyBtn) verifyBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Verificar</span>';
        const resultBox = document.getElementById('player-verification-result');
        if (resultBox) resultBox.classList.remove('hidden');
        document.getElementById('verified-nickname').innerText = "Error de conexión con la Base de Datos";
        showNotification("Error", "No se pudo verificar el ID.", "error");
    }
};

window.saveOrderToFirestore = async (orderData) => {
    if (!db) return;
    try {
        const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous-user';
        const ordersCol = collection(db, 'artifacts', appId, 'users', userId, 'orders');
        await addDoc(ordersCol, { ...orderData, timestamp: new Date().toISOString() });
    } catch (e) {
        console.error("Error saving order:", e);
    }
};

window.fetchUserOrdersFromFirestore = async () => {
    if (!db) return [];
    try {
        const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous-user';
        const ordersCol = collection(db, 'artifacts', appId, 'users', userId, 'orders');
        const snapshot = await getDocs(ordersCol);
        let list = [];
        snapshot.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() }));
        return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (e) {
        return [];
    }
};

// Subir imagen a Cloudinary y validar con OCR (Tesseract)
window.uploadImageToCloudinary = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    showNotification("Procesando", "Analizando comprobante...", "warning");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "music_unsigned");

    try {
        const response = await fetch("https://api.cloudinary.com/v1_1/dahwsdlhq/image/upload", {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        
        if (!data.secure_url) {
            throw new Error("No se pudo obtener la URL de Cloudinary");
        }

        const imageUrl = data.secure_url;

        await sendChatMessageWithImage(imageUrl);

        const { data: { text } } = await Tesseract.recognize(imageUrl, 'spa');
        const cleanText = text.toLowerCase();

        const validKeywords = [
            'banco guayaquil', 'guayaquil',
            'banco pichincha', 'pichincha',
            'produbanco', 'promerica',
            'paypal', 'transferencia exitosa', 'pago exitoso'
        ];

        const isValidBank = validKeywords.some(keyword => cleanText.includes(keyword));

        if (isValidBank) {
            await sendBotReply("Comprobante Validado. Espere Mientras Le Respondemos.");
            showNotification("¡Éxito!", "Comprobante validado correctamente.", "success");
        } else {
            await sendBotReply("Imagen no reconocida.");
            showNotification("Atención", "Imagen no reconocida como comprobante válido.", "warning");
        }

    } catch (err) {
        console.error("Error al procesar comprobante:", err);
        showNotification("Error", "No se pudo procesar la imagen.", "error");
    }
};

async function sendChatMessageWithImage(imageUrl) {
    const userId = auth && auth.currentUser ? auth.currentUser.uid : 'anonymous-user';
    if (!db) return;
    try {
        const chatCol = collection(db, 'artifacts', appId, 'users', userId, 'chat_messages');
        await addDoc(chatCol, {
            sender: 'user',
            text: 'Comprobante de pago adjunto:',
            image: imageUrl,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("Error sending image message:", e);
    }
}

async function sendBotReply(replyText) {
    const userId = auth && auth.currentUser ? auth.currentUser.uid : 'anonymous-user';
    if (!db) return;

    try {
        const chatCol = collection(db, 'artifacts', appId, 'users', userId, 'chat_messages');
        await addDoc(chatCol, {
            sender: 'bot',
            text: replyText,
            image: null,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("Error guardando respuesta del bot:", e);
    }
}

window.sendChatMessage = async function() {
    const input = document.getElementById('chat-message-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    const userId = auth && auth.currentUser ? auth.currentUser.uid : 'anonymous-user';
    if (!db) return;

    try {
        const chatCol = collection(db, 'artifacts', appId, 'users', userId, 'chat_messages');
        await addDoc(chatCol, {
            sender: 'user',
            text: text,
            image: null,
            timestamp: new Date().toISOString()
        });
        if (input) input.value = '';
    } catch (e) {
        console.error("Error sending message:", e);
    }
};

window.handleChatKeyPress = function(e) {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
};

function loadLiveChatMessages() {
    const container = document.getElementById('live-chat-messages');
    if (!db || !container) return;

    const userId = auth && auth.currentUser ? auth.currentUser.uid : 'anonymous-user';
    const chatCol = collection(db, 'artifacts', appId, 'users', userId, 'chat_messages');

    onSnapshot(chatCol, (snapshot) => {
        let messages = [];
        snapshot.forEach(docSnap => messages.push({ id: docSnap.id, ...docSnap.data() }));
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        let html = `
            <div class="self-start bg-cyber-card border border-cyber-border p-3 rounded-2xl max-w-[80%] text-xs text-gray-300">
                <span class="font-bold text-cyber-neonCyan block mb-1">BOT</span>
                Por favor, envíe su factura de la transferencia o PayPal.
            </div>
        `;

        messages.forEach(msg => {
            const isUser = msg.sender === 'user';
            let senderLabel = 'ADMIN';
            let bgClass = 'self-start bg-cyber-card border-cyber-border text-gray-300';

            if (isUser) {
                senderLabel = 'Tú';
                bgClass = 'self-end bg-cyan-950/40 border-cyan-500/40 text-white';
            } else if (msg.sender === 'bot') {
                senderLabel = 'BOT';
                bgClass = 'self-start bg-blue-950/40 border-blue-500/40 text-white';
            } else if (msg.sender === 'support') {
                senderLabel = 'ADMIN';
                bgClass = 'self-start bg-pink-950/40 border-pink-500/40 text-white';
            }

            let imgHtml = msg.image ? `<a href="${msg.image}" target="_blank"><img src="${msg.image}" class="mt-2 rounded-xl max-h-40 object-cover border border-cyber-border"></a>` : '';
            
            html += `
                <div class="${bgClass} border p-3 rounded-2xl max-w-[80%] text-xs space-y-1">
                    <span class="font-bold ${isUser ? 'text-cyber-neonCyan' : (msg.sender === 'bot' ? 'text-blue-400' : 'text-cyber-neonPink')} block">${senderLabel}</span>
                    <p>${msg.text}</p>
                    ${imgHtml}
                </div>
            `;
        });
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    });
}

// Catalog Data & Firestore Price Synchronization
const catalogData = {
    freefire: {
        name: "FREE FIRE",
        icon: "fa-fire-flame-curved",
        color: "text-orange-400",
        notice: "Solo necesito tu ID de jugador. Llega en minutos.",
        items: [
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
        ]
    },
    roblox: {
        name: "ROBLOX",
        icon: "fa-cube",
        color: "text-red-400",
        notice: "Entrega mediante correo electrónico (Tarjeta de regalo).",
        items: [
            { id: 'rbx-400', name: '400 Robux', price: 4.99 },
            { id: 'rbx-800', name: '800 Robux', price: 9.99 },
            { id: 'rbx-1700', name: '1700 Robux', price: 19.99 }
        ]
    },
    mobilelegends: {
        name: "MOBILE LEGENDS",
        icon: "fa-shield-sword",
        color: "text-blue-400",
        notice: "Acreditación con ID de jugador y Región (4 dígitos).",
        items: [
            { id: 'ml-110', name: '110 Diamonds', price: 1.99 },
            { id: 'ml-257', name: '257 Diamonds', price: 4.49 },
            { id: 'ml-565', name: '565 Diamonds', price: 9.49 }
        ]
    },
    codm: {
        name: "CALL OF DUTY MOBILE",
        icon: "fa-crosshairs",
        color: "text-emerald-400",
        notice: "UID de Activision (19 a 20 números).",
        items: [
            { id: 'cod-80', name: '80 CP', price: 0.99 },
            { id: 'cod-420', name: '420 CP', price: 4.99 },
            { id: 'cod-880', name: '880 CP', price: 9.99 }
        ]
    },
    pubg: {
        name: "PUBG MOBILE",
        icon: "fa-plane",
        color: "text-amber-400",
        notice: "Recarga rápida con ID numérico.",
        items: [
            { id: 'pubg-60', name: '60 UC', price: 0.99 },
            { id: 'pubg-325', name: '325 UC', price: 4.99 },
            { id: 'pubg-660', name: '660 UC', price: 9.99 }
        ]
    }
};

let activeGameKey = 'freefire';
let selectedProduct = null;
let selectedPayment = 'whatsapp';

function loadCatalogFromFirestore() {
    if (!db) return;
    Object.keys(catalogData).forEach(key => {
        const docRef = doc(db, 'artifacts', appId, 'config', `prices_${key}`);
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().items) {
                catalogData[key].items = docSnap.data().items;
                if (activeGameKey === key) {
                    renderCatalog(key);
                }
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadCatalogFromFirestore();
    renderCatalog(activeGameKey);
});

window.switchTab = function(tabId) {
    ['catalog', 'history', 'support'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        const btn = document.getElementById(`nav-btn-${t}`);
        if (btn) btn.className = "text-gray-400 hover:text-white pb-1 transition-all";
    });
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    const activeBtn = document.getElementById(`nav-btn-${tabId}`);
    if (activeBtn) activeBtn.className = "text-cyber-neonCyan border-b-2 border-cyber-neonCyan pb-1 transition-all";
    if (tabId === 'history') loadUserOrders();
    if (tabId === 'support') loadLiveChatMessages();
}

window.filterGame = function(gameKey) {
    activeGameKey = gameKey;
    document.querySelectorAll('.game-filter-btn').forEach(btn => {
        btn.className = "game-filter-btn group p-4 rounded-2xl bg-cyber-card border border-cyber-border hover:border-cyber-neonPurple flex flex-col items-center justify-center space-y-2 transition-all";
    });
    document.querySelector(`[data-game="${gameKey}"]`).className = "game-filter-btn group p-4 rounded-2xl bg-cyber-card border-2 border-cyber-neonCyan shadow-neon-cyan flex flex-col items-center justify-center space-y-2 transition-all";
    renderCatalog(gameKey);
}

function renderCatalog(gameKey) {
    const game = catalogData[gameKey];
    const container = document.getElementById('products-container');
    if (!container) return;

    let html = `
        <div class="bg-cyber-card p-6 rounded-3xl border border-cyber-border space-y-6">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-cyber-border pb-6">
                <div class="flex items-center space-x-4">
                    <div class="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyber-neonCyan flex items-center justify-center text-2xl ${game.color}">
                        <i class="fa-solid ${game.icon}"></i>
                    </div>
                    <div>
                        <h3 class="font-orbitron font-bold text-2xl text-white">${game.name}</h3>
                        <p class="text-xs text-cyber-neonCyan mt-1"><i class="fa-solid fa-circle-info mr-1.5"></i>${game.notice}</p>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    `;

    game.items.forEach(item => {
        const badge = item.bonus ? `<span class="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-cyber-neonPurple border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider">${item.bonus}</span>` : '';
        html += `
            <div onclick="openCheckoutModal('${gameKey}', '${item.id}')" class="group p-5 rounded-2xl bg-cyber-dark border border-cyber-border hover:border-cyber-neonCyan hover:shadow-neon-cyan cursor-pointer transition-all flex flex-col justify-between space-y-4">
                <div class="flex items-start justify-between">
                    <div class="space-y-1">
                        <h4 class="font-bold text-white text-base group-hover:text-cyber-neonCyan transition-colors">${item.name}</h4>
                        <p class="text-xs text-gray-400">Recarga por ID / Datos</p>
                    </div>
                    ${badge}
                </div>
                <div class="flex items-center justify-between pt-3 border-t border-cyber-border/60">
                    <span class="font-orbitron font-black text-xl text-white">$${item.price.toFixed(2)}</span>
                    <button class="px-4 py-2 rounded-xl bg-cyber-card border border-cyber-border group-hover:bg-cyber-neonCyan group-hover:text-black font-bold text-xs transition-all">Comprar</button>
                </div>
            </div>
        `;
    });
    html += `</div></div>`;
    container.innerHTML = html;
}

window.openCheckoutModal = function(gameKey, itemId) {
    const game = catalogData[gameKey];
    const item = game.items.find(i => i.id === itemId);
    if (!item) return;

    selectedProduct = { ...item, gameName: game.name, gameKey };
    document.getElementById('modal-title').innerText = `Recarga ${game.name}`;
    document.getElementById('checkout-product-name').innerText = item.name;
    document.getElementById('checkout-product-price').innerText = `$${item.price.toFixed(2)}`;
    document.getElementById('player-verification-result').classList.add('hidden');

    const wrapper = document.getElementById('input-fields-wrapper');
    const label = document.getElementById('main-input-label');

    if (gameKey === 'mobilelegends') {
        label.innerText = "ID de Jugador y Región";
        wrapper.innerHTML = `
            <input type="text" id="player-id-input" placeholder="ID Jugador" class="w-2/3 bg-cyber-dark border border-cyber-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyber-neonCyan">
            <input type="text" id="ml-region-input" placeholder="Región (4 dígitos)" maxlength="4" class="w-1/3 bg-cyber-dark border border-cyber-border rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-cyber-neonCyan">
        `;
    } else if (gameKey === 'roblox') {
        label.innerText = "Correo Electrónico (Envío Tarjeta)";
        wrapper.innerHTML = `
            <input type="email" id="player-id-input" placeholder="tucorreo@gmail.com" class="flex-grow bg-cyber-dark border border-cyber-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyber-neonCyan">
        `;
    } else if (gameKey === 'codm') {
        label.innerText = "UID de Activision (19 a 20 números)";
        wrapper.innerHTML = `
            <input type="text" id="player-id-input" placeholder="Ej. 6812345678901234567" maxlength="20" class="flex-grow bg-cyber-dark border border-cyber-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyber-neonCyan">
        `;
    } else {
        label.innerText = "ID de Jugador / UID";
        wrapper.innerHTML = `
            <input type="text" id="player-id-input" placeholder="Ej. 12790483964" class="flex-grow bg-cyber-dark border border-cyber-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyber-neonCyan">
            <button onclick="verifyPlayerId()" id="verify-btn" class="px-5 py-3 rounded-xl bg-cyber-neonCyan text-black font-bold text-xs uppercase tracking-wider hover:opacity-90 flex items-center space-x-1">
                <i class="fa-solid fa-check"></i>
                <span>Verificar</span>
            </button>
        `;
    }

    document.getElementById('checkout-modal').classList.remove('hidden');
}

window.closeCheckoutModal = function() {
    document.getElementById('checkout-modal').classList.add('hidden');
}

window.selectPaymentMethod = function(method) {
    selectedPayment = method;
    ['whatsapp', 'paypal', 'transfer'].forEach(m => {
        const btn = document.getElementById(`pay-${m}`);
        if(btn) {
            btn.className = m === method ? 
                "p-3 rounded-xl bg-cyber-dark border-2 border-cyber-neonCyan text-center text-xs font-bold text-white shadow-neon-cyan transition-all" : 
                "p-3 rounded-xl bg-cyber-dark border border-cyber-border text-center text-xs font-bold text-gray-400 transition-all";
        }
    });
}

window.processOrder = async function() {
    const mainInput = document.getElementById('player-id-input');
    const primaryValue = mainInput ? mainInput.value.trim() : '';
    
    if (!primaryValue) {
        showNotification("Atención", "Por favor completa el campo requerido.", "warning");
        return;
    }

    let identityDetails = `ID: ${primaryValue}`;
    if (selectedProduct.gameKey === 'mobilelegends') {
        const regionInput = document.getElementById('ml-region-input');
        const regionVal = regionInput ? regionInput.value.trim() : '';
        if (!regionVal || regionVal.length !== 4) {
            showNotification("Atención", "Ingresa una región válida de 4 dígitos.", "warning");
            return;
        }
        identityDetails = `ID: ${primaryValue} (Región: ${regionVal})`;
    } else if (selectedProduct.gameKey === 'roblox') {
        identityDetails = `Correo Tarjeta: ${primaryValue}`;
    } else if (selectedProduct.gameKey === 'codm') {
        if (primaryValue.length < 19) {
            showNotification("Atención", "El UID de CODM debe tener entre 19 y 20 números.", "warning");
            return;
        }
        identityDetails = `UID CODM: ${primaryValue}`;
    }

    const order = {
        game: selectedProduct.gameName,
        product: selectedProduct.name,
        price: selectedProduct.price,
        playerId: identityDetails,
        paymentMethod: selectedPayment,
        status: 'Pendiente de Confirmación'
    };

    if (window.saveOrderToFirestore) await window.saveOrderToFirestore(order);
    closeCheckoutModal();
    showNotification("¡Orden Generada!", "Redirigiendo al chat de soporte...", "success");

    setTimeout(() => {
        switchTab('support');
    }, 1000);
}

async function loadUserOrders() {
    const container = document.getElementById('orders-list-container');
    if (!container) return;
    container.innerHTML = `<div class="p-8 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin text-xl text-cyber-neonCyan"></i></div>`;
    let orders = window.fetchUserOrdersFromFirestore ? await window.fetchUserOrdersFromFirestore() : [];

    if (orders.length === 0) {
        container.innerHTML = `<div class="bg-cyber-card p-8 rounded-3xl border border-cyber-border text-center"><p class="text-xs text-gray-400">No tienes órdenes recientes.</p></div>`;
        return;
    }

    let html = '';
    orders.forEach(ord => {
        html += `
            <div class="bg-cyber-card p-5 rounded-2xl border border-cyber-border flex items-center justify-between">
                <div>
                    <span class="text-[10px] text-cyber-neonCyan font-bold">${ord.game}</span>
                    <h4 class="font-bold text-white text-sm">${ord.product}</h4>
                    <p class="text-xs text-gray-400">${ord.playerId} | Pago: ${ord.paymentMethod}</p>
                </div>
                <div class="text-right">
                    <span class="font-bold text-white text-sm">$${ord.price.toFixed(2)}</span>
                    <span class="block text-[10px] text-amber-400">${ord.status}</span>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.openAuthModal = function() { document.getElementById('auth-modal').classList.remove('hidden'); }
window.closeAuthModal = function() { document.getElementById('auth-modal').classList.add('hidden'); }
window.toggleMobileMenu = function() { document.getElementById('mobile-menu').classList.toggle('hidden'); }

function showNotification(title, msg, type = 'success') {
    const box = document.getElementById('notification-box');
    if (!box) return;
    document.getElementById('notif-title').innerText = title;
    document.getElementById('notif-msg').innerText = msg;
    box.classList.remove('translate-y-32', 'opacity-0');
    setTimeout(() => box.classList.add('translate-y-32', 'opacity-0'), 3500);
}