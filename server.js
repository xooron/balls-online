const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#FF3B30', '#007AFF', '#34C759', '#FFCC00', '#AF52DE', '#FF9500', '#5AC8FA'];

let gameState = {
    players: [],
    bank: 0,
    timeLeft: 15,
    status: 'WAITING' 
};

// Логика игры
setInterval(() => {
    if (gameState.status === 'WAITING' && gameState.players.length >= 1) {
        gameState.status = 'BETTING';
        gameState.timeLeft = 15;
    }

    if (gameState.status === 'BETTING') {
        gameState.timeLeft--;
        
        // Добавляем случайного бота для теста, если игроков мало
        if (gameState.timeLeft === 10 && gameState.players.length < 2) {
            const botId = Math.floor(Math.random()*1000);
            gameState.players.push({
                uid: 'bot_'+botId,
                name: '🤖 Bot_' + botId,
                avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${botId}`,
                bet: 50,
                color: COLORS[gameState.players.length % COLORS.length]
            });
            gameState.bank += 50;
        }

        if (gameState.timeLeft <= 0) {
            gameState.status = 'FLYING';
            const startPos = { x: 50 + Math.random() * 220, y: 50 + Math.random() * 220 };
            io.emit('start_aiming', { pos: startPos });

            setTimeout(() => { io.emit('launch_ball'); }, 3000);

            setTimeout(() => {
                gameState.players = [];
                gameState.bank = 0;
                gameState.status = 'WAITING';
                io.emit('reset_game');
            }, 16000);
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
    });
});

http.listen(3000, () => console.log('Server running on port 3000'));
