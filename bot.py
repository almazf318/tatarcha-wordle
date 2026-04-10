import os
import logging
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

load_dotenv()

logging.basicConfig(format="%(asctime)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

WEBAPP_URL = "https://almazf318.github.io/tatarcha-wordle/"


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("🎯 Уйнарга", web_app=WebAppInfo(url=WEBAPP_URL))],
        [
            InlineKeyboardButton("🏆 Рейтинг", callback_data="info_leaderboard"),
            InlineKeyboardButton("⚔️ Дуска биремә", callback_data="info_challenge"),
        ],
    ])

    await update.message.reply_text(
        "Исәнмесез! 👋\n\n"
        "🎯 <b>Сүзле</b> — көн саен яңа татарча сүз уйны!\n\n"
        "5 хәреф. 6 тапкыр. Таба аласыңмы?\n\n"
        "🔥 Көн саен уйнагыз — эзлекле көннәр саныгыз артсын\n"
        "🏆 Рейтингта алга чыгыгыз\n"
        "⚔️ Дусларыгызга биремә бирегез\n"
        "⭐ Казанышлар җыегыз\n\n"
        "Әйдә башлыйбыз! 👇",
        parse_mode="HTML",
        reply_markup=keyboard,
    )


async def play(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("🎯 Уйнарга", web_app=WebAppInfo(url=WEBAPP_URL))],
    ])
    await update.message.reply_text("Бүгенге сүзне табарга тырышыгыз! 👇", reply_markup=keyboard)


def main():
    app = Application.builder().token(os.environ["TELEGRAM_BOT_TOKEN"]).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("play", play))
    logger.info("Wordle bot started")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
