const socket = io(window.location.origin);
window.trucoSocket = socket;

// Lobby
const lobbyDiv = document.getElementById('lobby');
const gameWrapper = document.getElementById('gameWrapper');
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const roomsListEl = document.getElementById('roomsList');
const contagemEl = document.getElementById('contagemRegressiva');
const contagemNumero = document.getElementById('contagemNumero');
const roomVisibilityEl = document.getElementById('roomVisibility');
const roomFillBotsEl = document.getElementById('roomFillBots');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinCodeBtn = document.getElementById('joinCodeBtn');
const randomMatchBtn = document.getElementById('randomMatchBtn');

// Elementos do jogo
const gameContainer = document.getElementById('game');
const mesaCartas = document.getElementById('mesaCartas');
const viraEl = document.getElementById('vira');