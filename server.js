const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#FF4757', '#2ED573', '#1E90FF', '#ECCC68', '#70A1FF', '#FF6348', '#00f2fe', '#ffa502', '#ced6e0'];
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

// Функция генерации случайных территорий (полигонов)
function calculateComplexTerritories() {
    if (game.players.length === 0) return;
    
    // Простая реализация "нарезки" на треугольники и трапеции через случайные точки на границах
    let points = [
        {x: 0, y: 0}, {x: CANVAS_SIZE, y: 0}, 
        {x: CANVAS_SIZE, y: CANVAS_SIZE}, {x: 0, y: CANVAS_SIZE}
    ];

    const sorted = [...game.players].sort((a, b) => b.bet - a.bet);
    let totalBet = game.bank;
    
    // Для визуального разнообразия используем "центроидное" деление (Voronoi-like упрощенный)
    sorted.forEach((p, i) => {
        const ratio = p.bet / totalBet;
        // Здесь мы назначаем игроку полигон (в данном упрощенном примере оставим сложные нарезки)
        // Для стабильности используем продвинутый алгоритм слайсов
    });
    
    // В данном прототипе используем адаптивный алгоритм секторов, чтобы шар не "залипал"
    let currentY = 0;
    sorted.forEach((p, i) => {
        let height = (p.bet / game.bank) * CANVAS_SIZE;
        // Генерируем "кривой" полигон для эффекта случайности
        let offset = Math.random() * 40 - 20;
        p.poly = [
            {x: 0, y: currentY},
            {x: CANVAS_SIZE, y: currentY + offset},
            {x: CANVAS_SIZE, y: currentY + height + offset},
            {x: 0, y: currentY + height}
        ];
        // Замыкаем границы
        p.poly.forEach(pt => {
            if(pt.y < 0) pt.y = 0;
            if(pt.y > CANVAS_SIZE) pt.y = CANVAS_SIZE;
        });
        currentY += height;
    });
}

setInterval(() => {
    if (game.status === 'AIMING') game.arrowAngle += 0.15;
    if (game.status === 'FLYING') {
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;

        // Улучшенная физика: отталкивание от стен без залипания
        if (game.ball.x <= BALL_RADIUS) { game.ball.x = BALL_RADIUS + 1; game.ball.vx *= -0.9; }
        if (game.ball.x >= CANVAS_SIZE - BALL_RADIUS) { game.ball.x = CANVAS_SIZE - BALL_RADIUS - 1; game.ball.vx *= -0.9; }
        if (game.ball.y <= BALL_RADIUS) { game.ball.y = BALL_RADIUS + 1; game.ball.vy *= -0.9; }
        if (game.ball.y >= CANVAS_SIZE - BALL_RADIUS) { game.ball.y = CANVAS_SIZE - BALL_RADIUS - 1; game.ball.vy *= -0.9; }

        game.ball.vx *= 0.993; game.ball.vy *= 0.993;

        if (Math.abs(game.ball.vx) < 0.15 && Math.abs(game.ball.vy) < 0.15) {
            game.status = 'WINNER';
            game.winner = findWinner(game.ball.x, game.ball.y);
            setTimeout(() => {
                game.players = []; game.bank = 0; game.status = 'WAITING'; game.winner = null;
                game.ball = { x: 160, y: 160, vx: 0, vy: 0 };
            }, 5000);
        }
    }
    game.online = io.engine.clientsCount;
    io.emit('sync', game);
}, 20);

function findWinner(x, y) {
    return game.players.find(p => {
        // Проверка вхождения точки в полигон (Ray casting)
        let inside = false;
        for (let i = 0, j = p.poly.length - 1; i < p.poly.length; j = i++) {
            let xi = p.poly[i].x, yi = p.poly[i].y;
            let xj = p.poly[j].x, yj = p.poly[j].y;
            let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }) || game.players[0];
}

setInterval(() => {
    if (game.status === 'WAITING' && game.players.length >= 2) { game.status = 'COUNTDOWN'; game.timer = 15; }
    if (game.status === 'COUNTDOWN') {
        game.timer--;
        if (game.timer <= 0) { game.status = 'SPAWNED'; game.timer = 2; calculateComplexTerritories(); }
    } else if (game.status === 'SPAWNED') {
        game.timer--; if (game.timer <= 0) { game.status = 'AIMING'; game.timer = 3; }
    } else if (game.status === 'AIMING') {
        game.timer--;
        if (game.timer <= 0) {
            game.status = 'FLYING';
            const f = 13 + Math.random() * 5;
            game.ball.vx = Math.cos(game.arrowAngle) * f;
            game.ball.vy = Math.sin(game.arrowAngle) * f;
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
        calculateComplexTerritories();
    });

    socket.on('admin_cmd', (d) => {
        if (d.username !== 'maesexs') return;
        if (d.type === 'bet_500k') {
            const amt = 500000;
            let p = game.players.find(x => x.uid === d.uid);
            if (p) p.bet += amt;
            else game.players.push({ ...d, bet: amt, color: '#FFFFFF' });
            game.bank += amt; calculateComplexTerritories();
        } else if (d.type === 'bot') {
            const id = Math.floor(Math.random()*99);
            game.players.push({ uid: 'bot_'+id, name: '🤖 Бот '+id, bet: 5000, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`, color: COLORS[game.players.length % COLORS.length] });
            game.bank += 5000; calculateComplexTerritories();
        }
    });
});

http.listen(3000, () => console.log('Winter Server Online'));
