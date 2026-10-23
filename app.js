import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collectionGroup, getDocs, doc, updateDoc, collection, onSnapshot, addDoc, setDoc, getDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
        if (user && !user.isAnonymous) {
            saveUserProfileInFirestore(user);
            loadUserOrders();
            loadLiveChatMessages();
            loadUserWallet(user.uid); 
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
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
            await saveUserProfileInFirestore(result.user);
        }
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

async function saveUserProfileInFirestore(user) {
    if (!user || user.isAnonymous || !db) return;
    try {
        const userRef = doc(db, 'artifacts', appId, 'users', user.uid);
        await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName || user.email,
            photoURL: user.photoURL || '',
            lastLogin: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.error("Error guardando perfil en Firestore:", e);
    }
}

// ==========================================
// MÓDULO DE BILLETERA Y SALDO VIRTUAL
// ==========================================
function loadUserWallet(userId) {
    if (!db) return;

    const userRef = doc(db, 'artifacts', appId, 'users', userId);
    onSnapshot(userRef, (docSnap) => {
        const balanceEl = document.getElementById("userWalletBalance");
        if (!balanceEl) return;
        if (docSnap.exists()) {
            const data = docSnap.data();
            const saldo = data.saldo || 0;
            balanceEl.innerText = `$${saldo.toFixed(2)}`;
        } else {
            balanceEl.innerText = "$0.00";
        }
    });

    const walletCol = collection(db, 'artifacts', appId, 'users', userId, 'wallet_transactions');
    onSnapshot(walletCol, (snapshot) => {
        const tableBody = document.getElementById("walletHistoryTable");
        if (!tableBody) return;

        let transactions = [];
        snapshot.forEach(docSnap => {
            transactions.push({ id: docSnap.id, ...docSnap.data() });
        });

        transactions.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        if (transactions.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-500">No tienes transacciones registradas aún.</td></tr>`;
            return;
        }

        let html = '';
        transactions.forEach(tx => {
            const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : 'Reciente';
            const isDeposit = tx.type === "DEPOSITO";
            const badgeClass = isDeposit ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            const amountClass = isDeposit ? 'text-green-400 font-bold' : 'text-red-400 font-bold';
            const sign = isDeposit ? '+' : '-';

            html += `
                <tr class="border-b border-cyber-border hover:bg-cyber-dark/40 transition-colors">
                    <td class="p-3 text-gray-300">${dateStr}</td>
                    <td class="p-3"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeClass}">${tx.type}</span></td>
                    <td class="p-3 text-gray-300">${tx.bank || 'Transferencia'}</td>
                    <td class="p-3 ${amountClass}">${sign}$${(tx.amount || 0).toFixed(2)}</td>
                    <td class="p-3"><span class="text-cyan-400 font-semibold">${tx.status || 'PENDIENTE'}</span></td>
                    <td class="p-3 text-center">
                        <button onclick="showReceiptModal('${tx.id}', '${dateStr}', '${tx.type}', '${tx.bank || 'Banco Pichincha'}', ${tx.amount || 0})" class="px-3 py-1.5 rounded-lg bg-cyber-dark border border-cyber-border text-cyan-400 hover:bg-cyan-500 hover:text-black transition-all">
                            Ver Factura
                        </button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;
    });
}

window.submitDepositRequest = async function() {
    const amountInput = document.getElementById('deposit-amount-input');
    const bankSelect = document.getElementById('deposit-bank-select');
    const amount = parseFloat(amountInput ? amountInput.value : 0);
    const bank = bankSelect ? bankSelect.value : 'Banco Pichincha';

    if (!amount || amount <= 0) {
        showNotification("Atención", "Ingresa un monto válido para cargar.", "warning");
        return;
    }

    if (!auth.currentUser) {
        showNotification("Atención", "Debes iniciar sesión con Google para solicitar saldo.", "warning");
        return;
    }

    try {
        const userId = auth.currentUser.uid;
        const walletCol = collection(db, 'artifacts', appId, 'users', userId, 'wallet_transactions');
        
        await addDoc(walletCol, {
            type: "DEPOSITO",
            amount: amount,
            bank: bank,
            status: "PENDIENTE",
            timestamp: new Date().toISOString()
        });

        closeDepositModal();
        if (amountInput) amountInput.value = '';
        showNotification("Solicitud Enviada", "Tu comprobante está en revisión por el administrador.", "success");
    } catch (e) {
        console.error("Error al registrar depósito:", e);
        showNotification("Error", "No se pudo registrar la solicitud.", "error");
    }
};

window.showReceiptModal = function(id, date, type, bank, amount) {
    document.getElementById("recNum").innerText = `REC-${id.substring(0, 8).toUpperCase()}`;
    document.getElementById("recDate").innerText = date;
    document.getElementById("recUser").innerText = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : "Usuario Invitado";
    document.getElementById("recDesc").innerText = type === "DEPOSITO" ? "Abono de Saldo a Billetera" : "Retiro de Saldo de Billetera";
    document.getElementById("recMethod").innerText = bank;
    document.getElementById("recTotal").innerText = `$${parseFloat(amount).toFixed(2)}`;

    document.getElementById("receipt-modal").classList.remove("hidden");
};

// ==========================================
// NOTIFICACIONES Y BANDEJA DE ENTRADA
// ==========================================
window.toggleNotificationCenter = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
};

document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('notification-dropdown');
    const bellButton = event.target.closest('button[onclick*="toggleNotificationCenter"]');
    
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!dropdown.contains(event.target) && !bellButton) {
            dropdown.classList.add('hidden');
        }
    }
});

window.markAllNotificationsRead = function() {
    const badge = document.getElementById('unread-notif-count');
    if (badge) badge.classList.add('hidden');
    
    const currentNotifIds = window.activeUserNotifIds || [];
    localStorage.setItem('zenith_read_notifications', JSON.stringify(currentNotifIds));
    
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

        window.activeUserNotifIds = notifs.map(n => n.id);

        const readIds = JSON.parse(localStorage.getItem('zenith_read_notifications') || '[]');
        const unreadCount = notifs.filter(n => !readIds.includes(n.id)).length;

        if (notifs.length === 0) {
            listContainer.innerHTML = `<p class="text-xs text-gray-500 text-center py-4">No tienes notificaciones nuevas.</p>`;
            if (badge) badge.classList.add('hidden');
            return;
        }

        if (badge) {
            if (unreadCount > 0) {
                badge.innerText = unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
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

function updateAuthUI(user) {
    const container = document.getElementById('auth-container');
    if (!container) return;

    if (user && !user.isAnonymous) {
        const displayName = user.displayName || user.email || 'Usuario';
        
        container.innerHTML = `
            <div class="flex items-center space-x-3 bg-cyber-dark border border-cyber-border px-3 py-1.5 rounded-xl">
                <img src="${user.photoURL || 'https://via.placeholder.com/32'}" class="w-7 h-7 rounded-full border border-cyber-neonCyan">
                <span class="text-xs text-white font-medium hidden sm:inline">${displayName}</span>
                <button onclick="logoutUser()" class="text-gray-400 hover:text-red-400 text-xs font-semibold ml-2" title="Salir">
                    <i class="fa-solid fa-power-off"></i>
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
        await addDoc(ordersCol, { 
            ...orderData, 
            userEmail: auth.currentUser ? auth.currentUser.email : 'guest',
            timestamp: new Date().toISOString() 
        });
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
            userEmail: auth.currentUser ? auth.currentUser.email : 'guest',
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
            userEmail: auth.currentUser ? auth.currentUser.email : 'guest',
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
                HOLA ESTIMADO USUARIO ESTE CHAT ES PARA COMPRA O QUEJA DEL USUARIO GRACIA POR PREFERINOS.
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

const catalogData = {
    freefire: {
        name: "FREE FIRE",
        icon: "fa-fire-flame-curved",
        color: "text-orange-400",
        notice: "Solo necesito tu ID de jugador. Llega en minutos.",
        items: [
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
        ]
    },
    roblox: {
        name: "ROBLOX",
        icon: "fa-cube",
        color: "text-red-400",
        notice: "Entrega mediante correo electrónico (Tarjeta de regalo).",
        items: [
            { id: 'rbx-400', name: '400 Robux', price: 4.99, status: 'disponible' },
            { id: 'rbx-800', name: '800 Robux', price: 9.99, status: 'disponible' },
            { id: 'rbx-1700', name: '1700 Robux', price: 19.99, status: 'disponible' }
        ]
    },
    mobilelegends: {
        name: "MOBILE LEGENDS",
        icon: "fa-shield-sword",
        color: "text-blue-400",
        notice: "Acreditación con ID de jugador y Región (4 dígitos).",
        items: [
            { id: 'ml-110', name: '110 Diamonds', price: 1.99, status: 'disponible' },
            { id: 'ml-257', name: '257 Diamonds', price: 4.49, status: 'disponible' },
            { id: 'ml-565', name: '565 Diamonds', price: 9.49, status: 'disponible' }
        ]
    },
    codm: {
        name: "CALL OF DUTY MOBILE",
        icon: "fa-crosshairs",
        color: "text-emerald-400",
        notice: "UID de Activision (19 a 20 números).",
        items: [
            { id: 'cod-80', name: '80 CP', price: 0.99, status: 'disponible' },
            { id: 'cod-420', name: '420 CP', price: 4.99, status: 'disponible' },
            { id: 'cod-880', name: '880 CP', price: 9.99, status: 'disponible' }
        ]
    },
    pubg: {
        name: "PUBG MOBILE",
        icon: "fa-plane",
        color: "text-amber-400",
        notice: "Recarga rápida con ID numérico.",
        items: [
            { id: 'pubg-60', name: '60 UC', price: 0.99, status: 'disponible' },
            { id: 'pubg-325', name: '325 UC', price: 4.99, status: 'disponible' },
            { id: 'pubg-660', name: '660 UC', price: 9.99, status: 'disponible' }
        ]
    }
};

let activeGameKey = 'freefire';
let selectedProduct = null;
let selectedPayment = 'whatsapp';

window.switchTab = function(tabId) {
    ['catalog', 'wallet', 'history', 'support'].forEach(t => {
        const section = document.getElementById(`tab-${t}`);
        if (section) section.classList.add('hidden');
        const btn = document.getElementById(`nav-btn-${t}`);
        if (btn) btn.className = "text-gray-400 hover:text-white pb-1 transition-all";
    });
    
    const activeSection = document.getElementById(`tab-${tabId}`);
    if (activeSection) activeSection.classList.remove('hidden');
    
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
    const selectedBtn = document.querySelector(`[data-game="${gameKey}"]`);
    if (selectedBtn) selectedBtn.className = "game-filter-btn group p-4 rounded-2xl bg-cyber-card border-2 border-cyber-neonCyan shadow-neon-cyan flex flex-col items-center justify-center space-y-2 transition-all";
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
        const isAgotado = item.status === 'agotado';
        const badgeBonus = item.bonus ? `<span class="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-cyber-neonPurple border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider">${item.bonus}</span>` : '';
        const badgeAgotado = isAgotado ? `<span class="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold uppercase tracking-wider">Agotado</span>` : '';
        
        const cardStyle = isAgotado 
            ? "p-5 rounded-2xl bg-cyber-dark/50 border border-red-500/30 opacity-60 cursor-not-allowed flex flex-col justify-between space-y-4" 
            : "group p-5 rounded-2xl bg-cyber-dark border border-cyber-border hover:border-cyber-neonCyan hover:shadow-neon-cyan cursor-pointer transition-all flex flex-col justify-between space-y-4";

        const btnAction = isAgotado
            ? `<button disabled class="px-4 py-2 rounded-xl bg-gray-800 text-gray-500 font-bold text-xs cursor-not-allowed">Agotado</button>`
            : `<button class="px-4 py-2 rounded-xl bg-cyber-card border border-cyber-border group-hover:bg-cyber-neonCyan group-hover:text-black font-bold text-xs transition-all">Comprar</button>`;

        const clickAttr = isAgotado ? '' : `onclick="openCheckoutModal('${gameKey}', '${item.id}')"`;

        html += `
            <div ${clickAttr} class="${cardStyle}">
                <div class="flex items-start justify-between">
                    <div class="space-y-1">
                        <h4 class="font-bold text-white text-base ${isAgotado ? '' : 'group-hover:text-cyber-neonCyan'} transition-colors">${item.name}</h4>
                        <p class="text-xs text-gray-400">Recarga por ID / Datos</p>
                    </div>
                    <div class="flex flex-col items-end space-y-1">
                        ${badgeAgotado}
                        ${badgeBonus}
                    </div>
                </div>
                <div class="flex items-center justify-between pt-3 border-t border-cyber-border/60">
                    <span class="font-orbitron font-black text-xl text-white">$${item.price.toFixed(2)}</span>
                    ${btnAction}
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

    if (item.status === 'agotado') {
        showNotification("Agotado", "Este producto no se encuentra disponible temporalmente.", "warning");
        return;
    }

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
    ['saldo', 'whatsapp', 'paypal', 'transfer'].forEach(m => {
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

    if (!auth.currentUser) {
        showNotification("Atención", "Debes iniciar sesión con Google para realizar una compra.", "warning");
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

    const userId = auth.currentUser.uid;
    const productPrice = selectedProduct.price;

    // PAGO CON SALDO DE BILLETERA
    if (selectedPayment === 'saldo') {
        try {
            const userRef = doc(db, 'artifacts', appId, 'users', userId);
            const userDoc = await getDoc(userRef);
            
            let currentSaldo = 0;
            if (userDoc.exists()) {
                currentSaldo = userDoc.data().saldo || 0;
            }

            if (currentSaldo < productPrice) {
                showNotification("Saldo Insuficiente", `Tienes $${currentSaldo.toFixed(2)} y el producto cuesta $${productPrice.toFixed(2)}. Carga saldo a tu billetera.`, "error");
                return;
            }

            let newSaldo = currentSaldo - productPrice;
            await setDoc(userRef, { saldo: newSaldo }, { merge: true });

            const walletCol = collection(db, 'artifacts', appId, 'users', userId, 'wallet_transactions');
            await addDoc(walletCol, {
                type: "RETIRO",
                amount: productPrice,
                bank: `Compra de ${selectedProduct.name} (${selectedProduct.gameName})`,
                status: "COMPLETADO",
                timestamp: new Date().toISOString()
            });

            const order = {
                game: selectedProduct.gameName,
                product: selectedProduct.name,
                price: productPrice,
                playerId: identityDetails,
                paymentMethod: 'Saldo Billetera',
                userEmail: auth.currentUser.email,
                status: 'Verificada'
            };

            await window.saveOrderToFirestore(order);
            closeCheckoutModal();
            showNotification("¡Compra Exitosa!", `Se descontaron $${productPrice.toFixed(2)} de tu billetera.`, "success");

            setTimeout(() => {
                switchTab('history');
            }, 1000);
            return;

        } catch (e) {
            console.error("Error al procesar pago con saldo:", e);
            showNotification("Error", "No se pudo procesar el pago con saldo.", "error");
            return;
        }
    }

    // PAGO POR OTROS MÉTODOS
    const order = {
        game: selectedProduct.gameName,
        product: selectedProduct.name,
        price: productPrice,
        playerId: identityDetails,
        paymentMethod: selectedPayment,
        userEmail: auth.currentUser.email,
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

window.openDepositModal = function() { document.getElementById('deposit-modal').classList.remove('hidden'); }
window.closeDepositModal = function() { document.getElementById('deposit-modal').classList.add('hidden'); }
window.openWithdrawModal = function() { document.getElementById('withdraw-modal').classList.remove('hidden'); }
window.closeWithdrawModal = function() { document.getElementById('withdraw-modal').classList.add('hidden'); }
window.closeReceiptModal = function() { document.getElementById('receipt-modal').classList.add('hidden'); }

window.openCheckModal = function() { document.getElementById('check-modal').classList.remove('hidden'); }
window.closeCheckModal = function() { 
    document.getElementById('check-modal').classList.add('hidden'); 
    resetCheckForm();
}

function showNotification(title, msg, type = 'success') {
    const box = document.getElementById('notification-box');
    if (!box) return;
    document.getElementById('notif-title').innerText = title;
    document.getElementById('notif-msg').innerText = msg;
    box.classList.remove('translate-y-32', 'opacity-0');
    setTimeout(() => box.classList.add('translate-y-32', 'opacity-0'), 3500);
}

// ==========================================
// RESTRICCIÓN GEOGRÁFICA (SOLO ECUADOR)
// ==========================================
async function checkUserCountry() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        if (data.country_code && data.country_code !== 'EC') {
            showCountryNotAvailableModal();
        }
    } catch (e) {
        console.warn("No se pudo verificar la ubicación geográfica:", e);
    }
}

function showCountryNotAvailableModal() {
    const overlay = document.getElementById('country-restriction-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

// Actualizar información dinámica según el banco seleccionado en depósitos
window.updateDepositBankInfo = function() {
    const bankSelect = document.getElementById('deposit-bank-select');
    if (!bankSelect) return;

    const bank = bankSelect.value;
    const amount = parseFloat(document.getElementById('deposit-amount-input').value) || 0;
    const detailsContainer = document.getElementById('deposit-bank-details');

    if (!detailsContainer) return;

    if (bank === 'guayaquil') {
        detailsContainer.innerHTML = `
            <div class="text-xs text-gray-300 space-y-1">
                <p class="font-bold text-cyber-neonCyan uppercase font-orbitron">BANCO GUAYAQUIL</p>
                <p><span class="text-gray-400">NUMERO DE CUENTA:</span> <strong class="text-white font-mono">#0061185776</strong></p>
                <p><span class="text-gray-400">TIPO DE CUENTA:</span> <strong class="text-white">AHORRO</strong></p>
                <p><span class="text-gray-400">NOMBRE:</span> <strong class="text-white">Jeremy Del Rosario</strong></p>
                <p><span class="text-gray-400">Monto:</span> <strong class="text-cyber-neonGreen font-bold">$${amount.toFixed(2)} USD</strong></p>
            </div>
        `;
    } else {
        detailsContainer.innerHTML = `
            <div class="text-xs text-red-400 font-bold p-2 text-center bg-red-950/30 rounded-xl border border-red-500/30">
                <i class="fa-solid fa-circle-xmark mr-1"></i> BANCO PICHINCHA: NO DISPONIBLE EN ESTE MOMENTO.
            </div>
        `;
    }
};

// Solicitar Retiro con Validaciones Estrictas
window.submitWithdrawRequest = async function() {
    const consent = document.getElementById('withdraw-consent-check')?.checked;
    const amount = parseFloat(document.getElementById('withdraw-amount-input')?.value) || 0;
    const bank = document.getElementById('withdraw-bank-select')?.value;
    const pin = document.getElementById('withdraw-security-pin')?.value.trim();
    const accountNum = document.getElementById('withdraw-account-number')?.value.trim();
    const idCard = document.getElementById('withdraw-idcard')?.value.trim();
    const fullName = document.getElementById('withdraw-fullname')?.value.trim();

    if (!consent) {
        showNotification("Atención", "Debes aceptar el aviso con tu consentimiento para continuar.", "warning");
        return;
    }

    if (amount < 1 || amount > 100) {
        showNotification("Límite no válido", "El monto mínimo es de $1.00 y el máximo es de $100.00 por día.", "warning");
        return;
    }

    if (!pin || !accountNum || !idCard || !fullName) {
        showNotification("Campos Incompletos", "Por favor completa todos los datos solicitados.", "warning");
        return;
    }

    if (!currentUser) {
        showNotification("Atención", "Debes iniciar sesión con Google.", "warning");
        return;
    }

    try {
        const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid);
        const userSnap = await getDoc(userDocRef);

        if (!userSnap.exists() || userSnap.data().withdrawPin !== pin) {
            showNotification("Clave Incorrecta", "La clave de seguridad de retiro no es válida.", "error");
            return;
        }

        await addDoc(collection(db, 'artifacts', appId, 'wallet_requests'), {
            uid: currentUser.uid,
            userEmail: currentUser.email,
            type: 'withdraw',
            amount: amount,
            bank: bank,
            accountNumber: accountNum,
            idCard: idCard,
            fullName: fullName,
            status: 'enviado',
            createdAt: new Date().toISOString()
        });

        closeWithdrawModal();
        showNotification("Solicitud Enviada", "Tu retiro ha ingresado a fase de verificación.", "success");
    } catch (e) {
        console.error("Error al procesar retiro:", e);
        showNotification("Error", "No se pudo enviar la solicitud de retiro.", "error");
    }
};

window.saveUserOnboardingData = async function() {
    const phone = document.getElementById('reg-phone-number').value.trim();
    const securityCode = document.getElementById('reg-security-code').value.trim();
    const pin = document.getElementById('reg-withdraw-pin').value.trim();

    if (!phone || !securityCode || !pin) {
        showNotification("Atención", "Por favor completa todos los campos de seguridad.", "warning");
        return;
    }

    try {
        const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid);
        await setDoc(userDocRef, {
            phone: phone,
            securityCode: securityCode,
            withdrawPin: pin,
            profileCompleted: true
        }, { merge: true });

        document.getElementById('onboarding-modal').classList.add('hidden');
        showNotification("¡Registro Completado!", "Tus datos de seguridad se han guardado correctamente.", "success");
    } catch (e) {
        console.error("Error al guardar datos:", e);
        showNotification("Error", "No se pudieron guardar tus datos.", "error");
    }
};

// ==========================================
// CANJE SEGURO DE CHEQUE POR ID / DEPÓSITO
// ==========================================
function resetCheckForm() {
    const depInput = document.getElementById('checkDepositNumber');
    const hourInput = document.getElementById('checkIssuerHour');
    const amountInput = document.getElementById('checkAmount');
    if (depInput) depInput.value = '';
    if (hourInput) hourInput.value = '';
    if (amountInput) amountInput.value = '$0.00';
}

document.addEventListener('DOMContentLoaded', () => {
    checkUserCountry();
    loadCatalogFromFirestore();

    const depositInput = document.getElementById('checkDepositNumber');
    const hourInput = document.getElementById('checkIssuerHour');
    const amountInput = document.getElementById('checkAmount');

    if (hourInput) {
        hourInput.addEventListener('input', (e) => {
            let raw = e.target.value.replace(/\D/g, '');
            if (raw.length > 4) raw = raw.substring(0, 4);
            if (raw.length >= 3) {
                e.target.value = `${raw.substring(0, 2)}:${raw.substring(2)}`;
            } else {
                e.target.value = raw;
            }
        });
    }

    if (depositInput) {
        depositInput.addEventListener('input', async (e) => {
            let code = e.target.value.replace(/\D/g, '');
            e.target.value = code;

            if (code.length < 14) {
                if (amountInput) amountInput.value = "$0.00";
                return;
            }

            if (!db) return;
            try {
                const checkRef = doc(db, 'artifacts', appId, 'admin_checks', code);
                const checkSnap = await getDoc(checkRef);

                if (checkSnap.exists()) {
                    const data = checkSnap.data();
                    if (amountInput) {
                        amountInput.value = `$${(data.amount || 0).toFixed(2)}`;
                    }
                } else {
                    if (amountInput) amountInput.value = "$0.00";
                }
            } catch (err) {
                console.error("Error buscando cheque:", err);
                if (amountInput) amountInput.value = "$0.00";
            }
        });
    }
});

window.canjearChequePorId = async function() {
    const depositNum = document.getElementById('checkDepositNumber').value.trim();
    const hourVal = document.getElementById('checkIssuerHour').value.trim();
    const amountInput = document.getElementById('checkAmount');

    if (!depositNum || depositNum.length < 14) {
        showNotification("Atención", "Ingresa un número de depósito válido (14 a 15 dígitos).", "warning");
        return;
    }

    if (!hourVal) {
        showNotification("Atención", "Ingresa la hora del emisor (Ej. 14:00).", "warning");
        return;
    }

    if (!db) {
        showNotification("Error", "La base de datos no está inicializada.", "error");
        return;
    }

    if (!currentUser || currentUser.isAnonymous) {
        showNotification("Atención", "Debes iniciar sesión con tu cuenta real para canjear un cheque.", "warning");
        return;
    }

    try {
        const checkRef = doc(db, 'artifacts', appId, 'admin_checks', depositNum);
        const checkSnap = await getDoc(checkRef);

        if (!checkSnap.exists()) {
            showNotification("Código Inválido", "Este código de cheque ya fue utilizado o no existe.", "error");
            if (amountInput) amountInput.value = "$0.00";
            return;
        }

        const checkData = checkSnap.data();

        if (checkData.hour && checkData.hour !== hourVal) {
            showNotification("Hora Errónea", "La hora ingresada no coincide con el registro del cheque.", "error");
            return;
        }

        const amount = checkData.amount || 0;

        // Eliminar el cheque de Firestore de forma permanente para evitar reutilización
        await deleteDoc(checkRef);

        // Acreditar saldo
        const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        let currentSaldo = userDoc.exists() ? (userDoc.data().saldo || 0) : 0;

        await setDoc(userRef, { saldo: currentSaldo + amount }, { merge: true });

        // Registrar movimiento
        const walletCol = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'wallet_transactions');
        await addDoc(walletCol, {
            type: "DEPOSITO",
            amount: amount,
            bank: `Canje de Cheque (${depositNum})`,
            status: "COMPLETADO",
            timestamp: new Date().toISOString()
        });

        showNotification("¡Cheque Canjeado!", `+$${amount.toFixed(2)} acreditados. El código ha expirado permanentemente.`, "success");

        setTimeout(() => {
            closeCheckModal();
        }, 1500);

    } catch (err) {
        console.error("Error detallado al canjear cheque:", err);
        showNotification("Error de Servidor", err.message || "No se pudo procesar el cheque.", "error");
    }
};