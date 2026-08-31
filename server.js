const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Data State Game dengan Leaderboard & Poin
let gameState = {
    ropePosition: 50, // 50% (posisi tengah)
    currentQuestion: 0,
    players: {
        p1: null,
        p2: null
    },
    scores: {
        p1: { wins: 0, points: 0, name: "Tim Merah" },
        p2: { wins: 0, points: 0, name: "Tim Hijau" }
  }
};

const questions = [
    { q: "Tahun berapa Indonesia merdeka?", opts: ["1942", "1945", "1950", "1928"], ans: 1 },
    { q: "Siapa Proklamator Kemerdekaan Indonesia?", opts: ["Soekarno-Hatta", "Sjahrir", "Jendral Soedirman", "Kartini"], ans: 0 },
    { q: "Apa warna bendera negara Indonesia?", opts: ["Merah Biru", "Merah Putih", "Putih Merah", "Kuning Hijau"], ans: 1 },
    { q: "Lagu kebangsaan Indonesia adalah...", opts: ["Garuda Pancasila", "Indonesia Raya", "Bagimu Negeri", "Hari Merdeka"], ans: 1 },
    { q: "Burung yang menjadi lambang negara adalah...", opts: ["Elang Jawa", "Merpati", "Garuda", "Rajawali"], ans: 2 }
];

io.on('connection', (socket) => {
    console.log('User terhubung:', socket.id);

    socket.on('join_role', (role) => {
        if (role === 'p1' && !gameState.players.p1) {
            gameState.players.p1 = socket.id;
            socket.emit('assigned_team', { team: 'p1', name: 'Tim Merah (Kiri)' });
        } else if (role === 'p2' && !gameState.players.p2) {
            gameState.players.p2 = socket.id;
            socket.emit('assigned_team', { team: 'p2', name: 'Tim Hijau (Kanan)' });
        }

        // Broadcast data awal lengkap dengan skor
        io.emit('update_game', {
            ropePosition: gameState.ropePosition,
            question: questions[gameState.currentQuestion],
            scores: gameState.scores
        });
    });

    socket.on('submit_answer', (data) => {
        // Abaikan jika game sudah ada pemenang sebelum di-reset
        let currentWinner = null;
        if (gameState.ropePosition <= 20) currentWinner = "p1";
        if (gameState.ropePosition >= 80) currentWinner = "p2";
        if (currentWinner) return;

        const qData = questions[gameState.currentQuestion];
        const isCorrect = data.answerIndex === qData.ans;

        if (isCorrect) {
            if (data.team === 'p1') {
                gameState.ropePosition -= 10;
                gameState.scores.p1.points += 10; // Tambah 10 poin tiap benar
            }
            if (data.team === 'p2') {
                gameState.ropePosition += 10;
                gameState.scores.p2.points += 10; // Tambah 10 poin tiap benar
            }
        } else {
            // Hukuman kalau salah: ditarik lawan 5%
            if (data.team === 'p1') gameState.ropePosition += 5;
            if (data.team === 'p2') gameState.ropePosition -= 5;
        }

        // Cek Pemenang Ronde (Batas tarik 20% kiri atau 80% kanan)
        let winnerName = null;
        if (gameState.ropePosition <= 20) {
            winnerName = gameState.scores.p1.name;
            gameState.scores.p1.wins += 1;
            gameState.scores.p1.points += 50; // Bonus 50 poin jika menang ronde
        } else if (gameState.ropePosition >= 80) {
            winnerName = gameState.scores.p2.name;
            gameState.scores.p2.wins += 1;
            gameState.scores.p2.points += 50; // Bonus 50 poin jika menang ronde
        }

        if (!winnerName) {
            gameState.currentQuestion = (gameState.currentQuestion + 1) % questions.length;
        }

        io.emit('update_game', {
            ropePosition: gameState.ropePosition,
            question: questions[gameState.currentQuestion],
            winner: winnerName,
            scores: gameState.scores
        });
    });

    // Reset Ronde (Posisi tali & kuis kembali ke awal, skor TETAP disimpan)
    // Biasanya dipanggil SETELAH ada pemenang, lewat tombol "RONDE SELANJUTNYA"
    socket.on('restart_game', () => {
        gameState.ropePosition = 50;
        gameState.currentQuestion = 0;
        io.emit('update_game', {
            ropePosition: gameState.ropePosition,
            question: questions[gameState.currentQuestion],
            winner: null,
            scores: gameState.scores
        });
    });

    // === BARU ===
    // Reset Ronde PAKSA oleh Admin — bisa dipanggil KAPAN SAJA
    // baik game masih berjalan maupun sudah ada pemenang. Skor & wins TETAP.
    socket.on('force_reset_round', () => {
        gameState.ropePosition = 50;
        // currentQuestion sengaja TIDAK direset ke 0 secara default,
        // supaya soal lanjut dari posisi terakhir.
        // Kalau mau soal juga balik ke awal saat reset paksa, uncomment baris ini:
        // gameState.currentQuestion = 0;

        io.emit('update_game', {
            ropePosition: gameState.ropePosition,
            question: questions[gameState.currentQuestion],
            winner: null,
            scores: gameState.scores
        });

        console.log('Ronde direset paksa oleh Admin.');
    });

    // Reset Total Skor (Untuk ganti pertandingan/peserta baru)
    socket.on('reset_scores', () => {
        gameState.ropePosition = 50;
        gameState.currentQuestion = 0;
        gameState.scores.p1.wins = 0;
        gameState.scores.p1.points = 0;
        gameState.scores.p2.wins = 0;
        gameState.scores.p2.points = 0;
        io.emit('update_game', {
            ropePosition: gameState.ropePosition,
            question: questions[gameState.currentQuestion],
            winner: null,
            scores: gameState.scores
        });
    });

    socket.on('disconnect', () => {
        if (socket.id === gameState.players.p1) gameState.players.p1 = null;
        if (socket.id === gameState.players.p2) gameState.players.p2 = null;
    });
});

server.listen(3000, () => {
    console.log('Server berjalan di http://localhost:3000');
});
