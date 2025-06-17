const baileys = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const Pino = require('pino');
const fs = require('fs');

// Load config
const config = JSON.parse(fs.readFileSync('./config.json'));

// Status
let isBotActive = true;
try {
    const data = JSON.parse(fs.readFileSync('./status.json'));
    isBotActive = data.aktif ?? true;
} catch { isBotActive = true; }

// Fungsi ubah status
function setActive(status) {
    isBotActive = status;
    fs.writeFileSync('./status.json', JSON.stringify({ aktif: status }, null, 2));
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
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'open') {
            console.log('✅ Bot siap!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', ({ type, messages }) => {
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

            // Admin control
            if (config.admins.includes(sender)) {
                if (text === 'bot on') {
                    setActive(true);
                    sock.sendMessage(from, { text: '✅ Bot diaktifkan oleh admin.' });
                    continue;
                }
                if (text === 'bot off') {
                    setActive(false);
                    sock.sendMessage(from, { text: '⛔ Bot dinonaktifkan oleh admin.' });
                    continue;
                }
            }

            if (!isBotActive) continue;

            // Pencocokan cepat (prioritaskan exact/startsWith)
            for (const [keyword, reply] of Object.entries(config.keywords)) {
                if (text === keyword || text.startsWith(keyword)) {
                    // Kirim langsung tanpa await
                    sock.sendMessage(from, { text: reply });
                    break;
                }
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = (lastDisconnect?.error)?.output?.statusCode;
            if (reason !== baileys.DisconnectReason.loggedOut) {
                console.log('⚠️ Koneksi terputus. Reconnect...');
                startSock();
            } else {
                console.log('❌ Logout. Hapus auth_info dan scan ulang QR.');
            }
        }
    });
}

startSock();

