const socket = io("https://buraco-backend.onrender.com");

let currentUser = null;
let currentRoom = null;
let mySeatIndex = null;
let isMyTurn = false;

// Configuração local de senhas do ADM
let adminMainPass = "prego12";
let adminSecondaryPass = localStorage.getItem('admin_sec_pass') || "";

// TELA 1: CADASTRO DE APELIDO ÚNICO
function registerNick() {
    const nick = document.getElementById('input-nick').value.trim();
    if (!nick) return alert("Digite um apelido válido!");

    socket.emit('register_nick', nick, (res) => {
        if (!res.success) {
            alert(res.msg);
        } else {
            currentUser = res.user;
            document.getElementById('user-display').innerText = currentUser.nick;
            document.getElementById('coins-display').innerText = `P$ ${currentUser.coins.toLocaleString()}`;
            
            // Se entrou via link de convite para uma cadeira específica
            if (window.pendingInvite) {
                const { roomId, maxPlayers, seatIndex } = window.pendingInvite;
                joinRoom(roomId, maxPlayers, seatIndex);
            } else {
                switchScreen('screen-lobby');
            }
        }
    });
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// CRIAR E ENTRAR NA SALA
function createRoom(maxPlayers) {
    const roomId = 'sala_' + Math.random().toString(36).substring(2, 7);
    joinRoom(roomId, maxPlayers, 0); // Senta automaticamente no primeiro lugar (0)
}

function joinRoom(roomId, maxPlayers, seatIndex) {
    socket.emit('join_room', { roomId, maxPlayers, seatIndex }, (res) => {
        if (!res.success) return alert(res.msg);
        
        currentRoom = res.room;
        mySeatIndex = seatIndex;
        switchScreen('screen-room');
        updateSeatsUI(currentRoom);
        document.getElementById('btn-ready').classList.remove('hidden');
    });
}

// CLIQUE NAS CADEIRAS (COMPARTILHAMENTO)
function claimSeat(targetSeatIndex) {
    if (!currentRoom) return;

    // Se a cadeira clicada estiver vazia, abre o menu de compartilhamento do celular
    if (!currentRoom.seats[targetSeatIndex]) {
        shareSeatLink(targetSeatIndex);
    }
}

// COMPARTILHAR LINK DA CADEIRA ESPECÍFICA
function shareSeatLink(seatIndex) {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoom.id}&max=${currentRoom.maxPlayers}&seat=${seatIndex}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Jogue Buraco Comigo!',
            text: `Sente-se na Cadeira ${seatIndex + 1} para jogarmos!`,
            url: inviteUrl
        }).catch(() => {});
    } else {
        prompt("Envie este link para seu contato entrar nesta cadeira:", inviteUrl);
    }
}

// ATUALIZA VISUALMENTE AS CADEIRAS (ESCONDE SOBRANTES EM 1x1)
function updateSeatsUI(room) {
    const max = room.maxPlayers;

    for (let i = 0; i < 4; i++) {
        const seatElem = document.getElementById(`seat-${i}`);
        
        // Em salas 1x1 (2 jogadores), oculta as cadeiras laterais (índices 2 e 3)
        if (max === 2 && (i === 2 || i === 3)) {
            seatElem.style.display = "none";
            continue;
        } else {
            seatElem.style.display = "flex";
        }

        const seatData = room.seats[i];
        if (seatData) {
            seatElem.innerText = seatData.nick;
            seatElem.style.background = "#22c55e";
        } else {
            seatElem.innerText = `Cadeira ${i + 1}\n(Convidar)`;
            seatElem.style.background = "#334155";
        }
    }
}

socket.on('room_update', (room) => {
    currentRoom = room;
    updateSeatsUI(room);
});

// PRONTO E CONTAGEM
function setReady() {
    socket.emit('player_ready', { roomId: currentRoom.id });
    document.getElementById('btn-ready').disabled = true;
}

socket.on('start_countdown', (seconds) => {
    let count = seconds;
    const cd = document.getElementById('countdown-display');
    const timer = setInterval(() => {
        cd.innerText = `A partida inicia em: ${count}s`;
        count--;
        if (count < 0) {
            clearInterval(timer);
            switchScreen('screen-game');
        }
    }, 1000);
});

// TURNO E AÇÕES
socket.on('timer_tick', ({ turnIndex, timer }) => {
    document.getElementById('turn-timer').innerText = timer;
    isMyTurn = (turnIndex === mySeatIndex);

    const deckCava = document.getElementById('deck-cava');
    if (!isMyTurn) {
        deckCava.style.opacity = "0.5";
        deckCava.style.pointerEvents = "none";
    } else {
        deckCava.style.opacity = "1";
        deckCava.style.pointerEvents = "auto";
    }
});

function cavar() {
    if (!isMyTurn) return alert("Aguarde seu turno!");
    alert("Você cavou 1 carta do monte!");
}

function pegarLixo() {
    if (!isMyTurn) return alert("Aguarde seu turno!");
    alert("Você pegou todas as cartas do lixo!");
}

function toggleEmojiPicker() {
    document.getElementById('emoji-picker').classList.toggle('hidden');
}

function sendReaction(type, value) {
    socket.emit('send_reaction', { roomId: currentRoom.id, type, value });
    toggleEmojiPicker();
}

socket.on('new_reaction', ({ sender, value }) => {
    alert(`${sender} enviou: ${value}`);
});

// PAINEL ADMINISTRADOR COM DUPLA SENHA
function openAdminModal() {
    const inputPass = prompt("Digite a Senha de Administrador:");
    if (!inputPass) return;

    // Verifica se a senha informada bate com a Principal (prego12) OU com a Secundária
    const isValidPass = (inputPass === adminMainPass) || (adminSecondaryPass && inputPass === adminSecondaryPass);

    if (!isValidPass) {
        return alert("Senha Incorreta!");
    }

    // Solicita os dados ao servidor passando a senha principal para autenticação
    socket.emit('admin_login', adminMainPass, (res) => {
        if (!res.success) return alert(res.msg);
        
        document.getElementById('admin-modal').classList.remove('hidden');
        const list = document.getElementById('admin-user-list');
        
        // Área para configurar/alterar a senha secundária
        let secPassStatus = adminSecondaryPass ? `Definida (${adminSecondaryPass})` : "Nenhuma";
        list.innerHTML = `
            <div style="background:#0f172a; padding:10px; margin-bottom:15px; border-radius:6px; text-align:left;">
                <p style="font-size:12px; color:#94a3b8;">Senha Principal: <strong>prego12</strong> (Fixa)</p>
                <p style="font-size:12px; color:#94a3b8;">Senha Secundária: <strong>${secPassStatus}</strong></p>
                <button onclick="setSecondaryAdminPass()" style="margin-top:8px; font-size:12px; background:#0284c7;">Definir/Alterar Senha Secundária</button>
            </div>
            <hr style="border-color:#334155; margin-bottom:10px;">
        `;
        
        for (let id in res.users) {
            const u = res.users[id];
            list.innerHTML += `
                <div style="margin:10px 0; border-bottom: 1px solid #475569; text-align:left;">
                    <p><strong>${u.nick}</strong> - P$ ${u.coins.toLocaleString()}</p>
                    <button onclick="editCoins('${u.nick}')">Editar Moedas</button>
                    <button onclick="toggleBlock('${u.nick}', ${!u.blocked})">${u.blocked ? 'Desbloquear' : 'Bloquear'} Chat</button>
                </div>
            `;
        }
    });
}

// FUNÇÃO PARA DEFINIR SENHA SECUNDÁRIA NO PAINEL
function setSecondaryAdminPass() {
    const newPass = prompt("Digite a nova Senha Secundária para o Painel ADM:");
    if (newPass && newPass.trim() !== "") {
        adminSecondaryPass = newPass.trim();
        localStorage.setItem('admin_sec_pass', adminSecondaryPass);
        alert("Senha secundária salva com sucesso! Agora você pode entrar com 'prego12' ou com esta nova senha.");
        openAdminModal();
    }
}

function closeAdminModal() {
    document.getElementById('admin-modal').classList.add('hidden');
}

// CAPTURA CONVITE AO ABRIR O LINK
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    const maxPlayers = parseInt(urlParams.get('max')) || 4;
    const seatIndex = parseInt(urlParams.get('seat'));

    if (roomId && seatIndex !== null && !isNaN(seatIndex)) {
        window.pendingInvite = { roomId, maxPlayers, seatIndex };
    }
});
