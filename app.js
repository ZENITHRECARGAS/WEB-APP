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
let lastVerifiedNickname = '';
let unsubscribeOrders = null;
let unsubscribeTopBuyers = null;

// ==========================================
// TONO DE NOTIFICACIÓN CIBERNÉTICO (AUDIO SFX)
// ==========================================
function playCyberNotificationSound() {
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); 
        audio.volume = 0.7;
        audio.play().catch(e => console.log("Audio bloqueado por políticas del navegador:", e));
    } catch (err) {
        console.error("No se pudo reproducir el sonido de notificación:", err);
    }
}

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    if (initialToken) {
        signInWithCustomToken(auth, initialToken).catch(() => {});
    }

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateAuthUI(user);
        if (user && !user.isAnonymous) {
            saveUserProfileInFirestore(user);
            loadUserOrders();
            loadLiveChatMessages();
            loadUserWallet(user.uid);
            requestUserNotificationPermission();
            listenUserOrderUpdates(user.uid);
            checkSubscriptionExpirations(user.uid);
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
        const userSnap = await getDoc(userRef);
        
        let profileData = {
            email: user.email,
            displayName: user.displayName || user.email,
            photoURL: user.photoURL || '',
            lastLogin: new Date().toISOString()
        };

        if (!userSnap.exists()) {
            profileData.saldo = 0.00;
            profileData.city = localStorage.getItem("zenith_user_city") || "Sabanilla";
            profileData.profileCompleted = false;
        }

        await setDoc(userRef, profileData, { merge: true });

        if (userSnap.exists() && userSnap.data().profileCompleted) {
            if (userSnap.data().city) {
                localStorage.setItem("zenith_user_city", userSnap.data().city);
                const citySelector = document.getElementById('user-city-selector');
                if (citySelector) citySelector.value = userSnap.data().city;
            }
        } else {
            setTimeout(() => {
                const onboardModal = document.getElementById('onboarding-modal');
                if (onboardModal) onboardModal.classList.remove('hidden');
            }, 800);
        }
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
                        <button onclick="showReceiptModal('${tx.id}', '${dateStr}', '${tx.type}', '${tx.bank || 'Banco Guayaquil'}', ${tx.amount || 0})" class="px-3 py-1.5 rounded-lg bg-cyber-dark border border-cyber-border text-cyan-400 hover:bg-cyan-500 hover:text-black transition-all">
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
    const bank = bankSelect ? bankSelect.value : 'Banco Guayaquil';

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
// MÓDULO DE SUSCRIPCIONES Y VENCIMIENTOS
// ==========================================
let selectedSubName = '';
let selectedSubBasePrice = 0;
let selectedSubDurationType = 'Mes';

window.openSubModal = function(name, basePrice, durationConfig) {
    selectedSubName = name;
    selectedSubBasePrice = basePrice;
    selectedSubDurationType = durationConfig || 'Mes';

    const titleEl = document.getElementById('sub-modal-title');
    if (titleEl) titleEl.innerText = `Comprar ${name}`;
    
    const durationInput = document.getElementById('sub-duration');
    if (durationInput) {
        durationInput.value = selectedSubDurationType;
        durationInput.readOnly = false;
        durationInput.style.opacity = '1';
    }

    calculateSubTotal();
    
    const modal = document.getElementById('sub-checkout-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
};

window.closeSubModal = function() {
    document.getElementById('sub-checkout-modal').classList.add('hidden');
};

window.calculateSubTotal = function() {
    const durationInput = document.getElementById('sub-duration').value.trim();
    let multiplier = 1;

    let parsedVal = parseFloat(durationInput);
    if (!isNaN(parsedVal)) {
        if (durationInput.toLowerCase().includes(' día') || durationInput.toLowerCase().includes('dias')) {
            multiplier = parsedVal / 30;
        } else if (durationInput.toLowerCase().includes(' año')) {
            multiplier = parsedVal * 12;
        } else {
            multiplier = parsedVal;
        }
    }

    let total = selectedSubBasePrice * multiplier;
    document.getElementById('sub-total-price').innerText = `$${Math.max(selectedSubBasePrice, total).toFixed(2)}`;
};

window.processSubscriptionPurchase = async function() {
    if (!currentUser) {
        showNotification("Inicia Sesión", "Debes ingresar con tu cuenta de Google para comprar.", "warning");
        openAuthModal();
        return;
    }

    const email = document.getElementById('sub-email').value.trim();
    const phone = document.getElementById('sub-phone').value.trim();
    const duration = document.getElementById('sub-duration').value.trim();
    const totalPrice = parseFloat(document.getElementById('sub-total-price').innerText.replace('$', ''));

    if (!email || !phone || !duration) {
        showNotification("Atención", "Por favor completa todos los campos requeridos.", "warning");
        return;
    }

    const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    let currentSaldo = userSnap.exists() ? (userSnap.data().saldo || 0) : 0;

    if (currentSaldo < totalPrice) {
        showNotification("Saldo Insuficiente", "No tienes suficiente saldo en tu billetera. Recarga saldo e intenta de nuevo.", "error");
        return;
    }

    try {
        let newSaldo = currentSaldo - totalPrice;
        await setDoc(userRef, { saldo: newSaldo }, { merge: true });

        const walletCol = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'wallet_transactions');
        await addDoc(walletCol, {
            type: "RETIRO",
            amount: totalPrice,
            bank: `Suscripción ${selectedSubName} (${duration})`,
            status: "COMPLETADO",
            timestamp: new Date().toISOString()
        });

        const ordersCol = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'orders');
        const newOrder = await addDoc(ordersCol, {
            game: 'Suscripción',
            product: `${selectedSubName} (${duration})`,
            price: totalPrice,
            paymentMethod: 'Saldo Billetera',
            subEmail: email,
            subPhone: phone,
            subDuration: duration,
            status: 'Recargando',
            userEmail: currentUser.email,
            expiryNotified: false,
            timestamp: new Date().toISOString()
        });

        const chatCol = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'chat_messages');
        const autoMsg = `¡Hola Soporte! Acabo de comprar la suscripción de *${selectedSubName}* por *${duration}* ($${totalPrice.toFixed(2)}).\n\nMis datos:\n📧 Correo: ${email}\n📱 Teléfono: ${phone}\n🆔 Nº de Orden: ${newOrder.id}`;
        
        await addDoc(chatCol, {
            sender: 'user',
            userEmail: currentUser.email,
            text: autoMsg,
            image: null,
            timestamp: new Date().toISOString()
        });

        closeSubModal();
        showNotification("¡Compra Exitosa!", "Tu compra se realizó correctamente. Revisa el chat de soporte.", "success");
        switchTab('support');
    } catch (e) {
        console.error(e);
        showNotification("Error", "Ocurrió un inconveniente al procesar tu compra.", "error");
    }
};

function checkSubscriptionExpirations(userId) {
    if (!db || !userId) return;

    const ordersCol = collection(db, 'artifacts', appId, 'users', userId, 'orders');
    
    getDocs(ordersCol).then((snapshot) => {
        const now = new Date();

        snapshot.forEach(docSnap => {
            const ord = docSnap.data();
            
            if (ord.game === 'Suscripción' && ord.timestamp && (ord.status === 'Recargando' || ord.status === 'Verificada' || ord.status === 'Completada')) {
                const startDate = new Date(ord.timestamp);
                let addDays = 30;
                const durStr = String(ord.subDuration || '').toLowerCase();
                
                if (durStr.includes('días') || durStr.includes(' dias')) {
                    addDays = parseInt(durStr) || 7;
                } else if (durStr.includes('año')) {
                    addDays = 365;
                } else {
                    let m = parseFloat(durStr) || 1;
                    addDays = m * 30;
                }

                const expirationDate = new Date(startDate);
                expirationDate.setDate(expirationDate.getDate() + addDays);

                const diffTime = expirationDate - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 2 && diffDays > 0) {
                    const notifCol = collection(db, 'artifacts', appId, 'notifications');
                    
                    if (!ord.expiryNotified) {
                        addDoc(notifCol, {
                            target: userId,
                            category: 'update',
                            title: '⏰ ¡Tu Suscripción casi vence!',
                            body: `Tu suscripción de ${ord.product} vencerá en ${diffDays} día(s). Renuévalo pronto para no perder acceso.`,
                            timestamp: new Date().toISOString()
                        });

                        updateDoc(docSnap.ref, { expiryNotified: true });
                    }
                }
            }
        });
    }).catch(err => console.error("Error verificando vencimientos:", err));
}

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
            lastVerifiedNickname = playerName;
            const playerLevel = foundPlayer.level ? `(Nivel ${foundPlayer.level})` : '';
            
            document.getElementById('verified-nickname').innerText = `${playerName} ${playerLevel}`;
            showNotification("¡Jugador Encontrado!", `Verificado: ${playerName}`, "success");
        } else {
            lastVerifiedNickname = '';
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
        const userCity = localStorage.getItem("zenith_user_city") || "Sabanilla";
        return await addDoc(ordersCol, { 
            ...orderData, 
            city: userCity,
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
                HOLA ESTIMADO USUARIO ESTE CHAT ES PARA COMPRA OR QUEJA DEL USUARIO GRACIA POR PREFERINOS.
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

// ==========================================
// CATÁLOGO DINÁMICO DESDE FIRESTORE
// ==========================================
const catalogData = {
    freefire: { 
        name: "FREE FIRE", 
        icon: "fa-fire-flame-curved", 
        color: "text-orange-400", 
        notice: "Solo necesito tu ID de jugador. Llega en minutos.", 
        items: [
            { id: "ff_1", name: "110 Diamantes", price: 0.90, bonus: "+10% Bonus" },
            { id: "ff_2", name: "341 Diamantes", price: 2.70, bonus: "+10% Bonus" },
            { id: "ff_3", name: "520 Diamantes", price: 4.50, bonus: "+10% Bonus" },
            { id: "ff_4", name: "1060 Diamantes", price: 9.00, bonus: "+10% Bonus" }
        ] 
    },
    roblox: { 
        name: "ROBLOX", 
        icon: "fa-cube", 
        color: "text-red-400", 
        notice: "Entrega mediante correo electrónico.", 
        items: [
            { id: "rbx_1", name: "Robux 400", price: 5.00 },
            { id: "rbx_2", name: "Robux 800", price: 10.00 }
        ] 
    },
    mobilelegends: { 
        name: "MOBILE LEGENDS", 
        icon: "fa-shield-sword", 
        color: "text-blue-400", 
        notice: "Acreditación con ID de jugador y Región.", 
        items: [
            { id: "ml_1", name: "86 Diamantes", price: 1.80 },
            { id: "ml_2", name: "172 Diamantes", price: 3.50 }
        ] 
    },
    codm: { 
        name: "CALL OF DUTY MOBILE", 
        icon: "fa-crosshairs", 
        color: "text-emerald-400", 
        notice: "UID de Activision.", 
        items: [
            { id: "cod_1", name: "80 CP", price: 1.00 },
            { id: "cod_2", name: "420 CP", price: 5.00 }
        ] 
    },
    pubg: { 
        name: "PUBG MOBILE", 
        icon: "fa-plane", 
        color: "text-amber-400", 
        notice: "Recarga rápida con ID numérico.", 
        items: [
            { id: "pubg_1", name: "60 UC", price: 0.99 },
            { id: "pubg_2", name: "325 UC", price: 4.99 }
        ] 
    },
    subscriptions: { 
        name: "SUSCRIPCIONES", 
        icon: "fa-tv", 
        color: "text-purple-400", 
        notice: "Cuentas oficiales de streaming y entretenimiento.", 
        items: [
            { id: "sub_1", name: "Netflix Cuenta Completa", price: 3.50, duration: "Mes" },
            { id: "sub_2", name: "Spotify Premium", price: 2.00, duration: "Mes" }
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
            if (docSnap.exists() && docSnap.data().items && docSnap.data().items.length > 0) {
                catalogData[key].items = docSnap.data().items;
            }

            if (activeGameKey === key) {
                renderCatalog(key);
            }
            if (key === 'subscriptions') {
                renderSubscriptionsTab();
            }
        }, (error) => {
            console.warn(`Usando catálogo local de respaldo para ${key}:`, error);
        });
    });
}

function renderSubscriptionsTab() {
    const subContainer = document.getElementById('subscriptions-container') || document.querySelector('#tab-subscriptions .grid');
    if (!subContainer) return;

    const subItems = catalogData.subscriptions.items || [];

    if (subItems.length === 0) {
        subContainer.innerHTML = `<div class="col-span-full p-8 text-center text-gray-500 bg-cyber-card rounded-2xl border border-cyber-border">No hay suscripciones disponibles por el momento.</div>`;
        return;
    }

    let html = '';
    subItems.forEach(item => {
        const isAgotado = item.status === 'agotado';
        const badgeAgotado = isAgotado ? `<span class="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold uppercase tracking-wider">Agotado</span>` : '';
        const durationLabel = item.duration ? `/${item.duration}` : '/Mes';
        const clickAttr = isAgotado ? '' : `onclick="openSubModal('${item.name}', ${item.price}, '${item.duration || 'Mes'}')"`;

        html += `
            <div class="bg-cyber-card border border-cyber-border rounded-2xl p-5 hover:border-cyber-neonCyan transition-all flex flex-col justify-between space-y-4">
                <div class="flex items-center justify-between">
                    <h4 class="font-bold text-white text-base">${item.name}</h4>
                    ${badgeAgotado}
                </div>
                <div class="flex items-center justify-between pt-3 border-t border-cyber-border">
                    <span class="font-orbitron font-bold text-xl text-cyber-neonCyan">$${item.price.toFixed(2)} <span class="text-xs text-gray-400 font-normal">${durationLabel}</span></span>
                    ${isAgotado 
                        ? `<button disabled class="px-4 py-2 rounded-xl bg-gray-800 text-gray-500 font-bold text-xs cursor-not-allowed">Agotado</button>`
                        : `<button ${clickAttr} class="px-4 py-2 rounded-xl bg-cyber-neonCyan text-black font-bold text-xs hover:opacity-90 transition-all">COMPRAR</button>`
                    }
                </div>
            </div>
        `;
    });
    subContainer.innerHTML = html;
}

window.switchTab = function(tabId) {
    ['catalog', 'wallet', 'history', 'support', 'subscriptions'].forEach(t => {
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
    if (tabId === 'subscriptions') renderSubscriptionsTab();
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
    if (!container || !game) return;

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

    if (game.items.length === 0) {
        html += `<div class="col-span-full p-8 text-center text-gray-500">No hay productos disponibles actualmente en esta categoría.</div>`;
    } else {
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
    }
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

    let identityDetails = `ID ${primaryValue}`;
    if (selectedProduct.gameKey === 'mobilelegends') {
        const regionInput = document.getElementById('ml-region-input');
        const regionVal = regionInput ? regionInput.value.trim() : '';
        if (!regionVal || regionVal.length !== 4) {
            showNotification("Atención", "Ingresa una región válida de 4 dígitos.", "warning");
            return;
        }
        identityDetails = `ID ${primaryValue} (${regionVal})`;
    } else if (selectedProduct.gameKey === 'roblox') {
        identityDetails = `Correo: ${primaryValue}`;
    } else if (selectedProduct.gameKey === 'codm') {
        if (primaryValue.length < 19) {
            showNotification("Atención", "El UID de CODM debe tener entre 19 y 20 números.", "warning");
            return;
        }
        identityDetails = `UID: ${primaryValue}`;
    }

    const userId = auth.currentUser.uid;
    const productPrice = selectedProduct.price;

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
                playerId: primaryValue,
                playerDetails: identityDetails,
                playerNickname: lastVerifiedNickname || '',
                paymentMethod: 'Saldo Billetera',
                userEmail: auth.currentUser.email,
                status: 'Recargando'
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

    const order = {
        game: selectedProduct.gameName,
        product: selectedProduct.name,
        price: productPrice,
        playerId: primaryValue,
        playerDetails: identityDetails,
        playerNickname: lastVerifiedNickname || '',
        paymentMethod: selectedPayment,
        userEmail: auth.currentUser.email,
        status: 'Pendiente'
    };

    if (window.saveOrderToFirestore) await window.saveOrderToFirestore(order);
    closeCheckoutModal();
    showNotification("¡Orden Generada!", "Redirigiendo al chat de soporte...", "success");

    setTimeout(() => {
        switchTab('support');
    }, 1000);
};

// ==========================================
// RENDERIZADO EN TIEMPO REAL DE ÓRDENES
// ==========================================
async function loadUserOrders() {
    const container = document.getElementById('orders-list-container');
    if (!container || !db || !auth.currentUser) return;

    container.innerHTML = `<div class="p-8 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin text-xl text-cyber-neonCyan"></i></div>`;

    if (unsubscribeOrders) {
        unsubscribeOrders();
    }

    const userId = auth.currentUser.uid;
    const ordersCol = collection(db, 'artifacts', appId, 'users', userId, 'orders');

    unsubscribeOrders = onSnapshot(ordersCol, (snapshot) => {
        let orders = [];
        snapshot.forEach(docSnap => orders.push({ id: docSnap.id, ...docSnap.data() }));

        if (orders.length === 0) {
            container.innerHTML = `<div class="bg-cyber-card p-8 rounded-3xl border border-cyber-border text-center"><p class="text-xs text-gray-400">No tienes órdenes recientes.</p></div>`;
            return;
        }

        orders.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        let html = '';
        orders.forEach(ord => {
            const st = (ord.status || '').toLowerCase();
            const pay = (ord.paymentMethod || '').toLowerCase();
            const isWallet = pay.includes('saldo') || pay.includes('billetera');

            let step = 1; 
            if (st === 'exitoso' || st === 'completada' || st === 'verificada') {
                step = 4;
            } else if (st === 'recargando') {
                step = 3;
            } else if (st === 'pendiente' || st === 'en verificación') {
                step = isWallet ? 3 : 2;
            }

            const activeStepBg = "bg-orange-500 text-black border-orange-500 font-bold";
            const completedStepBg = "bg-orange-500 text-black border-orange-500";
            const inactiveStepBg = "bg-cyber-dark text-gray-500 border-cyber-border";

            const step1Class = step >= 1 ? completedStepBg : inactiveStepBg;
            const step2Class = step >= 2 ? (step > 2 ? completedStepBg : activeStepBg) : inactiveStepBg;
            const step3Class = step >= 3 ? (step > 3 ? completedStepBg : activeStepBg) : inactiveStepBg;
            const step4Class = step >= 4 ? activeStepBg : inactiveStepBg;

            let progressWidth = "0%";
            if (step === 2) progressWidth = "33%";
            if (step === 3) progressWidth = "66%";
            if (step === 4) progressWidth = "100%";

            const nicknameDisplay = ord.playerNickname ? `<span>${ord.playerNickname}</span>` : '';
            const idDisplay = ord.playerId || ord.playerDetails || ord.subEmail || 'ID No especificado';

            html += `
                <div class="bg-cyber-card rounded-2xl border border-cyber-border p-4 sm:p-6 space-y-6 shadow-xl transition-all">
                    
                    <div class="bg-cyber-dark/80 p-3.5 rounded-xl border border-cyber-border flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center text-lg border border-orange-500/30">
                            <i class="fa-solid fa-user-ninja"></i>
                        </div>
                        <div class="truncate">
                            <div class="font-bold text-white text-sm sm:text-base tracking-wide flex items-center space-x-2">
                                ${nicknameDisplay ? `<span class="text-orange-400 font-orbitron">${ord.playerNickname}</span>` : ''}
                            </div>
                            <p class="text-xs text-gray-400 font-mono">ID ${idDisplay}</p>
                        </div>
                    </div>

                    <div class="relative px-2 sm:px-6 pt-2">
                        <div class="absolute top-1/2 left-8 right-8 h-1 bg-cyber-dark -translate-y-1/2 z-0"></div>
                        <div class="absolute top-1/2 left-8 h-1 bg-orange-500 -translate-y-1/2 transition-all duration-500 z-0" style="width: ${progressWidth}"></div>

                        <div class="relative z-10 flex justify-between items-center text-center">
                            <div class="flex flex-col items-center space-y-1.5">
                                <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${step1Class}">
                                    <i class="fa-solid fa-check text-[10px]"></i>
                                </div>
                                <span class="text-[9px] sm:text-[11px] font-bold text-gray-300">Pedido hecho</span>
                            </div>

                            <div class="flex flex-col items-center space-y-1.5">
                                <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${step2Class}">
                                    2
                                </div>
                                <span class="text-[9px] sm:text-[11px] font-bold ${step === 2 ? 'text-orange-400' : 'text-gray-400'}">Revisando el pago</span>
                            </div>

                            <div class="flex flex-col items-center space-y-1.5">
                                <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${step3Class}">
                                    3
                                </div>
                                <span class="text-[9px] sm:text-[11px] font-bold ${step === 3 ? 'text-cyan-400' : 'text-gray-400'}">Pedido realizado</span>
                            </div>

                            <div class="flex flex-col items-center space-y-1.5">
                                <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${step4Class}">
                                    4
                                </div>
                                <span class="text-[9px] sm:text-[11px] font-bold ${step === 4 ? 'text-green-400' : 'text-gray-400'}">Entregado</span>
                            </div>
                        </div>
                    </div>

                    <div class="bg-cyber-dark/40 p-4 rounded-xl border border-cyber-border space-y-2">
                        <div class="flex justify-between items-center">
                            <div>
                                <h4 class="font-bold text-white text-xs sm:text-sm">${ord.product}</h4>
                                <p class="text-[10px] text-gray-400">${ord.game} - ${ord.playerDetails || idDisplay}</p>
                            </div>
                            <span class="font-orbitron font-bold text-orange-400 text-sm sm:text-base">$${(ord.price || 0).toFixed(2)}</span>
                        </div>

                        <div class="flex justify-between items-center pt-2 border-t border-cyber-border/50 text-xs">
                            <span class="text-gray-400 text-[10px]">Método de Pago:</span>
                            <span class="text-white font-semibold text-[10px]">${ord.paymentMethod || 'Saldo Billetera'}</span>
                        </div>
                    </div>

                    <div class="p-3 bg-cyber-dark rounded-xl border border-amber-500/30 text-xs space-y-1">
                        <p class="font-bold ${step === 4 ? 'text-green-400' : (step === 3 ? 'text-cyan-400' : 'text-amber-400')} uppercase text-[10px]">
                            ${step === 4 ? 'Recarga Completada Exitosamente.' : (step === 3 ? 'Recargando... En proceso de acreditación.' : 'Tu comprobante está en la cola de revisión.')}
                        </p>
                        <p class="text-[10px] text-gray-400 leading-relaxed">
                            ${step === 4 ? 'Los diamantes/servicios ya están acreditados en tu cuenta.' : 'Los revisa una persona del equipo. En cuanto quede confirmado te avisamos por las notificaciones.'}
                        </p>
                    </div>

                </div>
            `;
        });
        container.innerHTML = html;
    }, (error) => {
        console.error("Error al escuchar órdenes en tiempo real:", error);
    });
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
    }
};

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
    filterGame('freefire');
    initUserCity();

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

        await deleteDoc(checkRef);

        const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        let currentSaldo = userDoc.exists() ? (userDoc.data().saldo || 0) : 0;

        await setDoc(userRef, { saldo: currentSaldo + amount }, { merge: true });

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

window.requestUserNotificationPermission = function() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
};

window.listenUserOrderUpdates = function(userId) {
    if (!db || !userId) return;

    const notifCol = collection(db, 'artifacts', appId, 'notifications');
    const q = query(notifCol, where('target', '==', userId));

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const notif = change.doc.data();
                
                const notifTime = new Date(notif.timestamp || 0).getTime();
                const now = new Date().getTime();
                if (now - notifTime > 60000) return; 

                playCyberNotificationSound();

                if (notif.category === 'success' && "Notification" in window && Notification.permission === "granted") {
                    new Notification(`🎉 ${notif.title}`, {
                        body: notif.body,
                        icon: "https://cdn-icons-png.flaticon.com/512/190/190411.png"
                    });
                }
            }
        });
    });
};

window.testClientNotification = async function() {
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); 
        audio.volume = 0.8;
        audio.play().catch(e => console.log("Audio bloqueado:", e));
    } catch (err) {
        console.error("Error reproduciendo audio:", err);
    }

    if (typeof showNotification === 'function') {
        showNotification("🚨 NOTIFICACIÓN DE PRUEBA", "¡Tu recarga ha sido procesada con éxito!", "success");
    }

    if (!("Notification" in window)) {
        alert("Tu navegador no soporta notificaciones de sistema.");
        return;
    }

    let permission = Notification.permission;
    if (permission !== "granted" && permission !== "denied") {
        permission = await Notification.requestPermission();
    }

    if (permission === "granted") {
        new Notification("🎉 ZENITH RECARGAS", {
            body: "¡Tus diamantes han sido acreditados correctamente en tu cuenta!",
            icon: "https://cdn-icons-png.flaticon.com/512/190/190411.png"
        });
    } else {
        alert("Debes permitir los permisos de notificación en tu navegador.");
    }
};

// ==========================================
// MÓDULO TOP RECARGADORES VIP POR CIUDAD (LIMPIO Y CORREGIDO)
// ==========================================
window.listenTopBuyers = function(cityName) {
    if (!db) return;
    
    const container = document.getElementById('top-recargadores-container');
    const labelEl = document.getElementById('active-ranking-label');
    if (labelEl) labelEl.innerText = cityName;
    if (!container) return;

    if (unsubscribeTopBuyers) {
        unsubscribeTopBuyers();
    }

    const cleanKey = cityName.trim().replace(/\s+/g, '_');
    const topRef = doc(db, 'artifacts', appId, 'config', `top_ranking_${cleanKey}`);
    
    unsubscribeTopBuyers = onSnapshot(topRef, (docSnap) => {
        if (!docSnap.exists() || !docSnap.data().buyers || docSnap.data().buyers.length === 0) {
            container.innerHTML = `<div class="col-span-full p-4 text-center text-gray-500 text-xs">No hay podio VIP registrado para <strong>${cityName}</strong> todavía.</div>`;
            return;
        }

        const sortedBuyers = docSnap.data().buyers;
        const medals = ["🥇", "🥈", "🥉"];
        const badges = ["VIP DIAMANTE", "VIP ORO", "VIP PLATA"];
        const styles = [
            "border-amber-400/50 text-amber-400 bg-amber-950/20",
            "border-gray-300/50 text-gray-300 bg-gray-900/20",
            "border-amber-700/50 text-amber-600 bg-amber-950/10"
        ];

        let html = '';
        sortedBuyers.forEach((buyer, index) => {
            const verificationBadge = buyer.verified 
                ? `<span class="text-cyan-400 ml-1.5" title="Usuario Verificado VIP"><i class="fa-solid fa-circle-check"></i></span>` 
                : '';

            html += `
                <div class="bg-cyber-dark p-3.5 rounded-2xl border ${styles[index] || 'border-cyber-border text-white'} flex items-center justify-between space-x-3 shadow-md">
                    <div class="flex items-center space-x-3 truncate">
                        <span class="text-2xl">${medals[index] || '🎮'}</span>
                        <div class="truncate">
                            <h4 class="font-bold text-white text-xs sm:text-sm truncate flex items-center">
                                ${buyer.name} ${verificationBadge}
                            </h4>
                            <span class="text-[9px] font-orbitron uppercase font-bold">${badges[index] || 'VIP'}</span>
                        </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <span class="text-[9px] text-gray-400 block uppercase font-semibold">Total</span>
                        <span class="font-orbitron font-black text-cyber-neonGreen text-xs sm:text-sm">$${parseFloat(buyer.total || 0).toFixed(2)}</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }, (error) => {
        console.warn("Error cargando el ranking VIP:", error);
        container.innerHTML = `<div class="col-span-full p-4 text-center text-red-400 text-xs">Error al cargar datos del ranking.</div>`;
    });
};

window.initUserCity = function() {
    const citySelector = document.getElementById('user-city-selector');
    if (!citySelector) return;

    let savedCity = localStorage.getItem("zenith_user_city");
    if (!savedCity) {
        savedCity = "Sabanilla";
        localStorage.setItem("zenith_user_city", savedCity);
    }
    citySelector.value = savedCity;
    window.listenTopBuyers(savedCity);
};

window.changeUserCity = function(city) {
    localStorage.setItem("zenith_user_city", city);
    if (typeof showNotification === 'function') {
        showNotification("Ubicación Actualizada", `Establecido en ${city}, Ecuador.`, "success");
    }
    
    window.listenTopBuyers(city);

    if (auth && auth.currentUser && !auth.currentUser.isAnonymous) {
        const userRef = doc(db, 'artifacts', appId, 'users', auth.currentUser.uid);
        setDoc(userRef, { city: city }, { merge: true }).catch(err => console.log(err));
    }
};