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
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://nntwkjevyadhxqtvoxed.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udHdramV2eWFkaHhxdHZveGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk3MzMsImV4cCI6MjA5MTM5NTczM30.JJBixtUV6sCYKznkZbRSnfL4b9ddW4LD2Q8frUU1Z6Q")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


async def save_user(tg_id: int, username: str, first_name: str):
    """Save user's chat_id and username so we can send them challenges."""
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{SUPABASE_URL}/rest/v1/wordle_players",
            headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates"},
            json={"tg_id": tg_id, "username": username or "", "first_name": first_name or ""},
        )


async def find_user_by_username(username: str) -> int | None:
    """Find chat_id (tg_id) by username."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/wordle_players?username=eq.{username}&select=tg_id",
            headers=SB_HEADERS,
        )
        data = resp.json()
        if data and len(data) > 0:
            return data[0]["tg_id"]
    return None


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await save_user(user.id, user.username, user.first_name)

    # Challenge deep link
    if context.args and context.args[0].startswith("challenge_"):
        challenge_id = context.args[0].replace("challenge_", "")
        challenge_url = f"{WEBAPP_URL}?challenge={challenge_id}"
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("🎯 Табарга!", web_app=WebAppInfo(url=challenge_url))],
        ])
        await update.message.reply_text(
            "⚔️ <b>Сезгә биремә бирделәр!</b>\n\n"
            "Дусыгыз сезгә сүз бирде — таба аласызмы?\n"
            "5 хәреф, 6 тапкыр. Уңышлар! 💪",
            parse_mode="HTML",
            reply_markup=keyboard,
        )
        return

    # Normal welcome
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


async def handle_any_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Save user on any message so we have their chat_id."""
    user = update.effective_user
    if user:
        await save_user(user.id, user.username, user.first_name)


def main():
    app = Application.builder().token(os.environ["TELEGRAM_BOT_TOKEN"]).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("play", play))
    app.add_handler(MessageHandler(filters.ALL, handle_any_message), group=1)
    logger.info("Wordle bot started")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
