const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore, DisconnectReason } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs');
const path = require('path');

// Gunakan folder auth_info untuk menyimpan sesi login
const authFolder = './auth_info';

// Inisialisasi penyimpanan log
const store = makeInMemoryStore({ logger: Pino().child({ level: 'debug', stream: 'store' }) });
store?.readFromFile(path.join(authFolder, 'baileys_store.json'));

// Simpan log secara berkala
setInterval(() => {
    store?.writeToFile(path.join(authFolder, 'baileys_store.json'));
}, 10_000);

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: Pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Bot DailyWorker', 'Chrome', '1.0.0']
    });

    store.bind(sock.ev);

    // Event pesan masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            const msg = messages[0];
            const sender = msg.key.remoteJid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

            console.log('Pesan masuk:', text);

            // Contoh respon otomatis
            if (text.toLowerCase().includes('halo')) {
                await sock.sendMessage(sender, { text: 'Hai! Ada yang bisa saya bantu?' });
            }
        }
    });

    // Event koneksi
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus. Reconnect...', shouldReconnect);
            if (shouldReconnect) startSock();
        } else if (connection === 'open') {
            console.log('✅ Terhubung ke WhatsApp!');
        }
    });

    // Simpan kredensial saat ada perubahan
    sock.ev.on('creds.update', saveCreds);
}

startSock();

