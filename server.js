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
    timeLeft: 15,
    status: 'WAITING', // WAITING, BETTING, FLYING, WINNER
    ball: { x: 160, y: 160, vx: 0, vy: 0 },
    winner: null
};

// Функция расчета секторов (нужна серверу для определения победителя)
function calculateTerritories() {
    let x = 0, y = 0, w = CANVAS_SIZE, h = CANVAS_SIZE;
    let horizontal = true;
    let remainingBank = game.bank;
    const sorted = [...game.players].sort((a, b) => b.bet - a.bet);

    sorted.forEach((p) => {
        const ratio = p.bet / remainingBank;
        if (horizontal) {
            p.rect = { x, y, w: w, h: h * ratio };
            y += p.rect.h; h -= p.rect.h;
        } else {
            p.rect = { x, y, w: w * ratio, h: h };
            x += p.rect.w; w -= p.rect.w;
        }
        remainingBank -= p.bet;
        horizontal = !horizontal;
    });
}

// Игровой цикл физики (50 FPS)
setInterval(() => {
    if (game.status === 'FLYING') {
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;

        // Отскоки
        if (game.ball.x < BALL_RADIUS || game.ball.x > CANVAS_SIZE - BALL_RADIUS) game.ball.vx *= -1;
        if (game.ball.y < BALL_RADIUS || game.ball.y > CANVAS_SIZE - BALL_RADIUS) game.ball.vy *= -1;

        // Трение (замедление)
        game.ball.vx *= 0.993;
        game.ball.vy *= 0.993;

        // Проверка полной остановки
        if (Math.abs(game.ball.vx) < 0.05 && Math.abs(game.ball.vy) < 0.05) {
            game.ball.vx = 0;
            game.ball.vy = 0;
            game.status = 'WINNER';
            
            // Определяем победителя
            game.winner = game.players.find(p => 
                game.ball.x >= p.rect.x && game.ball.x <= p.rect.x + p.rect.w &&
                game.ball.y >= p.rect.y && game.ball.y <= p.rect.y + p.rect.h
            );

            // Сброс игры через 5 секунд после победы
            setTimeout(() => {
                game.players = [];
                game.bank = 0;
                game.status = 'WAITING';
                game.winner = null;
                game.timeLeft = 15;
            }, 5000);
        }
    }
    io.emit('sync', game);
}, 20);

// Основной таймер
setInterval(() => {
    if (game.status === 'WAITING' && game.players.length >= 1) {
        game.status = 'BETTING';
    }

    if (game.status === 'BETTING') {
        game.timeLeft--;
        
        // Бот для теста
        if (game.timeLeft === 10 && game.players.length < 2) {
            const botId = Math.floor(Math.random()*1000);
            game.players.push({
                uid: 'bot_'+botId,
                name: '🤖 Bot_' + botId,
                avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${botId}`,
                bet: 50,
                color: COLORS[game.players.length % COLORS.length]
            });
            game.bank += 50;
            calculateTerritories();
        }

        if (game.timeLeft <= 0) {
            game.status = 'FLYING';
            // Начальный импульс (одинаковый для всех)
            const angle = Math.random() * Math.PI * 2;
            const force = 12 + Math.random() * 5;
            game.ball = { x: 160, y: 160, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force };
            calculateTerritories();
        }
    }
}, 1000);

io.on('connection', (socket) => {
    socket.on('bet', (data) => {
        if (game.status !== 'BETTING' && game.status !== 'WAITING') return;
        let p = game.players.find(x => x.uid === data.uid);
        if (p) {
            p.bet += data.bet;
        } else {
            game.players.push({ ...data, color: COLORS[game.players.length % COLORS.length] });
        }
        game.bank += data.bet;
        calculateTerritories();
    });
});

http.listen(3000, () => console.log('Server running on port 3000'));
