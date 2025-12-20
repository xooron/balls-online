const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#FF416C', '#00d2ff', '#00ff88', '#ffcc00', '#ff00ff', '#ffffff', '#ffa500', '#007bff'];
let nextId = 1;
let gameState = {
    players: [],
    bank: 0,
    timeLeft: 15,
    status: 'WAITING',
    luckyBlock: null
};

function resetGame() {
    gameState.players = [];
    gameState.bank = 0;
    gameState.timeLeft = 15;
    gameState.status = 'WAITING';
    gameState.luckyBlock = null;
    io.emit('reset_game');
}

setInterval(() => {
    if (gameState.players.length < 2 && gameState.status !== 'FLYING') {
        gameState.status = 'WAITING';
        gameState.timeLeft = 15;
    } else if (gameState.status === 'WAITING') {
        gameState.status = 'BETTING';
    }

    if (gameState.status === 'BETTING') {
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
            gameState.status = 'FLYING';
            // Генерируем случайную позицию старта и Lucky Block
            const startPos = { x: 50 + Math.random() * 200, y: 50 + Math.random() * 200 };
            const lb = Math.random() > 0.3 ? { x: 50 + Math.random() * 200, y: 50 + Math.random() * 200 } : null;
            gameState.luckyBlock = lb;
            
            io.emit('start_aiming', { pos: startPos, luckyBlock: lb });

            setTimeout(() => {
                const angle = Math.random() * Math.PI * 2;
                io.emit('launch_ball', { angle: angle });
            }, 3000);

            setTimeout(resetGame, 18000);
        }
    }
    io.emit('sync', gameState);
}, 1000);

io.on('connection', (socket) => {
    socket.emit('assign_id', nextId++);

    socket.on('bet', (data) => {
        if (gameState.status === 'FLYING') return;
        let p = gameState.players.find(x => x.uid === data.uid);
        if (p) { p.bet += data.bet; } 
        else {
            gameState.players.push({ ...data, color: COLORS[gameState.players.length % COLORS.length] });
        }
        gameState.bank += data.bet;
        io.emit('sync', gameState);
    });

    socket.on('admin_add_bot', () => {
        const botId = 'bot' + Math.floor(Math.random() * 100);
        const bet = Math.floor(Math.random() * 100) + 10;
        gameState.players.push({
            uid: botId,
            name: "🤖 Бот " + botId,
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${botId}`,
            bet: bet,
            color: COLORS[gameState.players.length % COLORS.length]
        });
        gameState.bank += bet;
        io.emit('sync', gameState);
    });
});

http.listen(3000, () => console.log('Server started on port 3000'));
