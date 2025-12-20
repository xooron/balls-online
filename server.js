const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const COLORS = ['#ff4444', '#44ff44', '#4444ff', '#ffcc00', '#ff00ff', '#00ffff', '#ffa500', '#8b4513'];

let gameState = {
    players: [],
    bank: 0,
    timeLeft: 15,
    status: 'BETTING', // Состояния: BETTING, FLYING
    winningAngle: 0
};

// Игровой цикл сервера
setInterval(() => {
    if (gameState.status === 'BETTING') {
        // ПРОВЕРКА: Если игроков 2 или больше — запускаем обратный отсчет
        if (gameState.players.length >= 2) {
            gameState.timeLeft--;
            
            if (gameState.timeLeft <= 0) {
                gameState.status = 'FLYING';
                gameState.winningAngle = Math.random() * Math.PI * 2;
                io.emit('start_game', { angle: gameState.winningAngle });
                
                // Время на анимацию полета и показ победителя (18 секунд)
                setTimeout(() => {
                    gameState = { 
                        players: [], 
                        bank: 0, 
                        timeLeft: 15, 
                        status: 'BETTING', 
                        winningAngle: 0 
                    };
                    io.emit('reset_game');
                }, 18000);
            }
        } else {
            // Если игроков меньше 2, держим таймер на 15 секундах
            gameState.timeLeft = 15;
        }
    }
    
    // Отправляем текущее состояние всем клиентам каждую секунду
    io.emit('sync', gameState);
}, 1000);

// Обработка ставок
io.on('connection', (socket) => {
    socket.on('bet', (data) => {
        // Ставки принимаются только в фазе BETTING
        if (gameState.status === 'BETTING') {
            let p = gameState.players.find(player => player.uid === data.uid);
            if (p) {
                // Если игрок уже есть, увеличиваем его ставку
                p.bet += data.bet;
            } else {
                // Если новый игрок, добавляем в список
                gameState.players.push({
                    uid: data.uid,
                    name: data.name,
                    avatar: data.avatar,
                    bet: data.bet,
                    color: COLORS[gameState.players.length % COLORS.length]
                });
            }
            gameState.bank += data.bet;
            
            // Сразу синхронизируем данные после ставки, чтобы все увидели нового игрока
            io.emit('sync', gameState);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(Server started on port ${PORT}));
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server started on port ${PORT}`));

