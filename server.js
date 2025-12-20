const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#FF4757', '#2ED573', '#1E90FF', '#ECCC68', '#70A1FF', '#FF6348', '#00f2fe', '#ffa502', '#ced6e0', '#5352ed'];
const CANVAS_SIZE = 320;
const BALL_RADIUS = 10;
const LUCKY_SIZE = 25; 

let game = {
    players: [],
    bank: 0,
    status: 'WAITING',
    timer: 20,
    ball: { x: 160, y: 160, vx: 0, vy: 0 },
    luckyBlock: { x: 0, y: 0, active: false, type: null }, 
    arrowAngle: 0,
    winner: null,
    online: 0,
    launchTime: 0 // Время, когда шар был запущен
};

function calculateChaosTerritories() {
    if (game.players.length === 0) return;
    let playersToAssign = [...game.players].sort(() => Math.random() - 0.5);
    let curX = 0, curY = 0, curW = CANVAS_SIZE, curH = CANVAS_SIZE;
    let horizontal = Math.random() > 0.5;

    playersToAssign.forEach((p, i) => {
        let totalRemaining = playersToAssign.slice(i).reduce((a, b) => a + b.bet, 0);
        let ratio = p.bet / totalRemaining;
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

function checkLuckyCollision() {
    if (!game.luckyBlock.active) return;
    const dx = game.ball.x - (game.luckyBlock.x + LUCKY_SIZE / 2);
    const dy = game.ball.y - (game.luckyBlock.y + LUCKY_SIZE / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < BALL_RADIUS + LUCKY_SIZE / 2) {
        game.luckyBlock.active = false;
        const type = game.luckyBlock.type;
        io.emit('lucky_hit', type);

        setTimeout(() => {
            if (type === 'SWAP') {
                calculateChaosTerritories();
            } else if (type === 'STOP') {
                game.ball.vx = 0;
                game.ball.vy = 0;
            }
            io.emit('sync', game);
        }, 3000);
    }
}

// ОСНОВНОЙ ЦИКЛ ФИЗИКИ (50 раз в секунду)
setInterval(() => {
    if (game.status === 'AIMING') game.arrowAngle += 0.12;
    
    if (game.status === 'FLYING') {
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;

        // Отскоки от стен
        if (game.ball.x <= BALL_RADIUS) { game.ball.x = BALL_RADIUS + 0.1; game.ball.vx *= -0.8; }
        if (game.ball.x >= CANVAS_SIZE - BALL_RADIUS) { game.ball.x = CANVAS_SIZE - BALL_RADIUS - 0.1; game.ball.vx *= -0.8; }
        if (game.ball.y <= BALL_RADIUS) { game.ball.y = BALL_RADIUS + 0.1; game.ball.vy *= -0.8; }
        if (game.ball.y >= CANVAS_SIZE - BALL_RADIUS) { game.ball.y = CANVAS_SIZE - BALL_RADIUS - 0.1; game.ball.vy *= -0.8; }
        
        // --- ЛОГИКА ТАЙМЕРА ПОЛЕТА (13 секунд) ---
        const elapsed = Date.now() - game.launchTime;

        if (elapsed < 11000) {
            // Первые 11 секунд: шар летает быстро (почти нет трения)
            game.ball.vx *= 0.998;
            game.ball.vy *= 0.998;
        } 
        else if (elapsed < 13000) {
            // Последние 2 секунды: шар плавно замедляется ("докатывается")
            game.ball.vx *= 0.92;
            game.ball.vy *= 0.92;
        } 
        else {
            // Спустя 13 секунд: полная остановка
            game.ball.vx = 0;
            game.ball.vy = 0;
        }

        checkLuckyCollision();

        // Проверка финиша: если прошло больше 12.5 сек и шар почти замер
        if (elapsed > 12500 && Math.abs(game.ball.vx) < 0.05 && Math.abs(game.ball.vy) < 0.05) {
            game.status = 'WINNER';
            game.winner = game.players.find(p => p.rect && game.ball.x >= p.rect.x && game.ball.x <= p.rect.x + p.rect.w && game.ball.y >= p.rect.y && game.ball.y <= p.rect.y + p.rect.h) || game.players[0];
            
            setTimeout(() => { 
                game.players = []; 
                game.bank = 0; 
                game.status = 'WAITING'; 
                game.winner = null; 
                game.timer = 20; 
                game.luckyBlock.active = false;
            }, 5000);
        }
    }
    game.online = io.engine.clientsCount;
    io.emit('sync', game);
}, 20);

// ЛОГИКА ТАЙМЕРОВ (раз в секунду)
setInterval(() => {
    if (game.status === 'WAITING' && game.players.length >= 2) { 
        game.status = 'COUNTDOWN'; 
        game.timer = 20; 
    }
    else if (game.status === 'COUNTDOWN') {
        if (game.players.length < 2) { 
            game.status = 'WAITING'; 
            game.timer = 20; 
        } else {
            game.timer--; 
            if (game.timer <= 0) { 
                game.status = 'SPAWNED'; 
                game.ball = { x: 60 + Math.random()*200, y: 60 + Math.random()*200, vx: 0, vy: 0 };
                
                game.luckyBlock = {
                    x: 40 + Math.random() * (CANVAS_SIZE - 80),
                    y: 40 + Math.random() * (CANVAS_SIZE - 80),
                    active: true,
                    type: Math.random() > 0.5 ? 'SWAP' : 'STOP'
                };

                calculateChaosTerritories(); 
            } 
        }
    } 
    else if (game.status === 'SPAWNED') { 
        setTimeout(() => { if(game.status === 'SPAWNED') game.status = 'AIMING'; }, 2000); 
    }
    else if (game.status === 'AIMING') { 
        setTimeout(() => { 
            if(game.status === 'AIMING') { 
                game.status = 'FLYING'; 
                game.launchTime = Date.now(); // Фиксируем время старта
                // Увеличиваем силу удара, чтобы хватило на 13 секунд
                const f = 14 + Math.random() * 4; 
                game.ball.vx = Math.cos(game.arrowAngle) * f; 
                game.ball.vy = Math.sin(game.arrowAngle) * f; 
            } 
        }, 3000); 
    }
}, 1000);

io.on('connection', (socket) => {
    socket.on('bet', (d) => {
        if (d.bet < 0.5 || (game.status !== 'WAITING' && game.status !== 'COUNTDOWN')) return;
        let p = game.players.find(x => x.uid === d.uid);
        if (p) p.bet += d.bet;
        else game.players.push({ ...d, color: COLORS[game.players.length % COLORS.length] });
        game.bank += d.bet;
        calculateChaosTerritories();
    });

    socket.on('admin_cmd', (d) => {
        if (d.id !== 1046170668 && d.username !== 'maesexs') return;
        if (d.type === 'gift_all') io.emit('admin_gift', 50);
        if (d.type === 'bot') {
            const id = Math.random();
            game.players.push({ uid: 'bot_'+id, name: '🤖 Бот', bet: 1, avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed='+id, color: COLORS[game.players.length % COLORS.length] });
            game.bank += 1; calculateChaosTerritories();
        }
    });
});

http.listen(process.env.PORT || 3000, () => console.log('ICE ARENA v9 (13s Flight) Started'));
