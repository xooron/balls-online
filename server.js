const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#FF416C', '#00d2ff', '#00ff88', '#ffcc00', '#ff00ff', '#ffffff', '#ffa500', '#007bff'];

let gameState = {
    players: [],
    bank: 0,
    timeLeft: 15,
    status: 'WAITING',
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

            // Очистка через 12 секунд (время полета + пауза)
            setTimeout(() => {
                gameState.players = [];
                gameState.bank = 0;
                gameState.timeLeft = 15;
                gameState.status = 'WAITING';
                io.emit('reset_game');
            }, 12000);
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
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server started on port ${PORT}`));

