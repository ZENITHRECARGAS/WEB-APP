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
            loadZWOCardFromFirebase(user.uid);
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

function calculateAccountAge(registerDateStr) {
    if (!registerDateStr) return "N/A";
    
    const regDate = new Date(registerDateStr);
    const now = new Date();
    
    let years = now.getFullYear() - regDate.getFullYear();
    let months = now.getMonth() - regDate.getMonth();
    let days = now.getDate() - regDate.getDate();

    if (days < 0) {
        months--;
    }
    if (months < 0) {
        years--;
    }

    if (years < 0) years = 0;

    return `${years} ${years === 1 ? 'Año' : 'Años'}`;
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
            const playerLevel = foundPlayer.level || 1;
            const playerAvatar = foundPlayer.avatar || foundPlayer.photoUrl || 'https://via.placeholder.com/80';
            
            const accountAge = calculateAccountAge(foundPlayer.created_at || new Date().toISOString());

            resultBox.innerHTML = `
                <div class="flex items-center space-x-3 bg-cyber-dark/90 p-4 rounded-2xl border border-cyber-neonCyan/50 shadow-neon-cyan transition-all">
                    <img src="${playerAvatar}" class="w-14 h-14 rounded-xl object-cover border-2 border-cyber-neonCyan shadow-lg flex-shrink-0" alt="Avatar">
                    <div class="space-y-1 overflow-hidden">
                        <div class="flex items-center space-x-2">
                            <span class="text-[9px] bg-cyber-neonCyan/20 text-cyber-neonCyan px-2 py-0.5 rounded-full font-mono font-bold border border-cyber-neonCyan/30 uppercase">
                                Nivel ${playerLevel}
                            </span>
                            <span class="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-mono font-bold border border-purple-500/30">
                                <i class="fa-solid fa-clock text-[8px] mr-1"></i>${accountAge}
                            </span>
                        </div>
                        <h4 id="verified-nickname" class="font-bold text-white text-sm truncate">${playerName}</h4>
                        <p class="text-[10px] text-gray-400 font-mono">ID: ${playerId}</p>
                    </div>
                </div>
            `;

            showNotification("¡Jugador Encontrado!", `Verificado: ${playerName} (Nv. ${playerLevel})`, "success");
        } else {
            lastVerifiedNickname = '';
            resultBox.innerHTML = `
                <div class="p-3 bg-cyber-dark/80 rounded-xl border border-red-500/50 text-center">
                    <span id="verified-nickname" class="text-red-400 text-xs font-bold">ID no registrado en el sistema</span>
                </div>
            `;
            showNotification("Error", "Este ID no se encuentra registrado en nuestra base de datos.", "error");
        }
    } catch (e) {
        console.error("Error verificando ID:", e);
        if (verifyBtn) verifyBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Verificar</span>';
        const resultBox = document.getElementById('player-verification-result');
        if (resultBox) resultBox.classList.remove('hidden');
        resultBox.innerHTML = `<span id="verified-nickname" class="text-red-400 text-xs">Error de conexión con la Base de Datos</span>`;
        showNotification("Error", "No se pudo verificar el ID.", "error");
    }
};

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
    
    const container = document.getElementById('products-container');
    if (container) {
        container.innerHTML = `
            <div class="col-span-full bg-cyber-card p-8 rounded-3xl border border-cyber-border text-center space-y-3">
                <i class="fa-solid fa-spinner fa-spin text-2xl text-cyber-neonCyan"></i>
                <p class="text-xs text-gray-400 font-mono">Sincronizando catálogo oficial desde Firestore...</p>
            </div>
        `;
    }

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
            if (activeGameKey === key) {
                renderCatalog(key);
            }
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

// ==========================================
// MÓDULO DE TRANSFERENCIA Y COMISIONES BANCARIAS
// ==========================================

window.selectPaymentMethod = function(method) {
    selectedPayment = method;

    // Actualiza el estilo visual de los botones de pago
    ['saldo', 'whatsapp', 'paypal', 'transfer'].forEach(m => {
        const btn = document.getElementById(`pay-${m}`);
        if(btn) {
            btn.className = m === method ? 
                "p-2.5 rounded-xl bg-cyber-dark border-2 border-cyber-neonCyan text-center text-[10px] sm:text-xs font-bold text-white shadow-neon-cyan transition-all" : 
                "p-2.5 rounded-xl bg-cyber-dark border border-cyber-border text-center text-[10px] sm:text-xs font-bold text-gray-400 transition-all";
        }
    });

    const paypalBtnContainer = document.getElementById('paypal-button-container');
    const paymentContainer = document.getElementById('payment-chat-container');

    // Ocultar elementos específicos por defecto
    if (paypalBtnContainer) paypalBtnContainer.classList.add('hidden');
    if (paymentContainer) paymentContainer.innerHTML = ''; // Limpia el contenedor dinámico de transferencia

    if (method === 'paypal') {
        if (paypalBtnContainer) paypalBtnContainer.classList.remove('hidden');
        
        const paymentSessionId = 'PAY-' + Math.random().toString(36).substring(2, 9).toUpperCase();
        localStorage.setItem('pending_paypal_session', paymentSessionId);

        const currentUrl = window.location.origin + window.location.pathname;
        const productSpecificUrl = (selectedProduct && selectedProduct.paypalUrl) ? selectedProduct.paypalUrl : "https://www.paypal.com/paypalme/tuusuario";
        
        const finalPaypalLink = productSpecificUrl.includes('paypal.com/ncp') || productSpecificUrl.includes('paypal.me') ? 
            productSpecificUrl : 
            `${productSpecificUrl}?return_url=${encodeURIComponent(currentUrl + '?status=success&session=' + paymentSessionId)}`;

        if (paypalBtnContainer) {
            paypalBtnContainer.innerHTML = `
                <div class="space-y-3 p-4 bg-cyber-dark rounded-xl border border-cyber-border text-center">
                    <a href="${finalPaypalLink}" target="_blank" class="w-full py-3 rounded-xl bg-[#0070BA] hover:bg-[#003087] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-lg">
                        <i class="fa-brands fa-paypal text-base"></i>
                        <span>Pagar ${selectedProduct ? selectedProduct.name : 'Producto'} ($${selectedProduct ? selectedProduct.price.toFixed(2) : '0.00'})</span>
                    </a>
                    <p class="text-[10px] text-gray-400">Se abrirá el enlace de pago de este artículo. Al terminar, la página registrará tu orden automáticamente.</p>
                </div>
            `;
        }
    } else if (method === 'transfer') {
        renderTransferPaymentDetails(); // Vuelve a renderizar los campos limpios de transferencia
    } else {
        // Para 'saldo' o 'whatsapp', el contenedor de transferencia se queda limpio y oculto
        if (paymentContainer) {
            paymentContainer.innerHTML = `
                <p class="text-xs text-gray-400 text-center py-2">
                    ${method === 'saldo' ? 'Se debitará el monto directamente de tu saldo disponible en la billetera.' : 'Serás atendido directamente a través de nuestro chat de soporte.'}
                </p>
            `;
        }
    }
};

function renderTransferPaymentDetails() {
    const container = document.getElementById('payment-chat-container');
    if (!container) return;

    const productName = selectedProduct ? selectedProduct.name.toLowerCase() : '';
    
    let basePrice = 0;
    if (selectedProduct) {
        basePrice = selectedProduct.finalDiscountedPrice !== undefined 
            ? selectedProduct.finalDiscountedPrice 
            : selectedProduct.price;
    }

    let commission = 0;
    let descComision = "";

    if (productName.includes('110') || productName.includes('341') || productName.includes('520') || productName.includes('572')) {
        commission = 0.05;
        descComision = "Se cobra comisión de $0.05 para esta recarga.";
    } else if (productName.includes('1060') || productName.includes('1166')) {
        commission = 0.10;
        descComision = "Se cobra comisión de $0.10 para recarga de 1060 / 1166.";
    } else if (productName.includes('2398')) {
        commission = 0.20;
        descComision = "Se cobra comisión de $0.20 para recarga de 2398.";
    } else if (productName.includes('6160')) {
        commission = 0.40;
        descComision = "Se cobra comisión de $0.40 para recarga de 6160.";
    } else if (productName.includes('semanal') || productName.includes('mensual') || productName.includes('tarjeta')) {
        commission = 0.15;
        descComision = "Se cobra comisión de $0.15 para Tarjetas Semanales o Mensuales.";
    } else {
        commission = 0.05;
        descComision = "Comisión de transferencia aplicada.";
    }

    const totalAPagar = (basePrice + commission).toFixed(2);

    container.innerHTML = `
        <div class="space-y-3 text-xs">
            <div class="flex items-center space-x-1.5 text-cyber-neonCyan font-bold">
                <i class="fa-solid fa-building-columns"></i>
                <span>BANCO DISPONIBLE</span>
            </div>

            <div>
                <label class="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Selecciona el Banco</label>
                <select id="transfer-bank-selector" onchange="updateBankDataDisplay()" class="w-full bg-cyber-dark border border-cyber-border rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-cyber-neonCyan cursor-pointer">
                    <option value="guayaquil">BANCO GUAYAQUIL</option>
                    <option value="pichincha">BANCO PICHINCHA</option>
                </select>
            </div>

            <div id="bank-info-box" class="p-3 bg-cyber-dark rounded-xl border border-cyber-border space-y-1.5 text-xs font-mono">
                <!-- Se actualiza dinámicamente -->
            </div>

            <div class="space-y-2 pt-2 border-t border-cyber-border">
                <label class="block text-[10px] text-gray-400 uppercase font-semibold">Nombre y Apellido Completo</label>
                <input type="text" id="transfer-fullname" placeholder="Ej. Juan Pérez" class="w-full bg-cyber-dark border border-cyber-border rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyber-neonCyan">
            </div>

            <div class="space-y-2">
                <label class="block text-[10px] text-gray-400 uppercase font-semibold">Cédula de Identidad</label>
                <input type="text" id="transfer-cedula" placeholder="Ej. 0912345678" maxlength="10" class="w-full bg-cyber-dark border border-cyber-border rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyber-neonCyan">
            </div>

            <div class="space-y-2">
                <label class="block text-[10px] text-gray-400 uppercase font-semibold">Subir Comprobante de Pago</label>
                <input type="file" id="transfer-receipt-file" accept="image/*" class="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-cyber-neonCyan file:text-black hover:file:opacity-90 cursor-pointer">
            </div>

            <div class="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[10px] text-amber-300 font-medium">
                <i class="fa-solid fa-triangle-exclamation mr-1"></i> <strong>AVISO:</strong> ${descComision}
            </div>

            <div class="pt-1 flex justify-between items-center border-t border-cyber-border text-sm font-bold">
                <span class="text-gray-300">TOTAL A PAGAR:</span>
                <span class="text-cyber-neonGreen font-orbitron text-base" id="transfer-total-display">$${totalAPagar}</span>
            </div>
        </div>
    `;

    window.updateBankDataDisplay();
}

window.updateBankDataDisplay = function() {
    const bankSelector = document.getElementById('transfer-bank-selector');
    const bankBox = document.getElementById('bank-info-box');
    
    if (!bankSelector || !bankBox) return;

    const selectedBank = bankSelector.value;

    if (selectedBank === 'guayaquil') {
        bankBox.innerHTML = `
            <p class="font-bold text-cyber-neonCyan uppercase font-orbitron text-[11px]">BANCO GUAYAQUIL</p>
            <p><span class="text-gray-400 font-sans">NOMBRE:</span> <strong class="text-white">Jeremy Del Rosario</strong></p>
            <p><span class="text-gray-400 font-sans">Nº CUENTA:</span> <strong class="text-white font-mono">0061185776</strong></p>
            <p><span class="text-gray-400 font-sans">TIPO:</span> <strong class="text-white">AHORRO</strong></p>
        `;
    } else if (selectedBank === 'pichincha') {
        bankBox.innerHTML = `
            <p class="font-bold text-yellow-400 uppercase font-orbitron text-[11px]">BANCO PICHINCHA</p>
            <p><span class="text-gray-400 font-sans">NOMBRE:</span> <strong class="text-white">Jeremy Del Rosario</strong></p>
            <p><span class="text-gray-400 font-sans">Nº CUENTA:</span> <strong class="text-white font-mono">2205123456</strong></p>
            <p><span class="text-gray-400 font-sans">TIPO:</span> <strong class="text-white">AHORRO</strong></p>
        `;
    }
};

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
    const productPrice = selectedProduct.finalDiscountedPrice !== undefined ? selectedProduct.finalDiscountedPrice : selectedProduct.price;

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

    if (selectedPayment === 'transfer') {
        const fullName = document.getElementById('transfer-fullname')?.value.trim();
        const cedula = document.getElementById('transfer-cedula')?.value.trim();
        const fileInput = document.getElementById('transfer-receipt-file');

        if (!fullName || !cedula) {
            showNotification("Atención", "Por favor ingresa tu nombre y apellido completo y tu cédula.", "warning");
            return;
        }

        if (cedula.length < 10) {
            showNotification("Atención", "Ingresa un número de cédula válido.", "warning");
            return;
        }

        let receiptImageUrl = null;
        if (fileInput && fileInput.files && fileInput.files[0]) {
            receiptImageUrl = URL.createObjectURL(fileInput.files[0]);
        }

        const order = {
            game: selectedProduct.gameName,
            product: selectedProduct.name,
            price: productPrice,
            playerId: primaryValue,
            playerDetails: identityDetails,
            playerNickname: lastVerifiedNickname || '',
            paymentMethod: 'Transferencia Bancaria',
            payerFullName: fullName,
            payerCedula: cedula,
            receiptImage: receiptImageUrl,
            userEmail: auth.currentUser.email,
            status: 'Pendiente'
        };

        const orderId = await window.saveOrderToFirestore(order);

        const chatCol = collection(db, 'artifacts', appId, 'users', userId, 'chat_messages');
        await addDoc(chatCol, {
            sender: 'user',
            userEmail: auth.currentUser.email,
            text: `Hola, adjunto mi pago por Transferencia Bancaria:\n👤 Nombre: ${fullName}\n🆔 Cédula: ${cedula}\n🎮 Producto: ${selectedProduct.name} ($${productPrice.toFixed(2)})\n📋 Nº Orden: ${orderId}`,
            image: receiptImageUrl,
            timestamp: new Date().toISOString()
        });

        closeCheckoutModal();
        showNotification("¡Orden y Comprobante Enviados!", "Redirigiendo al chat de soporte...", "success");

        setTimeout(() => {
            switchTab('support');
        }, 1000);
        return;
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

window.saveOrderToFirestore = async function(orderData) {
    if (!db) {
        showNotification("Error", "Base de datos no disponible.", "error");
        return null;
    }

    try {
        const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
        const ordersCol = collection(db, 'artifacts', appId, 'users', userId, 'orders');
        
        const docRef = await addDoc(ordersCol, {
            ...orderData,
            timestamp: new Date().toISOString()
        });

        console.log("Orden guardada correctamente con ID:", docRef.id);

        if (typeof window.setActivePendingOrder === 'function') {
            window.setActivePendingOrder(docRef.id);
        }

        return docRef.id;
    } catch (e) {
        console.error("Error al guardar la orden en Firestore:", e);
        showNotification("Error", "No se pudo registrar la orden en la base de datos.", "error");
        return null;
    }
};

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

                if (notif.category === 'success') {
                    if (typeof window.showOrderStatusOverlay === 'function') {
                        window.showOrderStatusOverlay('completed', notif.body || "¡Tu recarga ha sido verificada con éxito!");
                    }
                    localStorage.removeItem('zenith_pending_order_id');

                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification(`🎉 ${notif.title}`, {
                            body: notif.body,
                            icon: "https://cdn-icons-png.flaticon.com/512/190/190411.png"
                        });
                    }
                } else if (notif.category === 'failed') {
                    if (typeof window.showOrderStatusOverlay === 'function') {
                        window.showOrderStatusOverlay('rejected', notif.body || "El comprobante o ID no pudo ser validado.");
                    }
                    localStorage.removeItem('zenith_pending_order_id');
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
// MÓDULO TOP RECARGADORES VIP POR CIUDAD
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

// ==========================================
// MÓDULO ONBOARDING COMPLETO DE ECUADOR
// ==========================================
const ecuadorFullLocationData = {
    "Costa": {
        "Guayas": {
            "Pedro Carbo": ["Sabanilla", "Valle de la Virgen", "Pedro Carbo (Centro)"],
            "Guayaquil": ["Tarqui", "Ximena", "Febres Cordero", "Pascuales", "Chongón", "Puná"],
            "Daule": ["Daule (Centro)", "La Aurora", "Limonal", "Juan Bautista Aguirre"],
            "Milagro": ["Milagro (Centro)", "Chobo", "Mariscal Sucre"],
            "Duran": ["El Recreo", "Divino Niño", "Abel Gilbert"],
            "Samborondón": ["La Puntilla", "Samborondón (Centro)", "Tarifa"],
            "Balzar": ["Balzar (Centro)", "San Mateo"],
            "El Triunfo": ["El Triunfo (Centro)"],
            "Naranjal": ["Naranjal (Centro)", "Jesús María"],
            "Playas": ["General Villamil (Playas)", "Data de Villamil"]
        },
        "Manabí": {
            "Portoviejo": ["Portoviejo (Centro)", "Crucita", "Alhajuela", "Calderón"],
            "Manta": ["Manta (Centro)", "Tarqui", "Eloy Alfaro", "San Mateo"],
            "Chone": ["Chone (Centro)", "Ricaurte", "Boyacá"],
            "Montecristi": ["Montecristi (Centro)", "La Pila"],
            "Jipijapa": ["Jipijapa (Centro)", "Puerto Cayo"]
        },
        "El Oro": {
            "Machala": ["Machala (Centro)", "Puerto Bolívar", "El Cambio"],
            "Pasaje": ["Pasaje (Centro)", "Buenavista"],
            "Santa Rosa": ["Santa Rosa (Centro)", "Jambelí"],
            "Huaquillas": ["Huaquillas (Centro)", "Ecuador"]
        },
        "Los Ríos": {
            "Babahoyo": ["Babahoyo (Centro)", "Barreiro", "Caracol", "Puebloviejo"],
            "Quevedo": ["Quevedo (Centro)", "San Camilo", "Venus del Río Quevedo", "Viva Alfaro"],
            "Buena Fe": ["San Jacinto de Buena Fe", "Patricia Pilar"],
            "Vinces": ["Vinces (Centro)", "Antonio Sotomayor"]
        },
        "Esmeraldas": {
            "Esmeraldas": ["Esmeraldas (Centro)", "Vuelta Larga", "5 de Agosto"],
            "Atacames": ["Atacames (Centro)", "Tonsupa", "Súa", "Same"],
            "Quinindé": ["Rosa Zárate", "La Unión", "Cube"]
        },
        "Santa Elena": {
            "Santa Elena": ["Santa Elena (Centro)", "Ballenita", "Manglaralto", "Montañita"],
            "Salinas": ["Salinas (Centro)", "José Luis Tamayo", "Anconcito"],
            "La Libertad": ["La Libertad (Centro)"]
        },
        "Santo Domingo de los Tsáchilas": {
            "Santo Domingo": ["Santo Domingo (Centro)", "Alluriquín", "Luz de América", "Chigpe"]
        }
    },
    "Sierra": {
        "Pichincha": {
            "Quito": ["Iñaquito", "Carcelén", "Quitumbe", "Calderón", "Cumbayá", "Tumbaco", "Cotocollao"],
            "Cayambe": ["Cayambe (Centro)", "Ascázubi", "Cangahua"],
            "Rumiñahui": ["Sangolquí", "Cotogchoa"]
        },
        "Azuay": {
            "Cuenca": ["Cuenca (Centro)", "El Sagrario", "Yanuncay", "Totoracocha", "Baños"],
            "Gualaceo": ["Gualaceo (Centro)", "Daniel Córdova"]
        },
        "Tungurahua": {
            "Ambato": ["Ambato (Centro)", "Atocha", "Huachi Chico", "Ficoa"],
            "Baños": ["Baños de Agua Santa (Centro)", "Lloa", "Río Verde"]
        },
        "Imbabura": {
            "Ibarra": ["Ibarra (Centro)", "Priorato", "San Antonio"],
            "Otavalo": ["Otavalo (Centro)", "San Rafael", "Echeandía"]
        },
        "Loja": {
            "Loja": ["Loja (Centro)", "El Valle", "Sagrario", "Vilcabamba"],
            "Catamayo": ["Catamayo (Centro)", "San José"]
        },
        "Chimborazo": {
            "Riobamba": ["Riobamba (Centro)", "Lizarzaburu", "Maldonado", "Yaruquíes"]
        },
        "Cotopaxi": {
            "Latacunga": ["Latacunga (Centro)", "Eloy Alfaro", "Ignacio Flores"],
            "Pujilí": ["Pujilí (Centro)", "Angamarca"]
        },
        "Carchi": {
            "Tulcán": ["Tulcán (Centro)", "González Suárez", "Julio Andrade"]
        },
        "Cañar": {
            "Azogues": ["Azogues (Centro)", "Cochitancay"],
            "La Troncal": ["La Troncal (Centro)", "Pancho Negro"]
        },
        "Bolívar": {
            "Guaranda": ["Guaranda (Centro)", "Guanujo", "Simiatug"]
        }
    },
    "Oriente": {
        "Pastaza": {
            "Puyo": ["Puyo (Centro)", "Tarqui", "Fátima", "Shell"]
        },
        "Napo": {
            "Tena": ["Tena (Centro)", "Puerto Napo", "Ahuano", "Misahuallí"]
        },
        "Morona Santiago": {
            "Macas": ["Macas (Centro)", "Proaño", "Sevilla Don Bosco"]
        },
        "Sucumbíos": {
            "Lago Agrio": ["Nueva Loja (Centro)", "Dureno", "Santa Cecilia"],
            "Shushufindi": ["Shushufindi (Centro)", "Limoncocha"]
        },
        "Orellana": {
            "Orellana": ["Puerto Francisco de Orellana (El Coca)", "Dayuma", "Inés Arango"]
        },
        "Zamora Chinchipe": {
            "Zamora": ["Zamora (Centro)", "Timbara"],
            "Yantzaza": ["Yantzaza (Centro)", "Chicaña"]
        }
    },
    "Galápagos": {
        "Galápagos": {
            "Santa Cruz": ["Puerto Ayora", "Bellavista", "Santa Rosa"],
            "San Cristóbal": ["Puerto Baquerizo Moreno", "El Progreso"],
            "Isabela": ["Puerto Villamil", "Tomas de Berlanga"]
        }
    }
};

window.updateOnboardProvincesList = function(regionName) {
    const provinceSelect = document.getElementById('onboard-province-select');
    if (!provinceSelect) return;

    const provinces = ecuadorFullLocationData[regionName] ? Object.keys(ecuadorFullLocationData[regionName]) : [];
    let html = '';
    provinces.forEach(prov => {
        html += `<option value="${prov}" class="bg-cyber-dark text-white">${prov}</option>`;
    });
    provinceSelect.innerHTML = html;

    if (provinces.length > 0) {
        window.updateOnboardCantonsList(regionName, provinces[0]);
    }
};

window.updateOnboardCantonsList = function(regionName, provinceName) {
    const cantonSelect = document.getElementById('onboard-canton-select');
    if (!cantonSelect) return;

    const cantons = ecuadorFullLocationData[regionName]?.[provinceName] ? Object.keys(ecuadorFullLocationData[regionName][provinceName]) : [];
    let html = '';
    cantons.forEach(canton => {
        html += `<option value="${canton}" class="bg-cyber-dark text-white">${canton}</option>`;
    });
    cantonSelect.innerHTML = html;

    if (cantons.length > 0) {
        window.updateOnboardSectorsList(regionName, provinceName, cantons[0]);
    }
};

window.updateOnboardSectorsList = function(regionName, provinceName, cantonName) {
    const sectorSelect = document.getElementById('onboard-sector-select');
    if (!sectorSelect) return;

    const sectors = ecuadorFullLocationData[regionName]?.[provinceName]?.[cantonName] || [];
    let html = '';
    sectors.forEach(sec => {
        html += `<option value="${sec}" class="bg-cyber-dark text-white">${sec}</option>`;
    });
    sectorSelect.innerHTML = html;
};

window.saveInitialUserProfile = async function() {
    const regionVal = document.getElementById('onboard-region-select')?.value || 'Costa';
    const provinceVal = document.getElementById('onboard-province-select')?.value || 'Guayas';
    const cantonVal = document.getElementById('onboard-canton-select')?.value || 'Pedro Carbo';
    const sectorVal = document.getElementById('onboard-sector-select')?.value || 'Sabanilla';

    if (!auth || !auth.currentUser) return;

    try {
        const userRef = doc(db, 'artifacts', appId, 'users', auth.currentUser.uid);
        await setDoc(userRef, {
            region: regionVal,
            province: provinceVal,
            canton: cantonVal,
            city: sectorVal,
            profileCompleted: true
        }, { merge: true });

        localStorage.setItem("zenith_user_region", regionVal);
        localStorage.setItem("zenith_user_province", provinceVal);
        localStorage.setItem("zenith_user_canton", cantonVal);
        localStorage.setItem("zenith_user_city", sectorVal);

        const mainCitySelector = document.getElementById('user-city-selector');
        if (mainCitySelector) {
            mainCitySelector.value = sectorVal;
        }

        if (typeof window.listenTopBuyers === 'function') {
            window.listenTopBuyers(sectorVal);
        }

        const onboardModal = document.getElementById('onboarding-modal');
        if (onboardModal) onboardModal.classList.add('hidden');

        showNotification("¡Perfil Configurado!", `Ubicación: ${sectorVal}, ${cantonVal} (${provinceVal}).`, "success");
    } catch (err) {
        console.error("Error guardando perfil inicial:", err);
        showNotification("Error", "No se pudieron guardar tus datos.", "error");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.updateOnboardProvincesList('Costa');
});

window.openLocationModal = function() {
    const modal = document.getElementById('location-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const savedRegion = localStorage.getItem("zenith_user_region") || "Costa";
        const regionSelect = document.getElementById('header-region-select');
        if (regionSelect) regionSelect.value = savedRegion;
        window.updateHeaderProvincesList(savedRegion);
    }
};

window.closeLocationModal = function() {
    const modal = document.getElementById('location-modal');
    if (modal) modal.classList.add('hidden');
};

window.updateHeaderProvincesList = function(regionName) {
    const provinceSelect = document.getElementById('header-province-select');
    if (!provinceSelect) return;

    const provinces = ecuadorFullLocationData[regionName] ? Object.keys(ecuadorFullLocationData[regionName]) : [];
    let html = '';
    provinces.forEach(prov => {
        html += `<option value="${prov}" class="bg-cyber-dark text-white">${prov}</option>`;
    });
    provinceSelect.innerHTML = html;

    if (provinces.length > 0) {
        window.updateHeaderCantonsList(regionName, provinces[0]);
    }
};

window.updateHeaderCantonsList = function(regionName, provinceName) {
    const cantonSelect = document.getElementById('header-canton-select');
    if (!cantonSelect) return;

    const cantons = ecuadorFullLocationData[regionName]?.[provinceName] ? Object.keys(ecuadorFullLocationData[regionName][provinceName]) : [];
    let html = '';
    cantons.forEach(canton => {
        html += `<option value="${canton}" class="bg-cyber-dark text-white">${canton}</option>`;
    });
    cantonSelect.innerHTML = html;

    if (cantons.length > 0) {
        window.updateHeaderSectorsList(regionName, provinceName, cantons[0]);
    }
};

window.updateHeaderSectorsList = function(regionName, provinceName, cantonName) {
    const sectorSelect = document.getElementById('header-sector-select');
    if (!sectorSelect) return;

    const sectors = ecuadorFullLocationData[regionName]?.[provinceName]?.[cantonName] || [];
    let html = '';
    sectors.forEach(sec => {
        html += `<option value="${sec}" class="bg-cyber-dark text-white">${sec}</option>`;
    });
    sectorSelect.innerHTML = html;
};

window.applyHeaderLocationChange = function() {
    const sectorVal = document.getElementById('header-sector-select')?.value || 'Sabanilla';
    const cantonVal = document.getElementById('header-canton-select')?.value || 'Pedro Carbo';
    const provinceVal = document.getElementById('header-province-select')?.value || 'Guayas';
    const regionVal = document.getElementById('header-region-select')?.value || 'Costa';

    localStorage.setItem("zenith_user_city", sectorVal);
    localStorage.setItem("zenith_user_canton", cantonVal);
    localStorage.setItem("zenith_user_province", provinceVal);
    localStorage.setItem("zenith_user_region", regionVal);

    const displayLabel = document.getElementById('current-location-display');
    if (displayLabel) displayLabel.textContent = sectorVal;

    const activeRankingLabel = document.getElementById('active-ranking-label');
    if (activeRankingLabel) activeRankingLabel.textContent = sectorVal;

    if (typeof window.listenTopBuyers === 'function') {
        window.listenTopBuyers(sectorVal);
    }

    closeLocationModal();
    showNotification("Ubicación Actualizada", `Mostrando el ranking VIP de ${sectorVal} (${cantonVal}).`, "success");
};

document.addEventListener("DOMContentLoaded", () => {
    const cookieConsent = localStorage.getItem("zenith_cookie_consent");
    if (!cookieConsent) {
        const banner = document.getElementById("cookie-banner");
        if (banner) banner.classList.remove("hidden");
    }
});

window.handleCookieChoice = function(choice) {
    localStorage.setItem("zenith_cookie_consent", choice);
    const banner = document.getElementById("cookie-banner");
    if (banner) banner.classList.add("hidden");
};

window.checkWebsiteStatus = function() {
    if (!db || typeof doc === 'undefined' || typeof onSnapshot === 'undefined') return;

    const statusRef = doc(db, 'artifacts', appId, 'settings', 'status');
    onSnapshot(statusRef, (docSnap) => {
        const maintenanceScreen = document.getElementById('maintenance-screen');
        if (!maintenanceScreen) return;

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.status === 'off' || data.closed === true) {
                maintenanceScreen.classList.remove('hidden');
                if (data.message) {
                    document.getElementById('maintenance-msg').textContent = data.message;
                }
            } else {
                maintenanceScreen.classList.add('hidden');
            }
        } else {
            maintenanceScreen.classList.add('hidden');
        }
    }, (error) => {
        console.error("Error escuchando estado de la web:", error);
    });
};

async function updateLoaderProgress(percent, message) {
    const statusText = document.getElementById('loader-status-text');
    const progressBar = document.getElementById('loader-progress-bar');
    const percentageText = document.getElementById('loader-percentage');

    if (statusText) statusText.innerText = message;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (percentageText) percentageText.innerText = `${percent}%`;
}

async function hideInitialLoader() {
    const loader = document.getElementById('initial-loader');
    if (loader) {
        loader.classList.add('opacity-0');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('status');
    const returnedSession = urlParams.get('session');
    const savedSession = localStorage.getItem('pending_paypal_session');

    if (paymentStatus === 'success' && returnedSession && returnedSession === savedSession) {
        localStorage.removeItem('pending_paypal_session');
        window.history.replaceState({}, document.title, window.location.pathname);

        showNotification("¡Pago Exitoso Detectado!", "PayPal confirmó tu retorno. Guardando orden...", "success");

        if (db && auth.currentUser) {
            try {
                const ordersCol = collection(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'orders');
                await addDoc(ordersCol, {
                    game: 'Recarga Automática',
                    product: 'Pago por PayPal',
                    price: 1.00,
                    paymentMethod: 'PayPal Retorno Automático',
                    session: returnedSession,
                    status: 'Recargando',
                    userEmail: auth.currentUser.email,
                    timestamp: new Date().toISOString()
                });

                setTimeout(() => {
                    if (typeof switchTab === 'function') switchTab('history');
                }, 1500);
            } catch (e) {
                console.error("Error guardando orden automática:", e);
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await updateLoaderProgress(30, "Verificando cuenta de usuario...");
        const savedSector = localStorage.getItem('zenith_user_city') || 'Sabanilla';

        await updateLoaderProgress(60, "Obteniendo ubicación del sector...");
        const locationDisplay = document.getElementById('current-location-display');
        const activeRankingLabel = document.getElementById('active-ranking-label');
        
        if (locationDisplay) locationDisplay.innerText = savedSector;
        if (activeRankingLabel) activeRankingLabel.innerText = savedSector;

        await updateLoaderProgress(85, `Cargando Podio VIP de ${savedSector}...`);
        if (typeof window.listenTopBuyers === 'function') {
            window.listenTopBuyers(savedSector);
        }

        if (typeof window.checkWebsiteStatus === 'function') {
            window.checkWebsiteStatus();
        }

        await updateLoaderProgress(100, "¡Sistemas listos!");
        setTimeout(hideInitialLoader, 400);

    } catch (error) {
        console.error("Error durante el arranque:", error);
        await updateLoaderProgress(100, "Cargando con configuración por defecto...");
        setTimeout(hideInitialLoader, 500);
    }
});

// ==========================================
// CONTROL DEL OVERLAY DE PEDIDO EN TIEMPO REAL
// ==========================================
window.setActivePendingOrder = function(orderId) {
    if (!orderId) return;
    localStorage.setItem('zenith_pending_order_id', orderId);
    window.showOrderStatusOverlay('loading');
    window.listenToOrderStatus(orderId);
};

window.showOrderStatusOverlay = function(state, reasonText = "") {
    const overlay = document.getElementById('order-status-overlay');
    const loadingView = document.getElementById('order-status-loading');
    const completedView = document.getElementById('order-status-completed');
    const reasonContainer = document.getElementById('order-completed-reason');

    if (!overlay || !loadingView || !completedView) return;

    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');

    if (state === 'loading') {
        loadingView.style.display = 'block';
        loadingView.classList.remove('hidden');
        completedView.style.display = 'none';
        completedView.classList.add('hidden');
    } else if (state === 'completed') {
        loadingView.style.display = 'none';
        loadingView.classList.add('hidden');
        
        completedView.style.display = 'block';
        completedView.classList.remove('hidden');

        if (reasonContainer && reasonText) {
            reasonContainer.textContent = reasonText;
        }
    } else if (state === 'rejected') {
        loadingView.style.display = 'none';
        loadingView.classList.add('hidden');
        
        completedView.style.display = 'block';
        completedView.classList.remove('hidden');

        completedView.innerHTML = `
            <div class="w-20 h-20 mx-auto rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center shadow-[0_0_20px_rgba(255,0,0,0.4)]">
                <i class="fa-solid fa-triangle-exclamation text-red-500 text-3xl"></i>
            </div>
            <div class="space-y-2">
                <h3 class="font-orbitron font-black text-white text-xl tracking-wider">NO <span class="text-red-500">VERIFICADO</span></h3>
                <div class="bg-cyber-dark border border-red-500/40 p-4 rounded-2xl space-y-2 text-left">
                    <span class="text-[10px] text-red-400 uppercase font-bold tracking-widest block font-orbitron">Motivo:</span>
                    <p class="text-xs text-gray-200 font-medium leading-relaxed">${reasonText || "El comprobante o ID no pudo ser validado."}</p>
                </div>
            </div>
            <button onclick="closeOrderStatusOverlay()" class="w-full py-3.5 rounded-xl bg-red-500 text-black font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-all">
                Entendido
            </button>
        `;
    }
};

window.listenToOrderStatus = function(orderId) {
    if (!db || !orderId) return;

    const userId = auth && auth.currentUser ? auth.currentUser.uid : null;
    if (!userId) return;

    const orderRef = doc(db, 'artifacts', appId, 'users', userId, 'orders', orderId);
    
    onSnapshot(orderRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const status = (data.status || '').toLowerCase().trim();
            
            if (['verificada', 'completada', 'exitoso', 'approved'].includes(status)) {
                const motivo = data.reason || "¡Tu recarga ha sido acreditada exitosamente en tu cuenta del juego!";
                playCyberNotificationSound();
                window.showOrderStatusOverlay('completed', motivo);
                localStorage.removeItem('zenith_pending_order_id');
            } else if (['rechazada', 'rejected'].includes(status)) {
                const motivo = data.reason || "Comprobante no válido o ID incorrecto.";
                window.showOrderStatusOverlay('rejected', motivo);
                localStorage.removeItem('zenith_pending_order_id');
            }
        }
    });
};

window.closeOrderStatusOverlay = function() {
    const overlay = document.getElementById('order-status-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.add('hidden');
    }
    localStorage.removeItem('zenith_pending_order_id');
};

document.addEventListener('DOMContentLoaded', () => {
    const pendingOrderId = localStorage.getItem('zenith_pending_order_id');
    if (pendingOrderId) {
        window.setActivePendingOrder(pendingOrderId);
    }
});

window.cerrarPantallaCargaForzada = function() {
    window.closeOrderStatusOverlay();
};

// ==========================================
// MÓDULO TARJETA VIRTUAL ZWO
// ==========================================
window.openCreateZWOCardModal = function() {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
        if (typeof showNotification === 'function') {
            showNotification("Atención", "Necesitas iniciar sesión para crear tu tarjeta.", "warning");
        }
        openAuthModal();
        return;
    }
    const modal = document.getElementById('zwo-card-info-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeCreateZWOCardModal = function() {
    const modal = document.getElementById('zwo-card-info-modal');
    if (modal) modal.classList.add('hidden');
};

window.confirmAndGenerateZWOCard = async function() {
    closeCreateZWOCardModal();
    await window.generateAndSaveZWOCard();
};

window.openBlockZWOCardModal = function() {
    const modal = document.getElementById('zwo-card-block-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeBlockZWOCardModal = function() {
    const modal = document.getElementById('zwo-card-block-modal');
    if (modal) modal.classList.add('hidden');
};

function getRandom4Digits() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

window.generateAndSaveZWOCard = async function() {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
        if (typeof showNotification === 'function') {
            showNotification("Atención", "Necesitas iniciar sesión para crear tu tarjeta.", "warning");
        }
        openAuthModal();
        return;
    }

    const block1 = getRandom4Digits();
    const block2 = getRandom4Digits();
    const block3 = getRandom4Digits();
    const block4 = getRandom4Digits();
    const fullCardNumber = `${block1} ${block2} ${block3} ${block4}`;

    const currentYear = new Date().getFullYear();
    const maxYear = 2030;
    const randomYear = Math.floor(Math.random() * (maxYear - currentYear + 1)) + currentYear;
    const randomMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const expiryDate = `${randomMonth}/${String(randomYear).slice(-2)}`;

    const cvcLength = Math.random() < 0.5 ? 3 : 4; 
    let cvc = '';
    if (cvcLength === 3) {
        cvc = Math.floor(100 + Math.random() * 900).toString();
    } else {
        cvc = Math.floor(1000 + Math.random() * 9000).toString();
    }

    const cardData = {
        number: fullCardNumber,
        expiry: expiryDate,
        cvc: cvc,
        isOff: false,
        updatedAt: new Date().toISOString()
    };

    localStorage.setItem('zwo_user_card', JSON.stringify(cardData));
    renderZWOCardUI(cardData);

    try {
        const userCardRef = doc(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'zwo_card', 'details');
        await setDoc(userCardRef, cardData, { merge: true });
        
        if (typeof showNotification === 'function') {
            showNotification("¡Tarjeta Creada!", "Tu tarjeta ZWO ha sido registrada exitosamente en Firebase.", "success");
        }
    } catch (error) {
        console.error("Error guardando tarjeta en Firestore:", error);
    }
};

window.loadZWOCardFromFirebase = async function(uid) {
    if (!uid || !db) return;

    try {
        const userCardRef = doc(db, 'artifacts', appId, 'users', uid, 'zwo_card', 'details');
        const docSnap = await getDoc(userCardRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            localStorage.setItem('zwo_user_card', JSON.stringify(data));
            renderZWOCardUI(data);
        } else {
            loadSavedZWOCard();
        }
    } catch (e) {
        console.error("Error cargando tarjeta desde Firebase:", e);
        loadSavedZWOCard();
    }
};

function loadSavedZWOCard() {
    if (!auth || !auth.currentUser || auth.currentUser.isAnonymous) {
        renderZWOCardUI(null);
        return;
    }

    const savedCard = localStorage.getItem('zwo_user_card');
    if (savedCard) {
        const data = JSON.parse(savedCard);
        renderZWOCardUI(data);
    } else {
        renderZWOCardUI(null);
    }
}

window.toggleZWOCardStatus = async function() {
    const savedCard = localStorage.getItem('zwo_user_card');
    if (!savedCard) return;

    let cardData = JSON.parse(savedCard);
    cardData.isOff = !cardData.isOff;

    localStorage.setItem('zwo_user_card', JSON.stringify(cardData));

    if (auth && auth.currentUser && !auth.currentUser.isAnonymous && db) {
        try {
            const userCardRef = doc(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'zwo_card', 'details');
            await setDoc(userCardRef, { isOff: cardData.isOff }, { merge: true });
        } catch (e) {
            console.error("Error actualizando estado en Firestore:", e);
        }
    }

    renderZWOCardUI(cardData);

    const msg = cardData.isOff ? "Tarjeta apagada temporalmente. No podrás realizar compras." : "Tarjeta encendida y lista para comprar.";
    if (typeof showNotification === 'function') {
        showNotification(cardData.isOff ? "Tarjeta Apagada" : "Tarjeta Encendida", msg, cardData.isOff ? "warning" : "success");
    }
};

window.confirmBlockZWOCard = async function() {
    closeBlockZWOCardModal();

    localStorage.removeItem('zwo_user_card');

    if (auth && auth.currentUser && !auth.currentUser.isAnonymous && db) {
        try {
            const userCardRef = doc(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'zwo_card', 'details');
            await deleteDoc(userCardRef);
        } catch (e) {
            console.error("Error eliminando tarjeta de Firestore:", e);
        }
    }

    renderZWOCardUI(null);

    if (typeof showNotification === 'function') {
        showNotification("Tarjeta Bloqueada", "Tu tarjeta fue eliminada permanentemente.", "error");
    }
};

function renderZWOCardUI(cardData) {
    const genContainer = document.getElementById('zwo-btn-generate-container');
    const controlsContainer = document.getElementById('zwo-btn-controls-container');
    const badge = document.getElementById('zwo-card-status-badge');
    const visual = document.getElementById('zwo-card-visual');
    const toggleBtn = document.getElementById('btn-toggle-zwo-card');
    const toggleText = document.getElementById('zwo-toggle-text');

    const numEl = document.getElementById('zwo-card-number');
    const expEl = document.getElementById('zwo-card-expiry');
    const cvcEl = document.getElementById('zwo-card-cvc');

    const isLoggedIn = auth && auth.currentUser && !auth.currentUser.isAnonymous;

    if (!isLoggedIn) {
        if (genContainer) genContainer.classList.remove('hidden');
        if (controlsContainer) controlsContainer.classList.add('hidden');

        if (numEl) numEl.innerText = "xxxx xxxx xxxx xxxx";
        if (expEl) expEl.innerText = "XX/XX";
        if (cvcEl) cvcEl.innerText = "xxx";

        if (badge) {
            badge.innerText = "INICIA SESIÓN";
            badge.className = "px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30";
        }
        if (visual) visual.classList.add('opacity-50', 'grayscale');
        return;
    }

    if (visual) visual.classList.remove('opacity-50', 'grayscale');

    if (cardData && cardData.number) {
        if (genContainer) genContainer.classList.add('hidden');
        if (controlsContainer) controlsContainer.classList.remove('hidden');

        if (numEl) numEl.innerText = cardData.number;
        if (expEl) expEl.innerText = cardData.expiry;
        if (cvcEl) cvcEl.innerText = cardData.cvc;

        if (cardData.isOff) {
            if (badge) {
                badge.innerText = "APAGADA";
                badge.className = "px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30";
            }
            if (visual) visual.classList.add('opacity-40', 'grayscale');
            if (toggleText) toggleText.innerText = "Encender Tarjeta";
            if (toggleBtn) toggleBtn.className = "py-3 rounded-xl bg-green-500/20 border border-green-500/40 text-green-400 font-bold text-xs uppercase tracking-wider hover:bg-green-500 hover:text-black transition-all flex items-center justify-center space-x-1.5";
        } else {
            if (badge) {
                badge.innerText = "ACTIVA";
                badge.className = "px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyber-neonCyan text-[10px] font-bold border border-cyan-500/30";
            }
            if (visual) visual.classList.remove('opacity-40', 'grayscale');
            if (toggleText) toggleText.innerText = "Apagar Tarjeta";
            if (toggleBtn) toggleBtn.className = "py-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold text-xs uppercase tracking-wider hover:bg-amber-500 hover:text-black transition-all flex items-center justify-center space-x-1.5";
        }
    } else {
        if (genContainer) genContainer.classList.remove('hidden');
        if (controlsContainer) controlsContainer.classList.add('hidden');

        if (numEl) numEl.innerText = "•••• •••• •••• ••••";
        if (expEl) expEl.innerText = "MM/AA";
        if (cvcEl) cvcEl.innerText = "••••";

        if (badge) {
            badge.innerText = "SIN TARJETA";
            badge.className = "px-2.5 py-1 rounded-full bg-gray-500/20 text-gray-400 text-[10px] font-bold border border-gray-500/30";
        }
    }
}

document.addEventListener('DOMContentLoaded', loadSavedZWOCard);

// ==========================================
// MÓDULO DE CÓDIGOS DE DESCUENTO DINÁMICOS (CLIENTE)
// ==========================================
window.verifyDiscountCode = async function() {
    const inputField = document.getElementById('discount-code-input');
    const inputVal = inputField ? inputField.value.trim().toUpperCase() : '';
    const resultBox = document.getElementById('discount-verification-result');
    const resultTitle = document.getElementById('discount-result-title');
    const resultText = document.getElementById('discount-result-text');
    const resultIcon = document.getElementById('discount-result-icon');

    if (!inputVal) {
        showNotification("Atención", "Por favor ingresa un código de descuento.", "warning");
        return;
    }

    resultBox.classList.remove('hidden', 'bg-green-950/45', 'border-green-500/40', 'bg-red-950/45', 'border-red-500/40', 'bg-amber-950/45', 'border-amber-500/40');
    resultBox.classList.add('bg-amber-950/45', 'border-amber-500/40');
    resultIcon.className = "w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs";
    resultIcon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    resultTitle.className = "text-[9px] text-amber-400 uppercase font-bold tracking-wider block";
    resultTitle.innerText = "Sistema";
    resultText.innerText = "Verificando código...";

    try {
        if (!db) {
            throw new Error("Base de datos no inicializada");
        }

        const discountRef = doc(db, 'artifacts', appId, 'admin_discounts', inputVal);
        const discountSnap = await getDoc(discountRef);

        setTimeout(() => {
            if (!discountSnap.exists()) {
                resultBox.classList.remove('bg-amber-950/45', 'border-amber-500/40');
                resultBox.classList.add('bg-red-950/45', 'border-red-500/40');
                resultIcon.className = "w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs";
                resultIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                resultTitle.className = "text-[9px] text-red-400 uppercase font-bold tracking-wider block";
                resultTitle.innerText = "Error de Código";
                resultText.innerText = "Código De Descuento no valido";
                return;
            }

            const coupon = discountSnap.data();
            const currentDate = new Date().toISOString().split('T')[0];

            if (coupon.expiryDate && coupon.expiryDate < currentDate) {
                resultBox.classList.remove('bg-amber-950/45', 'border-amber-500/40');
                resultBox.classList.add('bg-red-950/45', 'border-red-500/40');
                resultIcon.className = "w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs";
                resultIcon.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i>';
                resultTitle.className = "text-[9px] text-red-400 uppercase font-bold tracking-wider block";
                resultTitle.innerText = "Cupón Expirado";
                resultText.innerText = "Código De Descuento no valido";
                return;
            }

            if (coupon.limitType === 'Limitado' && (coupon.usesCount || 0) >= (coupon.maxUses || 1)) {
                resultBox.classList.remove('bg-amber-950/45', 'border-amber-500/40');
                resultBox.classList.add('bg-red-950/45', 'border-red-500/40');
                resultIcon.className = "w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs";
                resultIcon.innerHTML = '<i class="fa-solid fa-ban"></i>';
                resultTitle.className = "text-[9px] text-red-400 uppercase font-bold tracking-wider block";
                resultTitle.innerText = "Límite Agotado";
                resultText.innerText = "Código De Descuento no valido";
                return;
            }

            if (selectedProduct && coupon.targetProduct) {
                const targetLower = coupon.targetProduct.toLowerCase();
                const currentProdLower = selectedProduct.name.toLowerCase();
                if (!currentProdLower.includes(targetLower)) {
                    resultBox.classList.remove('bg-amber-950/45', 'border-amber-500/40');
                    resultBox.classList.add('bg-red-950/45', 'border-red-500/40');
                    resultIcon.className = "w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs";
                    resultIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                    resultTitle.className = "text-[9px] text-red-400 uppercase font-bold tracking-wider block";
                    resultTitle.innerText = "No Aplicable";
                    resultText.innerText = `Aplica solo para ${coupon.targetProduct}`;
                    return;
                }
            }

            const discountPercent = coupon.discountPercent || 0;
            if (selectedProduct && discountPercent > 0) {
                const originalPrice = selectedProduct.price;
                const discountAmount = (originalPrice * discountPercent) / 100;
                const finalPrice = Math.max(0, originalPrice - discountAmount);

                const priceEl = document.getElementById('checkout-product-price');
                if (priceEl) {
                    priceEl.innerHTML = `<span class="line-through text-gray-500 text-xs mr-2">$${originalPrice.toFixed(2)}</span>$${finalPrice.toFixed(2)}`;
                }
                selectedProduct.finalDiscountedPrice = finalPrice;
            }

            resultBox.classList.remove('bg-amber-950/45', 'border-amber-500/40', 'bg-red-950/45', 'border-red-500/40');
            resultBox.classList.add('bg-green-950/45', 'border-green-500/40');
            resultIcon.className = "w-7 h-7 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs";
            resultIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            resultTitle.className = "text-[9px] text-green-400 uppercase font-bold tracking-wider block";
            resultTitle.innerText = `¡${discountPercent}% OFF Aplicado!`;
            resultText.innerText = "Descuento Aplicado";

        }, 800);

    } catch (error) {
        console.error("Error al verificar el código de descuento:", error);
        resultBox.classList.remove('bg-amber-950/45', 'border-amber-500/40');
        resultBox.classList.add('bg-red-950/45', 'border-red-500/40');
        resultIcon.className = "w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs";
        resultIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        resultTitle.className = "text-[9px] text-red-400 uppercase font-bold tracking-wider block";
        resultTitle.innerText = "Error";
        resultText.innerText = "Código De Descuento no valido";
    }
};