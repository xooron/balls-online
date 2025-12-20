const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios'); // Нужно установить: npm install axios

app.use(express.static(__dirname));

const BOT_TOKEN = '8593275304:AAGFWnHOBheYkC4DkKtu0Q-xteKI42fTIPw'; // ВСТАВЬТЕ СЮДА ТОКЕН
const CHANNEL_ID = '@xoronft'; 
const COLORS = ['#FF0000', '#0070FF', '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500'];
const CANVAS_SIZE = 320;
const BALL_RADIUS = 10;

let game = {
    players: [],
    bank: 0,
    status: 'WAITING',
    timer: 0,
    ball: { x: 160, y: 160, vx: 0, vy: 0 },
    arrowAngle: 0,
    winner: null,
    online: 0,
    messages: []
};

// Функция проверки подписки через API Telegram
async function checkSubscription(userId) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${CHANNEL_ID}&user_id=${userId}`;
        const response = await axios.get(url);
        const status = response.data.result.status;
        return ['member', 'administrator', 'creator'].includes(status);
    } catch (error) {
        console.error('Ошибка проверки подписки:', error);
        return false;
    }
}

// ... (Тут остается логика движения шара и расчета территорий из прошлого ответа) ...
// Добавим только обработку проверки подписки в сокеты

io.on('connection', (socket) => {
    // Проверка подписки по запросу клиента
    socket.on('verify_sub', async (data) => {
        const isSubbed = await checkSubscription(data.userId);
        socket.emit('sub_status', { isSubbed });
    });

    socket.on('bet', async (data) => {
        // Дополнительная проверка на сервере перед ставкой
        const isSubbed = await checkSubscription(data.id); 
        if (!isSubbed) return;

        if (game.status !== 'WAITING' && game.status !== 'COUNTDOWN') return;
        let p = game.players.find(x => x.uid === data.uid);
        if (p) p.bet += data.bet;
        else game.players.push({ ...data, color: COLORS[game.players.length % COLORS.length] });
        game.bank += data.bet;
        calculateTerritories();
    });

    // ... (Остальной код чата и админки) ...
});
// (Не забудьте скопировать функции движения шара и таймеры из предыдущего кода!)
