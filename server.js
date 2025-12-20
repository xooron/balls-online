<script>
    const socket = io();
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // Аккаунт
    let user = JSON.parse(localStorage.getItem('balls_user')) || {
        uid: Math.floor(100000 + Math.random() * 900000).toString(),
        name: 'Player' + Math.floor(Math.random()*999),
        avatar: 'https://i.pravatar.cc/100?u=' + Math.random(),
        balance: 500.0
    };

    let bank = 0, players = [], state = 'BETTING', timeLeft = 15, selAmt = 0;
    let ball = { x: 165, y: 165, vx: 0, vy: 0, r: 8 };
    let startTime = 0;
    let images = {}; 
    let winProcessed = false; // Флаг, чтобы окно показывалось только 1 раз за раунд

    function saveAccount() { localStorage.setItem('balls_user', JSON.stringify(user)); }
    
    function loadProfileInputs() {
        document.getElementById('p-name').value = user.name;
        document.getElementById('p-ava').value = user.avatar;
        document.getElementById('p-preview').src = user.avatar;
        document.getElementById('p-uid').innerText = user.uid;
        document.getElementById('bal-val').innerText = user.balance.toFixed(1);
    }

    // --- СОКЕТЫ ---
    socket.on('sync', (gs) => {
        bank = gs.bank; players = gs.players; timeLeft = gs.timeLeft; state = gs.status;
        document.getElementById('status-txt').innerText = state;
        updateUI();
    });

    socket.on('start_game', (data) => {
        closeWin(); // Закрываем окно при старте новой игры
        winProcessed = false; // Сбрасываем флаг для нового раунда
        state = 'FLYING'; 
        startTime = Date.now();
        ball.x = 165; ball.y = 165;
        ball.vx = Math.cos(data.angle) * 28;
        ball.vy = Math.sin(data.angle) * 28;
    });

    socket.on('reset_game', () => {
        closeWin(); // Закрываем окно, когда сервер сбрасывает игру
        state = 'BETTING'; 
        ball.vx = 0; ball.vy = 0; ball.x = 165; ball.y = 165;
        winProcessed = false;
    });

    // --- ФУНКЦИИ ---
    function closeWin() {
        document.getElementById('win-overlay').style.display = 'none';
    }

    function updateUI() {
        document.getElementById('bank-val').innerText = bank.toFixed(2);
        document.getElementById('timer').innerText = timeLeft;
        document.getElementById('bal-val').innerText = user.balance.toFixed(1);
        const list = document.getElementById('p-list');
        list.innerHTML = players.sort((a,b)=>b.bet-a.bet).map(p => `
            <div class="p-item">
                <span style="color:${p.color}">● ${p.name} <small style="color:#555">(${(p.bet/bank*100).toFixed(1)}%)</small></span>
                <b>${p.bet} TON</b>
            </div>
        `).join('');
        document.getElementById('bet-confirm').disabled = (state !== 'BETTING');
    }

    function confirmBet() {
        if(selAmt <= 0 || user.balance < selAmt || state !== 'BETTING') return;
        user.balance -= selAmt;
        socket.emit('bet', { uid: user.uid, name: user.name, avatar: user.avatar, bet: selAmt });
        saveAccount();
        selAmt = 0;
        updateUI();
    }

    function draw() {
        ctx.clearRect(0, 0, 330, 330);
        if (bank > 0) {
            let currentA = 0;
            players.forEach(p => {
                const slice = (p.bet / bank) * (Math.PI * 2);
                ctx.beginPath(); ctx.moveTo(165, 165);
                ctx.arc(165, 165, 500, currentA, currentA + slice);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
                currentA += slice;
            });
        }

        if (state === 'FLYING') {
            ball.x += ball.vx; ball.y += ball.vy;
            // Отскоки от стенок квадрата
            if (ball.x <= ball.r || ball.x >= 330 - ball.r) { ball.vx *= -1; ball.x = ball.x <= ball.r ? ball.r : 330 - ball.r; }
            if (ball.y <= ball.r || ball.y >= 330 - ball.r) { ball.vy *= -1; ball.y = ball.y <= ball.r ? ball.r : 330 - ball.r; }
            ball.vx *= 0.994; ball.vy *= 0.994;

            ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
            ctx.fillStyle = '#fff'; ctx.fill();

            if (Date.now() - startTime > 10000 && !winProcessed) {
                showWinner();
            }
        } else {
            ctx.beginPath(); ctx.arc(165, 165, ball.r, 0, Math.PI*2);
            ctx.fillStyle = '#fff'; ctx.fill();
        }
        requestAnimationFrame(draw);
    }

    function showWinner() {
        winProcessed = true; // Помечаем, что победитель определен
        state = 'END';
        let angle = Math.atan2(ball.y - 165, ball.x - 165);
        if (angle < 0) angle += Math.PI * 2;
        
        let currentA = 0;
        let winner = players[0];
        for(let p of players) {
            let slice = (p.bet / bank) * (Math.PI * 2);
            if(angle >= currentA && angle <= currentA + slice) { winner = p; break; }
            currentA += slice;
        }

        if(winner && winner.uid === user.uid) {
            user.balance += bank;
            saveAccount();
        }

        if(winner) {
            document.getElementById('win-overlay').style.display = 'flex';
            document.getElementById('win-img').src = winner.avatar;
            document.getElementById('win-name').innerText = winner.name;
            document.getElementById('win-sum').innerText = `+${bank.toFixed(2)} TON`;
        }
        updateUI();
    }

    function selectChip(amt) {
        if(state !== 'BETTING') return;
        selAmt = amt;
        document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', parseInt(c.innerText) === amt));
    }

    function saveProfile() {
        user.name = document.getElementById('p-name').value;
        user.avatar = document.getElementById('p-ava').value;
        saveAccount(); loadProfileInputs();
        switchTab('arena');
    }

    function switchTab(tab) {
        const isArena = tab === 'arena';
        document.getElementById('arena-view').style.display = isArena ? 'flex' : 'none';
        document.getElementById('profile-view').style.display = isArena ? 'none' : 'flex';
        document.getElementById('nav-arena').classList.toggle('active', isArena);
        document.getElementById('nav-profile').classList.toggle('active', !isArena);
    }

    loadProfileInputs();
    draw();
</script>
