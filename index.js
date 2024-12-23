require('./settings');
const fs = require('fs');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const figlet = require('figlet');
const FileType = require('file-type');
const { exec } = require('child_process');
const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');
const PhoneNumber = require('awesome-phonenumber');
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason, makeInMemoryStore, makeCacheableSignalKeyStore, proto } = require('@whiskeysockets/baileys');

const phoneNumber = "6285174197856"; // Masukkan nomor telepon di sini
const pairingCode = false; // Tidak memerlukan pairing code
const useMobile = false; // Tidak menggunakan mode mobile

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
let owner = JSON.parse(fs.readFileSync('./src/owner.json'));

// API for autoresponse
global.api = (name, path = '/', query = {}, apikeyqueryname) => (name in global.APIs ? global.APIs[name] : name) + path + (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({ ...query, ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {}) })) : '');

const DataBase = require('./src/database');
const database = new DataBase();

(async () => {
    const loadData = await database.read();
    if (loadData && Object.keys(loadData).length === 0) {
        global.db = {
            sticker: {},
            users: {},
            groups: {},
            database: {},
            settings: {},
            others: {},
            ...(loadData || {}),
        };
        await database.write(global.db);
    } else {
        global.db = loadData;
    }

    setInterval(async () => {
        if (global.db) await database.write(global.db);
    }, 30000);
})();

const { GroupUpdate, GroupParticipantsUpdate, MessagesUpsert, Solving } = require('./src/message');
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif');
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, sleep } = require('./lib/function');

console.log(chalk.cyan(figlet.textSync("XLICON-V4", {
    font: 'DOS Rebel',
    horizontalLayout: 'default',
    verticalLayout: 'default',
    width: 60,
    whitespaceBreak: false
})));

console.log(chalk.white.bold(`${chalk.gray.bold("📃  Information :")}         
✉️  Script : XLICON-V4-MD
✉️  Author : SALMAN AHMAD
✉️  Gmail : salmansheikh2500@gmail.com
✉️  Instagram : ahmmikun

${chalk.green.bold("Powered By XLICON BOTZ")}\n`));

// Start XliconBot
async function startXliconBot() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    const msgRetryCounterCache = new NodeCache();
    
    const XliconBotInc = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !pairingCode,
        browser: Browsers.windows('Firefox'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        version: [2, 3000, 1015901307],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        msgRetryCounterCache,
    });
   
    store.bind(XliconBotInc.ev);

    XliconBotInc.ev.on('creds.update', saveCreds);

    XliconBotInc.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            switch (reason) {
                case DisconnectReason.connectionLost:
                    console.log('Connection to Server Lost, Attempting to Reconnect...');
                    startXliconBot();
                    break;
                case DisconnectReason.connectionClosed:
                    console.log('Connection closed, Attempting to Reconnect...');
                    startXliconBot();
                    break;
                case DisconnectReason.restartRequired:
                    console.log('Restart Required...');
                    startXliconBot();
                    break;
                case DisconnectReason.timedOut:
                    console.log('Connection Timed Out, Attempting to Reconnect...');
                    startXliconBot();
                    break;
                case DisconnectReason.badSession:
                    console.log('Delete Session and Scan again...');
                    process.exit(1);
                    break;
                default:
                    console.log('Unknown DisconnectReason:', reason);
            }
        } else if (connection === 'open') {
            console.log('Connected to:', JSON.stringify(XliconBotInc.user, null, 2));
        }
    });
    
    XliconBotInc.ev.on('contacts.update', (update) => {
        for (let contact of update) {
            const id = XliconBotInc.decodeJid(contact.id);
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
        }
    });
    
    XliconBotInc.ev.on('call', async (call) => {
        let botNumber = await XliconBotInc.decodeJid(XliconBotInc.user.id);
        let anticall = global.db.settings[botNumber].anticall;
        if (anticall) {
            for (let id of call) {
                if (id.status === 'offer') {
                    let msg = await XliconBotInc.sendMessage(id.from, { text: `Currently, We Cannot Receive Calls ${id.isVideo ? 'Video' : 'Voice'}.\nIf @${id.from.split('@')[0]} Needs Help, Please Contact Owner :)`, mentions: [id.from] });
                    await XliconBotInc.sendContact(id.from, global.owner, msg);
                    await XliconBotInc.rejectCall(id.id, id.from);
                }
            }
        }
    });

// Auto-Welcome and Auto-Bye Feature with API-generated images
XliconBotInc.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;
    for (let participant of participants) {
        try {
            const groupMetadata = await XliconBotInc.groupMetadata(id);
            const groupName = groupMetadata.subject;
            const groupDesc = groupMetadata.desc || "No description available";
            const participantName = participant.split('@')[0];
            const memberCount = groupMetadata.participants.length;

            // Get profile pictures
            const ppGroup = await XliconBotInc.profilePictureUrl(id, 'image').catch(() => 'https://tse4.mm.bing.net/th?id=OIP.JjURR9U0gcrqneGYVyG27wHaEn&pid=Api&P=0&h=180');
            const ppUser = await XliconBotInc.profilePictureUrl(participant, 'image').catch(() => 'https://tse4.mm.bing.net/th?id=OIP.JjURR9U0gcrqneGYVyG27wHaEn&pid=Api&P=0&h=180');

            if (action === 'add') {
                // Welcome message
                const welcomeText = `HALO @${participantName} selamat datang di grup ${groupName} semoga betah dan jangan lupa patuhi DESKRIPSI\n\nDESKRIPSI:\n${groupDesc}\n\nHELLO @${participantName} welcome to the group ${groupName} hope you feel at home and don't forget to follow the DESCRIPTION`;

                // Generate welcome image using the new API
                const welcomeImageUrl = `https://api.chiwa.id/api/welcome?apikey=727e3dd0ce1b949efc3a3203f7766d79&img1=${encodeURIComponent(ppUser)}&img2=${encodeURIComponent(ppGroup)}&background=https://i.ibb.co/8B6Q84n/LTqHsfYS.jpg&username=${encodeURIComponent(participantName)}&member=${encodeURIComponent(memberCount)}&groupname=${encodeURIComponent(groupName)}`;

                // Send the welcome message with the generated image
                await XliconBotInc.sendMessage(id, {
                    image: { url: welcomeImageUrl },
                    caption: welcomeText,
                    mentions: [participant]
                });
            } else if (action === 'remove') {
                // Goodbye message
                const goodbyeText = `BYE @${participantName} 👋`;
            
                // Use the user's profile picture or the default image
                const goodbyeImageUrl = ppUser !== 'https://tse4.mm.bing.net/th?id=OIP.JjURR9U0gcrqneGYVyG27wHaEn&pid=Api&P=0&h=180' 
                    ? ppUser 
                    : 'https://images3.alphacoders.com/131/thumbbig-1319293.webp';
            
                // Send the goodbye message with the profile picture or default image
                await XliconBotInc.sendMessage(id, {
                    image: { url: goodbyeImageUrl },
                    caption: goodbyeText,
                    mentions: [participant]
                });
            }
        } catch (err) {
            console.error('Error in welcome/goodbye feature:', err);
        }
    }
});




    // Handle messages and autoresponse
    XliconBotInc.ev.on('messages.upsert', async (message) => {
        const msgContent = message.messages[0].text;
        if (msgContent) {
            const response = await getAutoresponse(msgContent);
            XliconBotInc.sendMessage(message.messages[0].key.remoteJid, { text: response });
        }
        await MessagesUpsert(XliconBotInc, message, store);
    });

    return XliconBotInc;
}

startXliconBot();
