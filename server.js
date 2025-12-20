const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#00d2ff', '#00ff88', '#ffcc00', '#ff4444', '#ff00ff', '#ffffff'];

let gameState = {
    players: [],
    bank: 0,
    timeLeft: 10,
    status: 'WAITING' // WAITING, BETTING, FLYING
};

// Игровой цикл
setInterval(() => {
    if (gameState.status === 'WAITING' && gameState.players.length >= 1) {
        gameState.status = 'BETTING';
        gameState.timeLeft = 10;
    }

    if (gameState.status === 'BETTING') {
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
            gameState.status = 'FLYING';
            const startPos = { x: 100 + Math.random() * 140, y: 100 + Math.random() * 140 };
            io.emit('start_aiming', { pos: startPos });

            setTimeout(() => {
                io.emit('launch_ball');
            }, 3000);

            // Ресет через 12 секунд после запуска
            setTimeout(() => {
                gameState.players = [];
                gameState.bank = 0;
                gameState.status = 'WAITING';
                io.emit('reset_game');
            }, 15000);
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
                ...data, 
                color: COLORS[gameState.players.length % COLORS.length] 
            });
        }
        gameState.bank += data.bet;
        io.emit('sync', gameState);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server started on port ' + PORT));
