const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// ========== توکن ==========
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TOKEN_HERE';
const bot = new Telegraf(BOT_TOKEN);
const ALLOWED_USERS = [6576195533]; // عدد رو با آیدی خودت عوض کن

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
    // ... (کد قبلی)
}

// ========== تست روی Stripe ==========
async function testCardOnStripe(card) {
    // ... (کد قبلی)
}

// ========== نمایش BIN ==========
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

bot.command('hit', async (ctx) => {
    if (!isAuthorized(ctx)) return;
    const parts = ctx.message.text.split(' ')[1]?.split('|');
    if (!parts || parts.length !== 4) return ctx.reply('⚠️ فرمت: /hit شماره|ماه|سال|CVV');

    const card = { number: parts[0], expiry: `${parts[1]}/${parts[2]}`, cvc: parts[3] };
    stats.total++;
    const result = await testCardOnStripe(card);
    if (result.status === 'approved') stats.approved++;
    else stats.declined++;
    saveStats(stats);

    // اطلاعات BIN
    const binInfo = await getBinInfo(card.number.substring(0, 6));
    const country = binInfo?.country?.name || 'UNKNOWN';
    const bank = binInfo?.bank?.name || 'UNKNOWN';

    ctx.replyWithMarkdown(`
✦ *shopify.result* 💠
┌── *card.data*
🔹 \`${card.number}|${parts[1]}|${parts[2]}|${card.cvc}\`
🔹 *status:* \`${result.status === 'approved' ? 'approved ✅' : 'declined ❌'}\`
🔹 *bin:* ${bank}
🔹 *country:* 🇺🇸 ${country}
└──────────────
┌── *gate.info*
🔹 *code:* \`${result.code || 'UNKNOWN'}\`
🔹 *amt:* \`$7.68\`
🔹 *site:* \`cr***e.myshopify.com\`
└──────────────
👤 *user:* ${ctx.from.id}
🏴 *dev:* @your_bot
    `);
});

// ========== اجرا ==========
bot.launch().then(() => console.log('🚀 ربات حرفه‌ای روشن شد'));
