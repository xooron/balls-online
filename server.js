const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');

app.use(express.static(__dirname));

// --- НАСТРОЙКИ ---
const BOT_TOKEN = '8593275304:AAGFWnHOBheYkC4DkKtu0Q-xteKI42fTIPw'; // Замени на свой токен
const CHANNEL_ID = '@xoronft'; 
const COLORS = ['#FF0000', '#0070FF', '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500'];
const CANVAS_SIZE = 320;
const BALL_RADIUS = 10;

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

// Проверка подписки
async function checkSub(userId) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${CHANNEL_ID}&user_id=${userId}`;
        const res = await axios.get(url);
        const s = res.data.result.status;
        return ['member', 'administrator', 'creator'].includes(s);
    } catch (e) { return false; }
}

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

// Физика (50 FPS)
setInterval(() => {
    if (game.status === 'AIMING') game.arrowAngle += 0.15;
    if (game.status === 'FLYING') {
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;

        // Анти-баг стен (Bounce + Snap)
        if (game.ball.x < BALL_RADIUS) { game.ball.x = BALL_RADIUS; game.ball.vx *= -0.9; }
        else if (game.ball.x > CANVAS_SIZE - BALL_RADIUS) { game.ball.x = CANVAS_SIZE - BALL_RADIUS; game.ball.vx *= -0.9; }
        if (game.ball.y < BALL_RADIUS) { game.ball.y = BALL_RADIUS; game.ball.vy *= -0.9; }
        else if (game.ball.y > CANVAS_SIZE - BALL_RADIUS) { game.ball.y = CANVAS_SIZE - BALL_RADIUS; game.ball.vy *= -0.9; }

        game.ball.vx *= 0.994; game.ball.vy *= 0.994;

        if (Math.abs(game.ball.vx) < 0.05 && Math.abs(game.ball.vy) < 0.05) {
            game.status = 'WINNER';
            game.winner = game.players.find(p => 
                game.ball.x >= p.rect.x && game.ball.x <= p.rect.x + p.rect.w &&
                game.ball.y >= p.rect.y && game.ball.y <= p.rect.y + p.rect.h
            );
            setTimeout(() => { game.players = []; game.bank = 0; game.status = 'WAITING'; game.winner = null; }, 5000);
        }
    }
    game.online = io.engine.clientsCount;
    io.emit('sync', game);
}, 20);

// Логика фаз
setInterval(() => {
    if (game.status === 'WAITING' && game.players.length >= 2) { game.status = 'COUNTDOWN'; game.timer = 20; }
    if (game.status === 'COUNTDOWN') {
        game.timer--;
        if (game.timer <= 0) { 
            game.status = 'SPAWNED'; game.timer = 3; 
            game.ball = { x: 80+Math.random()*160, y: 80+Math.random()*160, vx: 0, vy: 0 };
            calculateTerritories();
        }
    } else if (game.status === 'SPAWNED') {
        game.timer--;
        if (game.timer <= 0) { game.status = 'AIMING'; game.timer = 2; }
    } else if (game.status === 'AIMING') {
        game.timer--;
        if (game.timer <= 0) {
            game.status = 'FLYING';
            const f = 14 + Math.random() * 4;
            game.ball.vx = Math.cos(game.arrowAngle) * f;
            game.ball.vy = Math.sin(game.arrowAngle) * f;
        }
    }
}, 1000);

io.on('connection', (socket) => {
    socket.on('verify_sub', async (d) => { socket.emit('sub_status', { isSubbed: await checkSub(d.userId) }); });
    
    socket.on('bet', async (d) => {
        if (!await checkSub(d.id)) return;
        if (game.status !== 'WAITING' && game.status !== 'COUNTDOWN') return;
        let p = game.players.find(x => x.uid === d.uid);
        if (p) p.bet += d.bet;
        else game.players.push({ ...d, color: COLORS[game.players.length % COLORS.length] });
        game.bank += d.bet;
        calculateTerritories();
    });

    socket.on('send_msg', (m) => {
        const msg = { user: m.user, text: m.text.slice(0, 100), time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) };
        game.messages.push(msg); if (game.messages.length > 30) game.messages.shift();
        io.emit('chat_update', game.messages);
    });

    socket.on('admin_cmd', (d) => {
        if (d.username !== 'maesexs') return;
        if (d.type === 'bot') {
            const id = Math.floor(Math.random()*999);
            game.players.push({ uid: 'bot_'+id, name: '🤖 Бот '+id, bet: 50, avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${id}`, color: COLORS[game.players.length % COLORS.length] });
            game.bank += 50; calculateTerritories();
        } else if (d.type === 'gift_all') io.emit('admin_gift', 5000);
        else if (d.type === 'reset') { game.players = []; game.bank = 0; game.status = 'WAITING'; }
    });
});

http.listen(3000, () => console.log('Server running'));
