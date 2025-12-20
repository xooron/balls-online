const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const COLORS = ['#ff4444', '#00d2ff', '#00ff88', '#ffcc00', '#ff00ff', '#ffffff', '#ffa500', '#8b4513'];
let nextId = 1;

let gameState = {
    players: [],
    bank: 0,
    timeLeft: 15,
    status: 'WAITING',
    luckyBlock: null
};

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
            const startPos = { x: 50 + Math.random() * 220, y: 50 + Math.random() * 220 };
            const lb = Math.random() > 0.4 ? { x: 50 + Math.random() * 220, y: 50 + Math.random() * 220 } : null;
            gameState.luckyBlock = lb;
            
            io.emit('start_aiming', { pos: startPos, luckyBlock: lb });

            setTimeout(() => {
                io.emit('launch_ball');
            }, 3000);

            setTimeout(() => {
                gameState.players = [];
                gameState.bank = 0;
                gameState.timeLeft = 15;
                gameState.status = 'WAITING';
                gameState.luckyBlock = null;
                io.emit('reset_game');
            }, 16000);
        }
    }
    io.emit('sync', gameState);
}, 1000);

io.on('connection', (socket) => {
    socket.emit('init_auth', { id: nextId++ });

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

    socket.on('admin_action', (type) => {
        if (type === 'bot') {
            const bid = 'bot' + Math.floor(Math.random()*99);
            gameState.players.push({
                uid: bid, name: "🤖 BOT "+bid, bet: 50, color: COLORS[gameState.players.length % COLORS.length], 
                avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed='+bid
            });
            gameState.bank += 50;
        }
        io.emit('sync', gameState);
    });
});

http.listen(3000, () => console.log('Server running on port 3000'));
