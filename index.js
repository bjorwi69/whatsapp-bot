const baileys = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs');
const path = require('path');

// Load config.json
let config = { admins: [], keywords: {} };
try {
    config = JSON.parse(fs.readFileSync('./config.json'));
} catch (e) {
    console.error('❌ config.json tidak ditemukan atau rusak.');
}

// Status aktif
let isBotActive = true;
const statusPath = './status.json';

if (fs.existsSync(statusPath)) {
    try {
        const data = JSON.parse(fs.readFileSync(statusPath));
        isBotActive = data.aktif ?? true;
    } catch {
        isBotActive = true;
    }
}

// Ubah status aktif
function setActive(status) {
    isBotActive = status;
    fs.writeFileSync(statusPath, JSON.stringify({ aktif: status }, null, 2));
}

async function startSock() {
    const { version } = await baileys.fetchLatestBaileysVersion();
    const { state, saveCreds } = await baileys.useMultiFileAuthState('auth_info');

    const sock = baileys.default({
        version,
        logger: Pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('connection.update', ({ connection, qr }) => {
        if (qr) {
            console.log('📱 Scan QR di sini:\n');
            console.log(qr); // log QR code string
        }
        if (connection === 'open') {
            console.log('✅ Bot berhasil terhubung ke WhatsApp!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ type, messages }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;

            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const text = (
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                ''
            ).toLowerCase().trim();

            // Kontrol Admin
            if (config.admins.includes(sender)) {
                if (text === 'bot on') {
                    setActive(true);
                    await sock.sendMessage(from, { text: '✅ Bot diaktifkan oleh admin.' });
                    continue;
                }
                if (text === 'bot off') {
                    setActive(false);
                    await sock.sendMessage(from, { text: '⛔ Bot dinonaktifkan oleh admin.' });
                    continue;
                }
            }

            if (!isBotActive) continue;

            // Deteksi keyword
            for (const [keyword, reply] of Object.entries(config.keywords)) {
                if (text === keyword || text.startsWith(keyword)) {
                    await sock.sendMessage(from, { text: reply });
                    break;
                }
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log('⚠️ Koneksi terputus. Reconnect...', reason);
            if (reason !== baileys.DisconnectReason.loggedOut) {
                startSock();
            } else {
                console.log('❌ Logout. Hapus auth_info untuk scan ulang QR.');
            }
        }
    });
}

startSock();
