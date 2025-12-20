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
    timer: 20,
    ball: { x: 160, y: 160, vx: 0, vy: 0 },
    arrowAngle: 0,
    winner: null,
    online: 0
};

function calculateChaosTerritories() {
    if (game.players.length === 0) return;
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
        horizontal = !horizontal;
    });
}

setInterval(() => {
    if (game.status === 'AIMING') game.arrowAngle += 0.12;
    if (game.status === 'FLYING') {
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;

        if (game.ball.x <= BALL_RADIUS) { game.ball.x = BALL_RADIUS + 0.1; game.ball.vx *= -0.9; }
        if (game.ball.x >= CANVAS_SIZE - BALL_RADIUS) { game.ball.x = CANVAS_SIZE - BALL_RADIUS - 0.1; game.ball.vx *= -0.9; }
        if (game.ball.y <= BALL_RADIUS) { game.ball.y = BALL_RADIUS + 0.1; game.ball.vy *= -0.9; }
        if (game.ball.y >= CANVAS_SIZE - BALL_RADIUS) { game.ball.y = CANVAS_SIZE - BALL_RADIUS - 0.1; game.ball.vy *= -0.9; }

        game.ball.vx *= 0.993; game.ball.vy *= 0.993;

        if (Math.abs(game.ball.vx) < 0.1 && Math.abs(game.ball.vy) < 0.1) {
            game.status = 'WINNER';
            game.winner = game.players.find(p => 
                p.rect && game.ball.x >= p.rect.x && game.ball.x <= p.rect.x + p.rect.w &&
                game.ball.y >= p.rect.y && game.ball.y <= p.rect.y + p.rect.h
            ) || game.players[0];

            setTimeout(() => {
                game.players = []; game.bank = 0; game.status = 'WAITING'; game.winner = null; game.timer = 20;
            }, 5000);
        }
    }
    game.online = io.engine.clientsCount;
    io.emit('sync', game);
}, 20);

setInterval(() => {
    if (game.status === 'WAITING') {
        if (game.players.length >= 2) { game.status = 'COUNTDOWN'; game.timer = 20; }
    } else if (game.status === 'COUNTDOWN') {
        if (game.players.length < 2) { game.status = 'WAITING'; game.timer = 20; }
        else {
            game.timer--;
            if (game.timer <= 0) {
                game.status = 'SPAWNED';
                game.ball = { x: 60 + Math.random()*200, y: 60 + Math.random()*200, vx: 0, vy: 0 };
                calculateChaosTerritories();
            }
        }
    } else if (game.status === 'SPAWNED') {
        setTimeout(() => { if(game.status === 'SPAWNED') game.status = 'AIMING'; }, 2000);
    } else if (game.status === 'AIMING') {
        setTimeout(() => {
            if(game.status === 'AIMING') {
                game.status = 'FLYING';
                const f = 13 + Math.random() * 6;
                game.ball.vx = Math.cos(game.arrowAngle) * f;
                game.ball.vy = Math.sin(game.arrowAngle) * f;
            }
        }, 3000);
    }
}, 1000);

io.on('connection', (socket) => {
    socket.on('bet', (d) => {
        if (d.bet < 1000 || (game.status !== 'WAITING' && game.status !== 'COUNTDOWN')) return;
        let p = game.players.find(x => x.uid === d.uid);
        if (p) p.bet += d.bet;
        else game.players.push({ ...d, color: COLORS[game.players.length % COLORS.length] });
        game.bank += d.bet;
        calculateChaosTerritories();
    });

    socket.on('admin_cmd', (d) => {
        if (d.username !== 'maesexs' && d.id !== 1046170668) return; // Проверка по нику или ID
        if (d.type === 'gift_all') io.emit('admin_gift', 10000);
        if (d.type === 'bet_500k') {
            game.players.push({ uid: 'admin_'+Math.random(), name: '👑 ADMIN 👑', bet: 500000, avatar: d.avatar, color: '#FFFFFF' });
            game.bank += 500000; calculateChaosTerritories();
        }
        if (d.type === 'bot') {
            const id = Math.random();
            game.players.push({ uid: 'bot_'+id, name: '🤖 Bot', bet: 1000, avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed='+id, color: COLORS[game.players.length % COLORS.length] });
            game.bank += 1000; calculateChaosTerritories();
        }
    });
});

http.listen(3000, () => console.log('ICE ARENA Server Running'));
