const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#FF3B30', '#007AFF', '#34C759', '#FFCC00', '#AF52DE', '#FF9500', '#5AC8FA'];
const CANVAS_SIZE = 320;
const BALL_RADIUS = 10;

let game = {
    players: [],
    bank: 0,
    status: 'WAITING', // WAITING, COUNTDOWN, SPAWNED, AIMING, FLYING, WINNER
    timer: 0,
    ball: { x: 160, y: 160, vx: 0, vy: 0 },
    arrowAngle: 0,
    winner: null
};

function calculateTerritories() {
    let x = 0, y = 0, w = CANVAS_SIZE, h = CANVAS_SIZE;
    let horizontal = true;
    let remainingBank = game.bank;
    const sorted = [...game.players].sort((a, b) => b.bet - a.bet);
    sorted.forEach((p) => {
        const ratio = p.bet / remainingBank;
        if (horizontal) { p.rect = { x, y, w: w, h: h * ratio }; y += p.rect.h; h -= p.rect.h; }
        else { p.rect = { x, y, w: w * ratio, h: h }; x += p.rect.w; w -= p.rect.w; }
        remainingBank -= p.bet;
        horizontal = !horizontal;
    });
}

// Физика и анимация (50 FPS)
setInterval(() => {
    if (game.status === 'AIMING') {
        game.arrowAngle += 0.12; 
    }

    if (game.status === 'FLYING') {
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;
        if (game.ball.x < BALL_RADIUS || game.ball.x > CANVAS_SIZE - BALL_RADIUS) game.ball.vx *= -1;
        if (game.ball.y < BALL_RADIUS || game.ball.y > CANVAS_SIZE - BALL_RADIUS) game.ball.vy *= -1;
        game.ball.vx *= 0.993;
        game.ball.vy *= 0.993;

        if (Math.abs(game.ball.vx) < 0.05 && Math.abs(game.ball.vy) < 0.05) {
            game.status = 'WINNER';
            game.winner = game.players.find(p => 
                game.ball.x >= p.rect.x && game.ball.x <= p.rect.x + p.rect.w &&
                game.ball.y >= p.rect.y && game.ball.y <= p.rect.y + p.rect.h
            );
            setTimeout(() => resetGame(), 5000);
        }
    }
    io.emit('sync', game);
}, 20);

// Логика фаз (1 FPS)
setInterval(() => {
    if (game.status === 'WAITING' && game.players.length >= 2) {
        game.status = 'COUNTDOWN';
        game.timer = 10;
    }

    if (game.status === 'COUNTDOWN') {
        game.timer--;
        if (game.timer <= 0) {
            game.status = 'SPAWNED';
            game.ball = { x: 60 + Math.random() * 200, y: 60 + Math.random() * 200, vx: 0, vy: 0 };
            game.timer = 3;
            calculateTerritories();
        }
    } else if (game.status === 'SPAWNED') {
        game.timer--;
        if (game.timer <= 0) {
            game.status = 'AIMING';
            game.timer = 2;
        }
    } else if (game.status === 'AIMING') {
        game.timer--;
        if (game.timer <= 0) {
            game.status = 'FLYING';
            const force = 13 + Math.random() * 5;
            game.ball.vx = Math.cos(game.arrowAngle) * force;
            game.ball.vy = Math.sin(game.arrowAngle) * force;
        }
    }
}, 1000);

function resetGame() {
    game.players = []; game.bank = 0; game.status = 'WAITING'; game.winner = null; game.timer = 0;
}

io.on('connection', (socket) => {
    socket.on('bet', (data) => {
        if (game.status !== 'WAITING' && game.status !== 'COUNTDOWN') return;
        let p = game.players.find(x => x.uid === data.uid);
        if (p) p.bet += data.bet;
        else game.players.push({ ...data, color: COLORS[game.players.length % COLORS.length] });
        game.bank += data.bet;
        calculateTerritories();
    });

    socket.on('admin_cmd', (data) => {
        // Проверка по username @maesexs
        if (data.username !== 'maesexs') return;
        
        if (data.type === 'bot') {
            const id = Math.floor(Math.random()*999);
            game.players.push({
                uid: 'bot_'+id, name: '🤖 Бот '+id, bet: 50,
                avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${id}`,
                color: COLORS[game.players.length % COLORS.length]
            });
            game.bank += 50;
            calculateTerritories();
        } else if (data.type === 'reset') resetGame();
    });
});

http.listen(3000, () => console.log('Server running on port 3000'));
