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
    status: 'WAITING', // WAITING, BETTING, FLYING
    history: []
};

setInterval(() => {
    if (gameState.players.length < 2) {
        gameState.status = 'WAITING';
        gameState.timeLeft = 15;
    } else if (gameState.status === 'WAITING') {
        gameState.status = 'BETTING';
    }

    if (gameState.status === 'BETTING') {
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
            gameState.status = 'FLYING';
            const angle = Math.random() * Math.PI * 2;
            io.emit('start_game', { angle: angle });

            setTimeout(() => {
                gameState.players = [];
                gameState.bank = 0;
                gameState.timeLeft = 15;
                gameState.status = 'WAITING';
                io.emit('reset_game');
            }, 15000); // 15 секунд на полет и показ победителя
        }
    }
    io.emit('sync', gameState);
}, 1000);

io.on('connection', (socket) => {
    socket.on('bet', (data) => {
        if (gameState.status === 'FLYING') return;
        let p = gameState.players.find(x => x.uid === data.uid);
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
    });

    socket.on('add_history', (data) => {
        gameState.history.unshift(data);
        if (gameState.history.length > 10) gameState.history.pop();
        io.emit('sync', gameState);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server started on port ${PORT}`));

