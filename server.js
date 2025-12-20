const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');

app.use(express.static(__dirname)); // Это позволяет серверу видеть ваш index.html

// --- НАСТРОЙКИ ---
const BOT_TOKEN = '8593275304:AAGFWnHOBheYkC4DkKtu0Q-xteKI42fTIPw'; 
const CHANNEL_ID = '@xoronft'; 
const COLORS = ['#FF4757', '#2ED573', '#1E90FF', '#ECCC68', '#70A1FF', '#7B7D7D', '#FFA500'];
const CANVAS_SIZE = 320;

let game = {
    players: [],
    bank: 0,
    status: 'WAITING',
    timer: 0,
    ball: { x: 160, y: 160, vx: 0, vy: 0 },
    arrowAngle: 0,
    winner: null,
    online: 0,
    messages: []
};

let leaderboard = []; // Хранилище для ТОП-10

// Логика территорий (как в старом коде)
function calculateTerritories() {
    let x = 0, y = 0, w = CANVAS_SIZE, h = CANVAS_SIZE;
    let horizontal = true;
    let remainingBank = game.bank;
    const sorted = [...game.players].sort((a, b) => b.bet - a.bet);
    sorted.forEach((p) => {
        const ratio = p.bet / remainingBank || 0;
        if (horizontal) { p.rect = { x, y, w: w, h: h * ratio }; y += p.rect.h; h -= p.rect.h; }
        else { p.rect = { x, y, w: w * ratio, h: h }; x += p.rect.w; w -= p.rect.w; }
        remainingBank -= p.bet;
        horizontal = !horizontal;
    });
}

// Обработка подключений
io.on('connection', (socket) => {
    
    // Обновление лидерборда
    socket.on('update_balance', (userData) => {
        let idx = leaderboard.findIndex(i => i.uid === userData.uid);
        if(idx > -1) leaderboard[idx].balance = userData.balance;
        else leaderboard.push({ uid: userData.uid, name: userData.name, balance: userData.balance });
        
        leaderboard.sort((a, b) => b.balance - a.balance);
        leaderboard = leaderboard.slice(0, 10);
        io.emit('leaderboard', leaderboard);
    });

    // Ставки
    socket.on('bet', (d) => {
        if (d.bet < 1000) return; // Минималка 1000
        if (game.status !== 'WAITING' && game.status !== 'COUNTDOWN') return;

        let p = game.players.find(x => x.uid === d.uid);
        if (p) p.bet += d.bet;
        else game.players.push({ ...d, color: COLORS[game.players.length % COLORS.length] });
        
        game.bank += d.bet;
        calculateTerritories();
    });

    // Админ-панель
    socket.on('admin_cmd', (d) => {
        if (d.username !== 'maesexs') return; // Проверка ника админа

        if (d.type === 'bet_500k') {
            let p = game.players.find(x => x.uid === d.uid);
            const betAmount = 500000;
            if (p) p.bet += betAmount;
            else game.players.push({ ...d, bet: betAmount, color: '#FFFFFF' });
            game.bank += betAmount;
            calculateTerritories();
        } 
        else if (d.type === 'bot') {
            const id = Math.floor(Math.random()*999);
            game.players.push({ uid: 'bot_'+id, name: '🤖 Бот '+id, bet: 5000, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`, color: COLORS[game.players.length % COLORS.length] });
            game.bank += 5000;
            calculateTerritories();
        }
        else if (d.type === 'reset') {
            game.players = []; game.bank = 0; game.status = 'WAITING';
        }
    });
});

// Запуск интервалов игры и физики (оставьте как в вашем старом коде)
// ... (setInterval для физики и фаз игры) ...

http.listen(3000, () => {
    console.log('Сервер запущен на http://localhost:3000');
});
