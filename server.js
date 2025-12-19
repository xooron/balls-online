const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Указываем серверу раздавать файлы из текущей папки
app.use(express.static(__dirname));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let gameState = {
    players: [],
    bank: 0,
    timeLeft: 15,
    status: 'BETTING'
};

// Игровой цикл
setInterval(() => {
    if (gameState.status === 'BETTING') {
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
            if (gameState.players.length > 0) {
                gameState.status = 'FLYING';
                const winAngle = Math.random() * Math.PI * 2;
                io.emit('start_game', { angle: winAngle });
                
                setTimeout(() => {
                    gameState = { players: [], bank: 0, timeLeft: 15, status: 'BETTING' };
                    io.emit('reset');
                }, 20000);
            } else {
                gameState.timeLeft = 15;
            }
        }
    }
    io.emit('sync', gameState);
}, 1000);

// Подключения игроков
io.on('connection', (socket) => {
    socket.on('bet', (data) => {
        if (gameState.status === 'BETTING') {
            gameState.players.push({ ...data, id: socket.id });
            gameState.bank += data.bet;
        }
    });
});

// ПОРТ ДЛЯ ХОСТИНГА (Render сам подставит нужный)
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
