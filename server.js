const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');

app.use(express.static(__dirname));
app.use(express.json());

const BOT_TOKEN = 'ВАШ_ТОКЕН_БОТА'; 
const ADMIN_ID = 1046170668;

const COLORS = ['#FF4757', '#2ED573', '#1E90FF', '#ECCC68', '#70A1FF', '#FF6348', '#00f2fe', '#ffa502', '#ced6e0', '#5352ed'];
const CANVAS_SIZE = 320;
const BALL_RADIUS = 10;
const LUCKY_SIZE = 25; 

let game = {
    players: [], bank: 0, status: 'WAITING', timer: 20,
    ball: { x: 160, y: 160, vx: 0, vy: 0 },
    luckyBlock: { x: 0, y: 0, active: false, type: null }, 
    arrowAngle: 0, winner: null, online: 0, launchTime: 0
};

// --- API ОПЛАТЫ ---
app.post('/create-invoice', async (req, res) => {
    const { userId, tonAmount, starsAmount } = req.body;
    try {
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: `Пополнение ${tonAmount} TON`,
            description: `Пакет валюты для ICE ARENA`,
            payload: JSON.stringify({ uid: userId, amt: tonAmount }),
            provider_token: "", currency: "XTR",
            prices: [{ label: "Купить", amount: starsAmount }]
        });
        res.json(response.data);
    } catch (e) { res.status(500).json({ error: "Ошибка" }); }
});

app.post('/webhook', async (req, res) => {
    const update = req.body;
    if (update.pre_checkout_query) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
            pre_checkout_query_id: update.pre_checkout_query.id, ok: true
        });
    }
    if (update.message && update.message.successful_payment) {
        const payload = JSON.parse(update.message.successful_payment.invoice_payload);
        io.emit('payment_done', { uid: payload.uid, amt: payload.amt });
    }
    res.sendStatus(200);
});

// --- ЛОГИКА ИГРЫ ---
function calculateChaosTerritories() {
    if (game.players.length === 0) return;
    let playersToAssign = [...game.players].sort(() => Math.random() - 0.5);
    let curX = 0, curY = 0, curW = CANVAS_SIZE, curH = CANVAS_SIZE;
    let horizontal = Math.random() > 0.5;
    playersToAssign.forEach((p, i) => {
        let totalRemaining = playersToAssign.slice(i).reduce((a, b) => a + b.bet, 0);
        let ratio = p.bet / totalRemaining;
        if (horizontal) {
            let h = curH * ratio; p.rect = { x: curX, y: curY, w: curW, h: h }; curY += h; curH -= h;
        } else {
            let w = curW * ratio; p.rect = { x: curX, y: curY, w: w, h: curH }; curX += w; curW -= w;
        }
        horizontal = !horizontal;
    });
}

function checkLuckyCollision() {
    if (!game.luckyBlock.active) return;
    const dx = game.ball.x - (game.luckyBlock.x + LUCKY_SIZE / 2);
    const dy = game.ball.y - (game.luckyBlock.y + LUCKY_SIZE / 2);
    if (Math.sqrt(dx*dx + dy*dy) < BALL_RADIUS + LUCKY_SIZE / 2) {
        game.luckyBlock.active = false;
        io.emit('lucky_hit', game.luckyBlock.type);
        setTimeout(() => {
            if (game.luckyBlock.type === 'SWAP') calculateChaosTerritories();
            else { game.ball.vx = 0; game.ball.vy = 0; }
            io.emit('sync', game);
        }, 3000);
    }
}

setInterval(() => {
    if (game.status === 'AIMING') game.arrowAngle += 0.12;
    if (game.status === 'FLYING') {
        game.ball.x += game.ball.vx; game.ball.y += game.ball.vy;
        if (game.ball.x <= BALL_RADIUS || game.ball.x >= CANVAS_SIZE - BALL_RADIUS) game.ball.vx *= -0.8;
        if (game.ball.y <= BALL_RADIUS || game.ball.y >= CANVAS_SIZE - BALL_RADIUS) game.ball.vy *= -0.8;
        
        const elapsed = Date.now() - game.launchTime;
        if (elapsed < 11000) { game.ball.vx *= 0.998; game.ball.vy *= 0.998; }
        else if (elapsed < 13000) { game.ball.vx *= 0.92; game.ball.vy *= 0.92; }
        else { game.ball.vx = 0; game.ball.vy = 0; }

        checkLuckyCollision();

        if (elapsed > 12500 && Math.abs(game.ball.vx) < 0.1) {
            game.status = 'WINNER';
            game.winner = game.players.find(p => p.rect && game.ball.x >= p.rect.x && game.ball.x <= p.rect.x + p.rect.w && game.ball.y >= p.rect.y && game.ball.y <= p.rect.y + p.rect.h) || game.players[0];
            setTimeout(() => { game.players = []; game.bank = 0; game.status = 'WAITING'; game.timer = 20; game.luckyBlock.active = false; }, 5000);
        }
    }
    game.online = io.engine.clientsCount;
    io.emit('sync', game);
}, 20);

setInterval(() => {
    if (game.status === 'WAITING' && game.players.length >= 2) { game.status = 'COUNTDOWN'; game.timer = 20; }
    else if (game.status === 'COUNTDOWN') {
        if (game.players.length < 2) game.status = 'WAITING';
        else {
            game.timer--;
            if (game.timer <= 0) {
                game.status = 'SPAWNED';
                game.ball = { x: 60 + Math.random()*200, y: 60 + Math.random()*200, vx: 0, vy: 0 };
                game.luckyBlock = { x: 40+Math.random()*200, y: 40+Math.random()*200, active: true, type: Math.random()>0.5?'SWAP':'STOP' };
                calculateChaosTerritories();
            }
        }
    }
    else if (game.status === 'SPAWNED') setTimeout(() => { if(game.status === 'SPAWNED') game.status = 'AIMING'; }, 2000);
    else if (game.status === 'AIMING') setTimeout(() => {
        if(game.status === 'AIMING') {
            game.status = 'FLYING'; game.launchTime = Date.now();
            const f = 14 + Math.random()*4;
            game.ball.vx = Math.cos(game.arrowAngle)*f; game.ball.vy = Math.sin(game.arrowAngle)*f;
        }
    }, 3000);
}, 1000);

io.on('connection', (socket) => {
    socket.on('bet', (d) => {
        if (game.status !== 'WAITING' && game.status !== 'COUNTDOWN') return;
        let p = game.players.find(x => x.uid === d.uid);
        if (p) p.bet += d.bet; else game.players.push({...d, color: COLORS[game.players.length % COLORS.length]});
        game.bank += d.bet; calculateChaosTerritories();
    });
    socket.on('admin_cmd', (d) => {
        if (d.id !== ADMIN_ID) return;
        if (d.type === 'gift_all') io.emit('admin_gift', 50);
        if (d.type === 'bot') {
            const id = Math.random();
            game.players.push({ uid: 'bot_'+id, name: '🤖 Бот', bet: 1, avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed='+id, color: COLORS[game.players.length % COLORS.length] });
            game.bank += 1; calculateChaosTerritories();
        }
    });
    socket.on('admin_give_target', (d) => {
        if (d.adminId !== ADMIN_ID) return;
        io.emit('payment_done', { uid: d.targetUid, amt: parseFloat(d.amount) });
    });
});

http.listen(process.env.PORT || 3000, () => console.log('ICE ARENA Server Started'));
