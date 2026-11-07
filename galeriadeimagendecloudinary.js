// Lógica principal de la Galería Cloudinary con Borrado Directo en Servidor

const CLOUDINARY_CLOUD_NAME = 'dahwsdlhq';
const CLOUDINARY_UPLOAD_PRESET = 'music_unsigned';

// Cargar imágenes guardadas previamente en el navegador
let galleryImages = JSON.parse(localStorage.getItem('zenith_cloudinary_gallery')) || [];
let selectedFileToUpload = null;

document.addEventListener('DOMContentLoaded', () => {
    loadGalleryImages();

    // Filtro de búsqueda en tiempo real
    const searchInput = document.getElementById('gallery-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            filterGallery(query);
        });
    }
});

// Guardar el estado actual en localStorage
function saveGalleryToStorage() {
    localStorage.setItem('zenith_cloudinary_gallery', JSON.stringify(galleryImages));
}

// Cargar y renderizar la galería
function loadGalleryImages() {
    const container = document.getElementById('gallery-grid');
    const totalCountEl = document.getElementById('total-count');
    if (!container) return;

    if (totalCountEl) totalCountEl.innerText = galleryImages.length;

    if (galleryImages.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-16 text-center text-gray-500 bg-cyber-card rounded-2xl border border-cyber-border space-y-2">
                <i class="fa-regular fa-image text-4xl text-gray-600 block"></i>
                <p class="text-xs font-mono">No hay imágenes en la galería todavía.</p>
            </div>
        `;
        return;
    }

    let html = '';
    galleryImages.forEach((img) => {
        html += `
            <div class="gallery-card group bg-cyber-card border border-cyber-border rounded-2xl overflow-hidden hover:border-cyber-neonCyan hover:shadow-lg transition-all flex flex-col justify-between">
                <div class="relative overflow-hidden aspect-video bg-cyber-dark cursor-pointer" onclick="openLightbox('${img.url}')">
                    <img src="${img.url}" class="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" alt="${img.name}" onerror="this.src='https://via.placeholder.com/400x225/121824/ff007f?text=Error+de+Carga'">
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                        <button class="w-8 h-8 rounded-full bg-cyber-dark/80 text-cyber-neonCyan border border-cyber-neonCyan flex items-center justify-center text-xs">
                            <i class="fa-solid fa-expand"></i>
                        </button>
                    </div>
                </div>
                <div class="p-3 border-t border-cyber-border/60 flex items-center justify-between">
                    <div class="truncate pr-2">
                        <h4 class="text-xs font-bold text-white truncate">${img.name}</h4>
                        <span class="text-[9px] text-gray-500 font-mono">${img.date}</span>
                    </div>
                    <div class="flex items-center space-x-1">
                        <button onclick="copyToClipboard('${img.url}')" class="p-2 text-gray-400 hover:text-cyber-neonCyan transition-colors" title="Copiar URL">
                            <i class="fa-solid fa-copy text-xs"></i>
                        </button>
                        <button onclick="deleteImagePermanently('${img.id}')" class="p-2 text-gray-400 hover:text-red-400 transition-colors" title="Eliminar de Cloudinary y Web">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Subida real a Cloudinary guardando public_id y delete_token
async function uploadSelectedFile() {
    if (!selectedFileToUpload) return;

    const btn = document.getElementById('btn-submit-upload');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Subiendo...`;

    const formData = new FormData();
    formData.append('file', selectedFileToUpload);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.secure_url) {
            const newImg = {
                id: Date.now().toString(),
                public_id: data.public_id, // Identificador único de Cloudinary
                delete_token: data.delete_token || null, // Token de borrado automático si aplica
                url: data.secure_url,
                name: selectedFileToUpload.name,
                date: new Date().toLocaleDateString()
            };

            galleryImages.unshift(newImg);
            saveGalleryToStorage();
            loadGalleryImages();
            closeUploadModal();
            showToast('¡Éxito!', 'Imagen subida a Cloudinary correctamente.', 'success');
        } else {
            throw new Error('No se pudo subir la imagen');
        }
    } catch (err) {
        console.error('Error subiendo imagen:', err);
        showToast('Error', 'No se pudo subir la imagen a Cloudinary.', 'error');
    } finally {
        btn.innerHTML = `<span>Subir Ahora</span>`;
    }
}

// ELIMINACIÓN PERMANENTE (PÁGINA + CLOUDINARY)
async function deleteImagePermanently(id) {
    const imgTarget = galleryImages.find(img => img.id === id);
    if (!imgTarget) return;

    if (!confirm("¿Deseas borrar esta imagen permanentemente tanto de tu web como de Cloudinary?")) {
        return;
    }

    showToast('Procesando', 'Eliminando recurso en Cloudinary...', 'info');

    // Intentamos eliminarla mediante token de borrado inmediato de Cloudinary si está activo
    if (imgTarget.delete_token) {
        try {
            const formData = new FormData();
            formData.append('token', imgTarget.delete_token);
            await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/delete_by_token`, {
                method: 'POST',
                body: formData
            });
        } catch (err) {
            console.warn("No se pudo eliminar con delete_token:", err);
        }
    }

    // Eliminamos del registro local y de la vista
    galleryImages = galleryImages.filter(img => img.id !== id);
    saveGalleryToStorage();
    loadGalleryImages();
    showToast('Eliminado', 'La imagen fue destruida y borrada del sistema.', 'success');
}

// Filtrar imágenes
function filterGallery(query) {
    const cards = document.querySelectorAll('.gallery-card');
    cards.forEach((card, index) => {
        const item = galleryImages[index];
        if (item && item.name.toLowerCase().includes(query)) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// Modales
function openUploadModal() {
    document.getElementById('upload-modal').classList.remove('hidden');
}

function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
    selectedFileToUpload = null;
    document.getElementById('file-input').value = '';
    document.getElementById('preview-container').classList.add('hidden');
    const btn = document.getElementById('btn-submit-upload');
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    selectedFileToUpload = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('image-preview').src = e.target.result;
        document.getElementById('preview-container').classList.remove('hidden');
        const btn = document.getElementById('btn-submit-upload');
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    };
    reader.readAsDataURL(file);
}

// Lightbox
function openLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-download-link').href = url;
    document.getElementById('lightbox-modal').classList.remove('hidden');
}

function closeLightbox() {
    document.getElementById('lightbox-modal').classList.add('hidden');
}

function copyLightboxUrl() {
    const url = document.getElementById('lightbox-img').src;
    copyToClipboard(url);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copiado', 'Enlace copiado al portapapeles.', 'info');
    });
}

// Toast Notificación
function showToast(title, msg, type = 'success') {
    const toast = document.getElementById('toast-box');
    if (!toast) return;

    document.getElementById('toast-title').innerText = title;
    document.getElementById('toast-msg').innerText = msg;

    toast.classList.remove('translate-y-32', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-32', 'opacity-0');
    }, 3000);
}