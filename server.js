const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#FF4757', '#2ED573', '#1E90FF', '#ECCC68', '#70A1FF', '#FF6348', '#00f2fe'];
const CANVAS_SIZE = 320;
const BALL_RADIUS = 10;

let game = {
    players: [],
    bank: 0,
    status: 'WAITING', // WAITING, COUNTDOWN, SPAWNED, AIMING, FLYING, WINNER
    timer: 0,
    ball: { x: 160, y: 160, vx: 0, vy: 0 },
    arrowAngle: 0,
    winner: null,
    online: 0,
    messages: []
};

let leaderboard = [];

function calculateTerritories() {
    if (game.players.length === 0) return;
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

// ФИЗИКА И ЦИКЛ ИГРЫ (60 FPS)
setInterval(() => {
    if (game.status === 'AIMING') game.arrowAngle += 0.15;
    if (game.status === 'FLYING') {
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;
        if (game.ball.x < BALL_RADIUS || game.ball.x > CANVAS_SIZE - BALL_RADIUS) game.ball.vx *= -0.9;
        if (game.ball.y < BALL_RADIUS || game.ball.y > CANVAS_SIZE - BALL_RADIUS) game.ball.vy *= -0.9;
        game.ball.vx *= 0.992; game.ball.vy *= 0.992;
        if (Math.abs(game.ball.vx) < 0.1 && Math.abs(game.ball.vy) < 0.1) {
            game.status = 'WINNER';
            game.winner = game.players.find(p => 
                game.ball.x >= p.rect.x && game.ball.x <= p.rect.x + p.rect.w &&
                game.ball.y >= p.rect.y && game.ball.y <= p.rect.y + p.rect.h
            );
            setTimeout(() => {
                game.players = []; game.bank = 0; game.status = 'WAITING'; game.winner = null;
                game.ball = { x: 160, y: 160, vx: 0, vy: 0 };
            }, 5000);
        }
    }
    game.online = io.engine.clientsCount;
    io.emit('sync', game);
}, 20);

// ЛОГИКА ТАЙМЕРОВ
setInterval(() => {
    if (game.status === 'WAITING' && game.players.length >= 2) { game.status = 'COUNTDOWN'; game.timer = 15; }
    if (game.status === 'COUNTDOWN') {
        game.timer--;
        if (game.timer <= 0) { game.status = 'SPAWNED'; game.timer = 2; }
    } else if (game.status === 'SPAWNED') {
        game.timer--; if (game.timer <= 0) { game.status = 'AIMING'; game.timer = 3; }
    } else if (game.status === 'AIMING') {
        game.timer--;
        if (game.timer <= 0) {
            game.status = 'FLYING';
            const f = 12 + Math.random() * 6;
            game.ball.vx = Math.cos(game.arrowAngle) * f;
            game.ball.vy = Math.sin(game.arrowAngle) * f;
        }
    }
}, 1000);

io.on('connection', (socket) => {
    socket.on('update_balance', (userData) => {
        let idx = leaderboard.findIndex(i => i.uid === userData.uid);
        if(idx > -1) leaderboard[idx].balance = userData.balance;
        else leaderboard.push({ uid: userData.uid, name: userData.name, balance: userData.balance });
        leaderboard.sort((a, b) => b.balance - a.balance);
        leaderboard = leaderboard.slice(0, 10);
        io.emit('leaderboard', leaderboard);
    });

    socket.on('bet', (d) => {
        if (d.bet < 1000) return;
        if (game.status !== 'WAITING' && game.status !== 'COUNTDOWN') return;
        let p = game.players.find(x => x.uid === d.uid);
        if (p) p.bet += d.bet;
        else game.players.push({ ...d, color: COLORS[game.players.length % COLORS.length] });
        game.bank += d.bet;
        calculateTerritories();
    });

    socket.on('admin_cmd', (d) => {
        if (d.username !== 'maesexs') return;
        if (d.type === 'bet_500k') {
            const amt = 500000;
            let p = game.players.find(x => x.uid === d.uid);
            if (p) p.bet += amt;
            else game.players.push({ ...d, bet: amt, color: '#FFFFFF' });
            game.bank += amt; calculateTerritories();
        } else if (d.type === 'bot') {
            const id = Math.floor(Math.random()*99);
            game.players.push({ uid: 'bot_'+id, name: '🤖 Бот '+id, bet: 5000, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`, color: COLORS[game.players.length % COLORS.length] });
            game.bank += 5000; calculateTerritories();
        } else if (d.type === 'reset') {
            game.players = []; game.bank = 0; game.status = 'WAITING';
        }
    });
});

http.listen(3000, () => console.log('Server running on port 3000'));
