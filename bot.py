import os
import logging
import httpx
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

load_dotenv()

logging.basicConfig(format="%(asctime)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

WEBAPP_URL = "https://almazf318.github.io/tatarcha-wordle/"
SUPABASE_URL = "https://nntwkjevyadhxqtvoxed.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udHdramV2eWFkaHhxdHZveGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk3MzMsImV4cCI6MjA5MTM5NTczM30.JJBixtUV6sCYKznkZbRSnfL4b9ddW4LD2Q8frUU1Z6Q"
SB_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}


async def save_user(tg_id, username, first_name):
    async with httpx.AsyncClient() as c:
        await c.post(f"{SUPABASE_URL}/rest/v1/wordle_players", headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates"},
                     json={"tg_id": tg_id, "username": username or "", "first_name": first_name or ""})


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await save_user(user.id, user.username, user.first_name)

    if context.args:
        arg = context.args[0]

        # Challenge deep link
        if arg.startswith("challenge_"):
            cid = arg.replace("challenge_", "")
            kb = InlineKeyboardMarkup([[InlineKeyboardButton("🎯 Табарга!", web_app=WebAppInfo(url=f"{WEBAPP_URL}?challenge={cid}"))]])
            await update.message.reply_text("⚔️ <b>Сезгә биремә бирделәр!</b>\n\nДусыгыз сезгә сүз бирде — таба аласызмы?\n5 хәреф, 6 тапкыр. Уңышлар! 💪", parse_mode="HTML", reply_markup=kb)
            return

        # Duel deep link
        if arg.startswith("duel_"):
            did = arg.replace("duel_", "")
            kb = InlineKeyboardMarkup([[InlineKeyboardButton("⚔️ Дуэльгә керү!", web_app=WebAppInfo(url=f"{WEBAPP_URL}?duel={did}"))]])
            await update.message.reply_text("🎯 <b>Сезне дуэльгә чакыралар!</b>\n\nКем тизрәк таба — сез яки дусыгыз?\nУңышлар! 💪", parse_mode="HTML", reply_markup=kb)
            return

    # Normal welcome
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🎯 Уйнарга", web_app=WebAppInfo(url=WEBAPP_URL))],
    ])
    await update.message.reply_text(
        "Исәнмесез! 👋\n\n"
        "🎯 <b>Сүзле</b> — көн саен яңа татарча сүз уйны!\n\n"
        "5 хәреф. 6 тапкыр. Таба аласыңмы?\n\n"
        "🌅 Көнлек сүз — барысы бер сүзне таба\n"
        "♾️ Чиксез — туктамый уйна\n"
        "⚡ Тиз уен — 5 минутта ничә сүз?\n"
        "🎯 Дуэль — кем тизрәк?\n"
        "⚔️ Дуска биремә — дусыңа сүз бир\n\n"
        "Әйдә башлыйбыз! 👇",
        parse_mode="HTML", reply_markup=kb,
    )


async def play(update: Update, context: ContextTypes.DEFAULT_TYPE):
    kb = InlineKeyboardMarkup([[InlineKeyboardButton("🎯 Уйнарга", web_app=WebAppInfo(url=WEBAPP_URL))]])
    await update.message.reply_text("Бүгенге сүзне табарга тырышыгыз! 👇", reply_markup=kb)


async def handle_any(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if user:
        await save_user(user.id, user.username, user.first_name)


def main():
    app = Application.builder().token(os.environ["TELEGRAM_BOT_TOKEN"]).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("play", play))
    app.add_handler(MessageHandler(filters.ALL, handle_any), group=1)
    logger.info("Wordle bot started")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
