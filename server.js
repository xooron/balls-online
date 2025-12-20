const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

const COLORS = ['#ff4444', '#00d2ff', '#00ff88', '#ffcc00', '#ff00ff', '#ffffff', '#ffa500', '#8b4513'];

let gameState = {
    players: [],
    bank: 0,
    timeLeft: 15,
    status: 'BETTING',
    winningAngle: 0,
    history: [] // Список прошлых игр
};

setInterval(() => {
    if (gameState.status === 'BETTING') {
        if (gameState.players.length >= 2) {
            gameState.timeLeft--;
            if (gameState.timeLeft <= 0) {
                gameState.status = 'FLYING';
                gameState.winningAngle = Math.random() * Math.PI * 2;
                io.emit('start_game', { angle: gameState.winningAngle });

                setTimeout(() => {
                    // Определяем победителя для истории перед сбросом
                    if (gameState.players.length > 0) {
                        // Эта логика упрощенная, победитель определяется на клиенте, 
                        // но для истории запишем данные последнего раунда
                        // (В идеале расчет победителя должен быть на сервере)
                    }
                    
                    gameState.players = [];
                    gameState.bank = 0;
                    gameState.timeLeft = 15;
                    gameState.status = 'BETTING';
                    io.emit('reset_game');
                }, 18000);
            }
        } else {
            gameState.timeLeft = 15;
        }
    }
    io.emit('sync', gameState);
}, 1000);

io.on('connection', (socket) => {
    socket.on('bet', (data) => {
        if (gameState.status !== 'BETTING') return;
        let p = gameState.players.find(x => x.uid === data.uid);
        if (p) { p.bet += data.bet; } 
        else {
            gameState.players.push({
                uid: data.uid, name: data.name, avatar: data.avatar,
                bet: data.bet, color: COLORS[gameState.players.length % COLORS.length]
            });
        }
        gameState.bank += data.bet;
        io.emit('sync', gameState);
    });

    // Когда клиент сообщает о победителе, сохраняем в историю
    socket.on('add_history', (data) => {
        gameState.history.unshift(data);
        if (gameState.history.length > 10) gameState.history.pop();
        io.emit('sync', gameState);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server started on port ${PORT}`));
