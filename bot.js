const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('ربات روشن است'));
app.listen(PORT, () => console.log(`✅ سرور برای Render روی پورت ${PORT} روشن شد`));

const BOT_TOKEN = process.env.BOT_TOKEN || '8911805153:AAEqhg6kFwwxKaSornH8NdrKiiHzc6M2DIc';
const bot = new Telegraf(BOT_TOKEN);
const ALLOWED_USERS = [6576195533];

// ======== آمار ========
const STATS_FILE = 'stats.json';
let stats = { total: 0, approved: 0, declined: 0, startTime: Date.now() };

function loadStats() {
    try { return JSON.parse(fs.readFileSync(STATS_FILE)); } 
    catch { return { total: 0, approved: 0, declined: 0, startTime: Date.now() }; }
}
function saveStats(s) { fs.writeFileSync(STATS_FILE, JSON.stringify(s)); }
stats = loadStats();

function isAuthorized(ctx) {
    if (!ALLOWED_USERS.includes(ctx.from.id)) {
        ctx.reply('⛔ دسترسی غیرمجاز');
        return false;
    }
    return true;
}

// ======== تولید کارت ========
function generateCards(bin, count = 5) {
    const cards = [];
    for (let i = 0; i < count; i++) {
        let randomPart = Math.floor(Math.random() * 1e9).toString().padStart(9, '0');
        let num = bin + randomPart;
        let sum = 0;
        for (let j = 0; j < num.length; j++) {
            let digit = parseInt(num[j]);
            if ((num.length - j) % 2 === 0) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        cards.push({
            number: num + checkDigit,
            expiry: `${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}/${String(Math.floor(Math.random() * 5) + 2026)}`,
            cvc: String(Math.floor(Math.random() * 900) + 100)
        });
    }
    return cards;
}

// ======== تست کارت ========
async function testCard(card) {
    try {
        const response = await axios.post(
            'https://api.stripe.com/v1/tokens',
            `card[number]=${card.number}&card[exp_month]=${card.expiry.split('/')[0]}&card[exp_year]=${card.expiry.split('/')[1]}&card[cvc]=${card.cvc}`,
            {
                headers: {
                    'Authorization': 'Bearer pk_test_4eC39HqLyjWDarjtT1zdp7dc',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            }
        );
        return { status: 'approved', code: 'APPROVED' };
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        let code = 'DECLINED';
        if (msg.includes('insufficient_funds')) code = 'INSUFFICIENT_FUNDS';
        else if (msg.includes('card_declined')) code = 'CARD_DECLINED';
        return { status: 'declined', code: code };
    }
}

// ======== اطلاعات BIN ========
async function getBinInfo(bin) {
    try {
        const res = await axios.get(`https://binlist.net/json/${bin}`);
        return res.data;
    } catch {
        return null;
    }
}

// ======== دستورات ========
bot.start((ctx) => {
    if (!isAuthorized(ctx)) return;
    ctx.reply(
        '/start Initialize the bot\n' +
        '/sh Shopify Check Cards\n' +
        '/gen [BIN] [تعداد] - Generate Cards\n' +
        '/stats - Statistics'
    );
});

bot.command('gen', async (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    const bin = args[1];
    const count = parseInt(args[2]) || 5;
    if (!bin || bin.length < 6) return ctx.reply('⚠️ BIN ۶ رقمی وارد کن.');
    const cards = generateCards(bin, count);
    let reply = `🔹 ${cards.length} کارت از BIN ${bin}:\n\n`;
    cards.forEach((c) => {
        reply += `${c.number}|${c.expiry.split('/')[0]}|${c.expiry.split('/')[1]}|${c.cvc}\n`;
    });
    ctx.reply(reply);
});

bot.command('sh', async (ctx) => {
    if (!isAuthorized(ctx)) return;
    const parts = ctx.message.text.split(' ')[1]?.split('|');
    if (!parts || parts.length !== 4) {
        return ctx.reply(
            'usage.exe\n' +
            '/sh [cc_line]\n' +
            '/sh [multiline_ccs]\n\n' +
            'missing input. system locked.'
        );
    }

    const card = {
        number: parts[0],
        expiry: `${parts[1]}/${parts[2]}`,
        cvc: parts[3]
    };

    stats.total++;
    const result = await testCard(card);
    if (result.status === 'approved') stats.approved++;
    else stats.declined++;
    saveStats(stats);

    const binInfo = await getBinInfo(card.number.substring(0, 6));
    const country = binInfo?.country?.name || 'UNKNOWN';
    const bank = binInfo?.bank?.name || 'UNKNOWN';

    let reply = `shopify.result\n`;
    reply += `card.data\n`;
    reply += `${card.number}|${parts[1]}|${parts[2]}|${card.cvc}\n`;
    reply += `status: ${result.status}\n`;
    reply += `code: ${result.code}\n`;
    reply += `bin: ${bank}\n`;
    reply += `country: ${country}\n\n`;
    reply += `gate.info\n`;
    reply += `amt: $7.68\n`;
    reply += `site: cr***e.myshopify.com\n\n`;
    reply += `user: ${ctx.from.id}\n`;
    reply += `dev: @your_bot`;

    ctx.reply(reply);
});

bot.command('stats', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const elapsed = ((Date.now() - stats.startTime) / 1000);
    const timeStr = new Date(elapsed * 1000).toISOString().substr(11, 8);
    const rate = stats.total ? ((stats.approved / stats.total) * 100).toFixed(1) : 0;
    ctx.reply(`stats.info\ntotal: ${stats.total}\napproved: ${stats.approved} (${rate}%)\ndeclined: ${stats.declined}\nelapsed: ${timeStr}`);
});

bot.launch()
    .then(() => console.log('🚀 ربات روشن شد'))
    .catch((err) => console.error('❌ خطا:', err));
