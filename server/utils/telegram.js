const TelegramBot = require('node-telegram-bot-api');
const pool = require('../config/db');

let botInstance; // to avoid multiple instances

// Get active token from DB
async function getTelegramToken() {
  const [rows] = await pool.execute('SELECT TELEGRAM_API FROM telegram_api WHERE ACTIVE = 1');
  return rows.length > 0 ? rows[0].TELEGRAM_API : null;
}

// Send a message
async function sendTelegramMessage(text, telegramId) {
  const { default: fetch } = await import('node-fetch');
  const token = await getTelegramToken();
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramId, text })
  });
}

// Start bot globally
async function startTelegramBot() {
  const token = await getTelegramToken();
  if (!token) {
    console.error('❌ Telegram bot token not found.');
    return;
  }

  if (botInstance) return; // Don't start twice

  const bot = new TelegramBot(token, { polling: true });
  botInstance = bot;

  console.log('✅ Telegram bot is running...');

  const shownKeyboard = new Set();

  async function sendBalanceToUser(telegramId) {
    const connection = await pool.getConnection();
    try {
      const [accountResults] = await connection.query(`
        SELECT agent.AGENT_CODE, agent.NAME, account.IDNo AS ACCOUNT_ID
        FROM agent
        JOIN account ON account.AGENT_ID = agent.IDNo
        WHERE agent.TELEGRAM_ID = ?
        LIMIT 1
      `, [telegramId]);

      if (accountResults.length === 0) {
        bot.sendMessage(telegramId, '❌ No account linked.');
        return;
      }

      const { AGENT_CODE, NAME, ACCOUNT_ID } = accountResults[0];

      const [ledgerResults] = await connection.query(`
        SELECT transaction_type.TRANSACTION, account_ledger.AMOUNT
        FROM account_ledger
        JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID
        WHERE account_ledger.TRANSACTION_TYPE IN (2, 5, 3)
        AND account_ledger.ACCOUNT_ID = ?
      `, [ACCOUNT_ID]);

      let deposit = 0, withdraw = 0, iouCash = 0, iouReturn = 0;
      ledgerResults.forEach(row => {
        const amt = parseFloat(row.AMOUNT) || 0;
        if (row.TRANSACTION === 'DEPOSIT') deposit += amt;
        if (row.TRANSACTION === 'WITHDRAW') withdraw += amt;
        if (row.TRANSACTION === 'IOU CASH') iouCash += amt;
        if (row.TRANSACTION === 'IOU RETURN DEPOSIT') iouReturn += amt;
      });

      const balance = deposit + iouCash - withdraw - iouReturn;

      const msg = `DEMO CAGE\n\nAccount #: ${AGENT_CODE}\nGuest: ${NAME}\nBalance: ${balance.toLocaleString()}`;
      bot.sendMessage(telegramId, msg, { parse_mode: 'Markdown' });

    } catch (err) {
      console.error('❌ Error:', err);
      bot.sendMessage(telegramId, '❌ Error getting balance.');
    } finally {
      connection.release();
    }
  }

  // /checkbalance or Check Balance triggers
  bot.onText(/\/checkbalance|Check Balance/, (msg) => {
    sendBalanceToUser(msg.chat.id);
  });

  bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (shownKeyboard.has(chatId) || ["/checkbalance", "Check Balance", "💰 Check Balance"].includes(text)) return;

    shownKeyboard.add(chatId);

    bot.sendMessage(chatId, "Welcome to Demo Cage!", {
      reply_markup: {
        keyboard: [[{ text: "💰 Check Balance" }]],
        resize_keyboard: true,
        one_time_keyboard: false,
      }
    });
  });
}

module.exports = {
  sendTelegramMessage,
  startTelegramBot
};
