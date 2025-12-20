assi, [20.12.2025 3:48]
http.listen(PORT, () => console.log(Server started on port ${PORT}));

assi, [20.12.2025 3:49]
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Цвета для секторов игроков
const COLORS = ['#ff4444', '#44ff44', '#4444ff', '#ffcc00', '#ff00ff', '#00ffff', '#ffa500', '#8b4513'];

let gameState = {
    players: [],
    bank: 0,
    timeLeft: 15,
    status: 'BETTING',
    winningAngle: 0
};

// Игровой цикл сервера
setInterval(() => {
    if (gameState.status === 'BETTING') {
        // Таймер идет только если игроков 2 или больше
        if (gameState.players.length >= 2) {
            gameState.timeLeft--;
            if (gameState.timeLeft <= 0) {
                gameState.status = 'FLYING';
                gameState.winningAngle = Math.random() * Math.PI * 2;
                io.emit('start_game', { angle: gameState.winningAngle });
                
                setTimeout(() => {
                    gameState = { players: [], bank: 0, timeLeft: 15, status: 'BETTING', winningAngle: 0 };
                    io.emit('reset_game');
                }, 18000);
            }
        } else {
            // Если игроков меньше 2, сбрасываем таймер на 15
            gameState.timeLeft = 15;
        }
    }
    io.emit('sync', gameState);
}, 1000);

// Обработка ставок
io.on('connection', (socket) => {
    socket.on('bet', (data) => {
        if (gameState.status === 'BETTING') {
            let p = gameState.players.find(player => player.uid === data.uid);
            if (p) {
                p.bet += data.bet;
            } else {
                gameState.players.push({
                    uid: data.uid,
                    name: data.name,
                    avatar: data.avatar,
                    bet: data.bet,
                    color: COLORS[gameState.players.length % COLORS.length]
                });
            }
            gameState.bank += data.bet;
            io.emit('sync', gameState);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(Server started on port ${PORT}));
