const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#FF4757', '#2ED573', '#1E90FF', '#ECCC68', '#70A1FF', '#FF6348', '#00f2fe', '#ffa502', '#ced6e0', '#5352ed'];
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
    online: 0
};

// Алгоритм "Хаотичной нарезки" территорий
function calculateChaosTerritories() {
    if (game.players.length === 0) return;

    let regions = [{
        x: 0, y: 0, w: CANVAS_SIZE, h: CANVAS_SIZE,
        targetPlayers: [...game.players].sort(() => Math.random() - 0.5) // Случайный порядок
    }];

    // Рекурсивно делим пространство
    game.players.forEach(p => {
        p.rect = null; 
    });

    let playersToAssign = [...game.players].sort(() => Math.random() - 0.5);
    let curX = 0, curY = 0, curW = CANVAS_SIZE, curH = CANVAS_SIZE;
    let horizontal = Math.random() > 0.5;

    playersToAssign.forEach((p, i) => {
        let ratio = p.bet / (playersToAssign.slice(i).reduce((a, b) => a + b.bet, 0));
        
        if (horizontal) {
            let h = curH * ratio;
            p.rect = { x: curX, y: curY, w: curW, h: h };
            curY += h; curH -= h;
        } else {
            let w = curW * ratio;
            p.rect = { x: curX, y: curY, w: w, h: curH };
            curX += w; curW -= w;
        }
        horizontal = !horizontal; // Меняем направление на каждом шаге для хаоса
    });
}

setInterval(() => {
    if (game.status === 'AIMING') game.arrowAngle += 0.15;
    if (game.status === 'FLYING') {
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;

        // Физика без залипания
        if (game.ball.x <= BALL_RADIUS) { game.ball.x = BALL_RADIUS + 0.1; game.ball.vx *= -0.9; }
        if (game.ball.x >= CANVAS_SIZE - BALL_RADIUS) { game.ball.x = CANVAS_SIZE - BALL_RADIUS - 0.1; game.ball.vx *= -0.9; }
        if (game.ball.y <= BALL_RADIUS) { game.ball.y = BALL_RADIUS + 0.1; game.ball.vy *= -0.9; }
        if (game.ball.y >= CANVAS_SIZE - BALL_RADIUS) { game.ball.y = CANVAS_SIZE - BALL_RADIUS - 0.1; game.ball.vy *= -0.9; }

        game.ball.vx *= 0.994; game.ball.vy *= 0.994;

        if (Math.abs(game.ball.vx) < 0.12 && Math.abs(game.ball.vy) < 0.12) {
            game.status = 'WINNER';
            game.winner = game.players.find(p => 
                p.rect &&
                game.ball.x >= p.rect.x && game.ball.x <= p.rect.x + p.rect.w &&
                game.ball.y >= p.rect.y && game.ball.y <= p.rect.y + p.rect.h
            ) || game.players[0];

            setTimeout(() => {
                game.players = []; game.bank = 0; game.status = 'WAITING'; game.winner = null;
                game.ball = { x: 160, y: 160, vx: 0, vy: 0 };
            }, 5000);
        }
    }
    game.online = io.engine.clientsCount;
    io.emit('sync', game);
}, 20);

setInterval(() => {
    if (game.status === 'WAITING' && game.players.length >= 2) { game.status = 'COUNTDOWN'; game.timer = 15; }
    if (game.status === 'COUNTDOWN') {
        game.timer--;
        if (game.timer <= 0) { 
            game.status = 'SPAWNED'; 
            game.timer = 2;
            // Рандомный спавн шара
            game.ball = { 
                x: 40 + Math.random() * (CANVAS_SIZE - 80), 
                y: 40 + Math.random() * (CANVAS_SIZE - 80), 
                vx: 0, vy: 0 
            };
            calculateChaosTerritories(); 
        }
    } else if (game.status === 'SPAWNED') {
        game.timer--; if (game.timer <= 0) { game.status = 'AIMING'; game.timer = 3; }
    } else if (game.status === 'AIMING') {
        game.timer--;
        if (game.timer <= 0) {
            game.status = 'FLYING';
            const force = 12 + Math.random() * 6;
            game.ball.vx = Math.cos(game.arrowAngle) * force;
            game.ball.vy = Math.sin(game.arrowAngle) * force;
        }
    }
}, 1000);

io.on('connection', (socket) => {
    socket.on('bet', (d) => {
        if (d.bet < 1000) return;
        if (game.status !== 'WAITING' && game.status !== 'COUNTDOWN') return;
        let p = game.players.find(x => x.uid === d.uid);
        if (p) p.bet += d.bet;
        else game.players.push({ ...d, color: COLORS[game.players.length % COLORS.length] });
        game.bank += d.bet;
        calculateChaosTerritories();
    });

    socket.on('admin_cmd', (d) => {
        if (d.username !== 'maesexs') return;
        if (d.type === 'bet_500k') {
            const amt = 500000;
            let p = game.players.find(x => x.uid === d.uid);
            if (p) p.bet += amt;
            else game.players.push({ ...d, bet: amt, color: '#FFFFFF' });
            game.bank += amt; calculateChaosTerritories();
        } else if (d.type === 'bot') {
            const id = Math.floor(Math.random()*99);
            game.players.push({ uid: 'bot_'+id, name: '🤖 Бот '+id, bet: 1000 + Math.floor(Math.random()*5000), avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`, color: COLORS[game.players.length % COLORS.length] });
            game.bank += 1000; calculateChaosTerritories();
        } else if (d.type === 'gift_all') {
            io.emit('admin_gift', 10000);
        }
    });
});

http.listen(3000, () => console.log('Winter TON PvP Server started'));
