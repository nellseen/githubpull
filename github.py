import asyncio
import html
import json
import os
import re
import shutil
import zipfile
import requests
import websockets
from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    Update,
)
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

load_dotenv()

# Konfigurasi Token Telegram
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")


# Fungsi untuk mendeteksi akun GitHub secara otomatis via API
def load_github_accounts():
    tokens_raw = os.getenv("GH_TOKENS", "")
    if not tokens_raw:
        # Fallback jika pakai format lama (single GH_TOKEN)
        single_token = os.getenv("GH_TOKEN", "")
        tokens = [single_token] if single_token else []
    else:
        tokens = [t.strip() for t in tokens_raw.split(",") if t.strip()]

    accounts = []
    for i, token in enumerate(tokens):
        headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
        }
        try:
            res = requests.get("https://api.github.com/user", headers=headers)
            if res.status_code == 200:
                user_data = res.json()
                username = user_data.get("login")
                email = user_data.get("email")

                # Kalau email di-private oleh user, ambil email utamanya via endpoint /user/emails
                if not email:
                    email_res = requests.get(
                        "https://api.github.com/user/emails", headers=headers
                    )
                    if email_res.status_code == 200:
                        for e_obj in email_res.json():
                            if e_obj.get("primary") and e_obj.get("verified"):
                                email = e_obj.get("email")
                                break

                # Fallback email noreply jika masih kosong
                if not email:
                    email = f"{username}@users.noreply.github.com"

                accounts.append({
                    "name": f"Akun {i+1} ({username})",
                    "username": username,
                    "email": email,
                    "token": token,
                })
                print(f"[GitHub] Berhasil mendeteksi akun: {username}")
            else:
                print(
                    f"[GitHub] Token ke-{i+1} gagal divalidasi (Status: {res.status_code})"
                )
        except Exception as e:
            print(f"[GitHub] Error saat mendeteksi token ke-{i+1}: {e}")

    return accounts


# Muat akun otomatis saat bot berjalan
GH_ACCOUNTS = load_github_accounts()

# Base directory utama
BASE_DIR = "/root"
WEBSOCKET_PORT = 8765

# File/Folder sampah yang akan otomatis dibersihkan sebelum push
IGNORE_LIST = [".DS_Store", "__pycache__", ".cache", "thumbs.db"]
GITHUB_URL_PATTERN = re.compile(
    r"^https://github\.com/[\w.-]+/[\w.-]+(?:\.git)?$"
)

# Menu Utama
REPLY_KEYBOARD = ReplyKeyboardMarkup(
    [
        ["🚀 Auto Deploy Folder", "📦 Unzip & Deploy ZIP"],
        ["📥 Clone Repo ke VPS", "🗑 List & Hapus Repo"],
        ["ℹ️ Cek Status Bot"],
    ],
    resize_keyboard=True,
)

telegram_app = None
active_ws_subscribers = set()


# ================= HELPER: PILIH AKUN GITHUB ================= #
async def prompt_account_selection(
    update_or_query, context: ContextTypes.DEFAULT_TYPE, next_action: str
):
    if not GH_ACCOUNTS:
        msg = (
            update_or_query.message
            if hasattr(update_or_query, "message")
            and update_or_query.message
            else update_or_query.callback_query.message
        )
        await msg.reply_text(
            "❌ Tidak ada token GitHub valid yang ditemukan di file .env!"
        )
        return

    if len(GH_ACCOUNTS) == 1:
        context.user_data["selected_account"] = GH_ACCOUNTS[0]
        return await execute_next_step(update_or_query, context, next_action)

    context.user_data["pending_action"] = next_action

    keyboard = [
        [
            InlineKeyboardButton(
                acc["name"], callback_data=f"selectacc_{i}"
            )
        ]
        for i, acc in enumerate(GH_ACCOUNTS)
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    text = "<b>👤 Pilih Akun GitHub yang ingin digunakan:</b>"
    if hasattr(update_or_query, "message") and update_or_query.message:
        await update_or_query.message.reply_text(
            text, parse_mode="HTML", reply_markup=reply_markup
        )
    else:
        await update_or_query.callback_query.message.edit_text(
            text, parse_mode="HTML", reply_markup=reply_markup
        )


async def execute_next_step(
    update_or_query, context: ContextTypes.DEFAULT_TYPE, action: str
):
    msg = (
        update_or_query.message
        if hasattr(update_or_query, "message") and update_or_query.message
        else update_or_query.callback_query.message
    )
    acc = context.user_data.get("selected_account", {})

    if action == "deploy_folder":
        context.user_data["state"] = "WAITING_FOLDER_NAME"
        await msg.reply_text(
            f"<b>🚀 Deploy Folder (Akun: <code>{acc['username']}</code>)</b>\n\n"
            "Ketik nama folder atau <b>sub-path</b> di dalam <code>/root</code>:\n"
            "• Contoh: <code>testing</code> atau <code>folder/baru/myproject</code>",
            parse_mode="HTML",
        )
    elif action == "unzip_zip":
        context.user_data["state"] = None
        await msg.reply_text(
            f"<b>📦 Upload File ZIP (Akun: <code>{acc['username']}</code>)</b>\n\n"
            "Silakan kirimkan file <b>.zip</b> ke chat ini.",
            parse_mode="HTML",
        )
    elif action == "clone_repo":
        context.user_data["state"] = "WAITING_CLONE_URL"
        await msg.reply_text(
            f"<b>📥 Clone Project (Akun: <code>{acc['username']}</code>)</b>\n\n"
            "Kirimkan <b>URL Repository GitHub</b>:\n"
            "• Contoh: <code>https://github.com/username/repo</code>",
            parse_mode="HTML",
        )
    elif action == "list_repo":
        await send_repo_list(update_or_query, context)


# ================= WEBSOCKET SERVER ================= #
async def ws_handler(websocket, *args):
    active_ws_subscribers.add(websocket)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                chat_id = data.get("chat_id")
                log_text = html.escape(str(data.get("log", "")))
                status = html.escape(str(data.get("status", "INFO")))

                if chat_id and telegram_app:
                    await telegram_app.bot.send_message(
                        chat_id=chat_id,
                        text=f"<b>📡 [WS {status}]</b>\n<code>{log_text}</code>",
                        parse_mode="HTML",
                    )
            except Exception as e:
                print(f"[WS Error] Gagal memproses data: {e}")
    finally:
        active_ws_subscribers.remove(websocket)


# ================= LIVE LOG PROGRESS HELPER ================= #
async def run_command_with_live_log(
    cmd: str, update_or_query, header_title: str
):
    msg_target = (
        update_or_query.message
        if hasattr(update_or_query, "message") and update_or_query.message
        else update_or_query.callback_query.message
    )

    progress_msg = await msg_target.reply_text(
        f"<b>⏳ {html.escape(header_title)}</b>\n\n<code>[Memulai proses...]</code>",
        parse_mode="HTML",
    )

    process = await asyncio.create_subprocess_shell(
        cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )

    logs = []
    last_update_time = 0

    async def read_stream(stream):
        nonlocal last_update_time
        while True:
            line = await stream.readline()
            if not line:
                break
            decoded_line = line.decode("utf-8", errors="ignore").strip()
            if decoded_line:
                logs.append(decoded_line)
                recent_logs = html.escape("\n".join(logs[-15:]))

                now = asyncio.get_event_loop().time()
                if now - last_update_time > 1.2:
                    last_update_time = now
                    try:
                        await progress_msg.edit_text(
                            f"<b>⏳ {html.escape(header_title)}</b>\n\n<code>{recent_logs}</code>",
                            parse_mode="HTML",
                        )
                    except Exception:
                        pass

    await asyncio.gather(
        read_stream(process.stdout), read_stream(process.stderr)
    )

    await process.wait()
    final_logs = (
        html.escape("\n".join(logs[-20:])) if logs else "Selesai tanpa output."
    )

    if process.returncode == 0:
        await progress_msg.edit_text(
            f"<b>✅ {html.escape(header_title)} SUKSES!</b>\n\n<code>{final_logs}</code>",
            parse_mode="HTML",
        )
        return True, final_logs
    else:
        await progress_msg.edit_text(
            f"<b>❌ {html.escape(header_title)} GAGAL!</b>\n\n<code>{final_logs}</code>",
            parse_mode="HTML",
        )
        return False, final_logs


# ================= HANDLER BOT TELEGRAM ================= #
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.message.reply_text(
        "<b>🤖 GitHub Manager & Deployer Multi-Account + WebSocket!</b>\n\n"
        f"📡 WebSocket Port: <code>{WEBSOCKET_PORT}</code>\n"
        f"💬 Chat ID Kamu: <code>{update.effective_chat.id}</code>\n\n"
        "Pilih menu di bawah ini:",
        parse_mode="HTML",
        reply_markup=REPLY_KEYBOARD,
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    user_state = context.user_data.get("state")

    if text == "🚀 Auto Deploy Folder":
        context.user_data.clear()
        await prompt_account_selection(update, context, "deploy_folder")
        return

    elif text == "📦 Unzip & Deploy ZIP":
        context.user_data.clear()
        await prompt_account_selection(update, context, "unzip_zip")
        return

    elif text == "📥 Clone Repo ke VPS":
        context.user_data.clear()
        await prompt_account_selection(update, context, "clone_repo")
        return

    elif text == "🗑 List & Hapus Repo":
        context.user_data.clear()
        await prompt_account_selection(update, context, "list_repo")
        return

    elif text == "ℹ️ Cek Status Bot":
        context.user_data.clear()
        active_accs = (
            ", ".join([acc["username"] for acc in GH_ACCOUNTS])
            if GH_ACCOUNTS
            else "Tidak ada akun terdeteksi"
        )
        await update.message.reply_text(
            f"<b>✅ Status Bot:</b> Online\n"
            f"<b>👤 Akun GitHub Terdeteksi:</b> {active_accs}\n"
            f"<b>📁 Base Directory:</b> <code>{BASE_DIR}</code>\n"
            f"<b>📡 WS Port:</b> <code>{WEBSOCKET_PORT}</code>\n"
            f"<b>🆔 Your Chat ID:</b> <code>{update.effective_chat.id}</code>",
            parse_mode="HTML",
        )
        return

    # Input Nama Repo untuk File ZIP
    if user_state == "WAITING_ZIP_REPO_NAME":
        zip_path = context.user_data.get("temp_zip_path")
        acc = context.user_data.get("selected_account")

        if not zip_path or not os.path.exists(zip_path) or not acc:
            await update.message.reply_text(
                "❌ Sesi habis atau akun tidak valid. Silakan ulangi upload ZIP."
            )
            context.user_data.clear()
            return

        repo_name = text.strip().replace(" ", "-").replace("/", "-")
        target_dir = os.path.join(BASE_DIR, repo_name)
        os.makedirs(target_dir, exist_ok=True)
        context.user_data["state"] = None

        await update.message.reply_text(
            f"⏳ Mengekstrak ke <b>{html.escape(repo_name)}</b> menggunakan akun <b>{acc['username']}</b>...",
            parse_mode="HTML",
        )

        try:
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(target_dir)
            os.remove(zip_path)
            flatten_directory(target_dir)
            clean_junk_files(target_dir)
        except Exception as e:
            await update.message.reply_text(
                f"❌ Gagal ekstraksi ZIP: {html.escape(str(e))}"
            )
            return

        headers = {
            "Authorization": f"token {acc['token']}",
            "Accept": "application/vnd.github.v3+json",
        }
        check_repo = requests.get(
            f"https://api.github.com/repos/{acc['username']}/{repo_name}",
            headers=headers,
        )
        if check_repo.status_code == 404:
            requests.post(
                "https://api.github.com/user/repos",
                headers=headers,
                json={"name": repo_name, "private": False},
            )

        cmd = f"""
        cd "{target_dir}" && \
        git init && \
        git config user.name "{acc['username']}" && \
        git config user.email "{acc['email']}" && \
        git branch -M main && \
        git remote remove origin 2>/dev/null || true && \
        git remote add origin https://{acc['username']}:{acc['token']}@github.com/{acc['username']}/{repo_name}.git && \
        git add . && \
        git commit -m "Auto deploy ZIP via Telegram Bot" || true && \
        git push -u origin main --force
        """
        await run_command_with_live_log(cmd, update, f"Deploy ZIP ({repo_name})")
        context.user_data.clear()
        return

    # Process Path Folder
    if user_state == "WAITING_FOLDER_NAME":
        input_path = text.strip().strip("/")
        full_path = os.path.normpath(os.path.join(BASE_DIR, input_path))

        if not full_path.startswith(BASE_DIR):
            await update.message.reply_text(
                "❌ Akses ditolak! Path di luar direktori dasar."
            )
            return

        if not os.path.exists(full_path) or not os.path.isdir(full_path):
            await update.message.reply_text(
                f"❌ Folder <code>{html.escape(full_path)}</code> tidak ditemukan!",
                parse_mode="HTML",
            )
            return

        repo_name = os.path.basename(full_path)
        context.user_data["state"] = None
        context.user_data["target_path"] = full_path
        context.user_data["repo_name"] = repo_name

        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton(
                f"🚀 Deploy / Update '{repo_name}'",
                callback_data="confirm_deploy",
            )
        ]])

        acc = context.user_data.get("selected_account", {})
        await update.message.reply_text(
            f"<b>📁 Target Path:</b> <code>{html.escape(full_path)}</code>\n"
            f"<b>👤 Akun GitHub:</b> <code>{acc.get('username')}</code>\n\n"
            f"Klik tombol di bawah untuk melanjutkan:",
            parse_mode="HTML",
            reply_markup=keyboard,
        )
        return

    # Process Git Clone URL
    if user_state == "WAITING_CLONE_URL":
        clone_url = text.strip()
        context.user_data["state"] = None
        acc = context.user_data.get("selected_account", {})

        if not GITHUB_URL_PATTERN.match(clone_url):
            await update.message.reply_text("❌ URL GitHub tidak valid!")
            return

        repo_name = clone_url.rstrip("/").split("/")[-1].replace(".git", "")
        target_dir = os.path.join(BASE_DIR, repo_name)

        authenticated_url = clone_url
        if "github.com" in clone_url and f"{acc['username']}:" not in clone_url:
            authenticated_url = clone_url.replace(
                "https://github.com/",
                f"https://{acc['username']}:{acc['token']}@github.com/",
            )

        if os.path.exists(target_dir):
            cmd = f'cd "{target_dir}" && git pull'
            title = f"Git Pull ({repo_name})"
        else:
            cmd = f'cd "{BASE_DIR}" && git clone {authenticated_url}'
            title = f"Git Clone ({repo_name})"

        await run_command_with_live_log(cmd, update, title)
        context.user_data.clear()
        return


def clean_junk_files(directory):
    for root, dirs, files in os.walk(directory, topdown=False):
        for name in files:
            if name in IGNORE_LIST:
                try:
                    os.remove(os.path.join(root, name))
                except Exception:
                    pass
        for name in dirs:
            if name in IGNORE_LIST:
                try:
                    shutil.rmtree(os.path.join(root, name))
                except Exception:
                    pass


def flatten_directory(target_dir):
    while True:
        items = [
            i for i in os.listdir(target_dir) if i != ".git" and i not in IGNORE_LIST
        ]
        if len(items) == 1 and os.path.isdir(os.path.join(target_dir, items[0])):
            nested_folder = os.path.join(target_dir, items[0])
            for content in os.listdir(nested_folder):
                shutil.move(os.path.join(nested_folder, content), target_dir)
            os.rmdir(nested_folder)
        else:
            break


async def send_repo_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg_target = (
        update.message if update.message else update.callback_query.message
    )
    acc = context.user_data.get("selected_account", {})

    headers = {
        "Authorization": f"token {acc['token']}",
        "Accept": "application/vnd.github.v3+json",
    }
    res = requests.get(
        "https://api.github.com/user/repos?per_page=50&sort=updated",
        headers=headers,
    )

    if res.status_code != 200:
        await msg_target.reply_text("❌ Gagal mengambil daftar repo dari GitHub.")
        return

    repos = res.json()
    keyboard = []
    for r in repos:
        keyboard.append([
            InlineKeyboardButton(f"🔗 {r['name']}", url=r["html_url"]),
            InlineKeyboardButton("❌ Hapus", callback_data=f"askdelete_{r['name']}"),
        ])

    reply_markup = InlineKeyboardMarkup(keyboard)
    text = (
        f"<b>🗑 Daftar Repository GitHub (Akun: <code>{acc['username']}</code> - {len(repos)} repo):</b>\n"
        "<i>Klik nama repo untuk membuka di browser, atau klik Hapus untuk menghapus.</i>"
    )

    if update.callback_query:
        await update.callback_query.edit_message_text(
            text, parse_mode="HTML", reply_markup=reply_markup
        )
    else:
        await msg_target.reply_text(
            text, parse_mode="HTML", reply_markup=reply_markup
        )


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("selectacc_"):
        acc_index = int(data.replace("selectacc_", ""))
        if acc_index < len(GH_ACCOUNTS):
            context.user_data["selected_account"] = GH_ACCOUNTS[acc_index]
            next_action = context.user_data.get("pending_action")
            await execute_next_step(query, context, next_action)
        return

    acc = context.user_data.get("selected_account", {})

    if data == "confirm_deploy":
        full_path = context.user_data.get("target_path")
        repo_name = context.user_data.get("repo_name")

        clean_junk_files(full_path)
        headers = {
            "Authorization": f"token {acc['token']}",
            "Accept": "application/vnd.github.v3+json",
        }

        check_repo = requests.get(
            f"https://api.github.com/repos/{acc['username']}/{repo_name}",
            headers=headers,
        )
        if check_repo.status_code == 404:
            requests.post(
                "https://api.github.com/user/repos",
                headers=headers,
                json={"name": repo_name, "private": False},
            )

        cmd = f"""
        cd "{full_path}" && \
        git init && \
        git config user.name "{acc['username']}" && \
        git config user.email "{acc['email']}" && \
        git branch -M main && \
        git remote remove origin 2>/dev/null || true && \
        git remote add origin https://{acc['username']}:{acc['token']}@github.com/{acc['username']}/{repo_name}.git && \
        git add . && \
        git commit -m "Auto deploy/update via Telegram Bot" || true && \
        git push -u origin main --force
        """

        await run_command_with_live_log(cmd, query, f"Git Deploy ({repo_name})")

    elif data.startswith("askdelete_"):
        repo_name = data.replace("askdelete_", "")
        confirm_keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton(
                "✅ Ya, Hapus!", callback_data=f"confirmdelete_{repo_name}"
            ),
            InlineKeyboardButton("❌ Batal", callback_data="cancel_delete"),
        ]])
        await query.edit_message_text(
            f"⚠️ Hapus permanent repo <b>{html.escape(repo_name)}</b> dari akun <b>{acc.get('username')}</b>?",
            parse_mode="HTML",
            reply_markup=confirm_keyboard,
        )

    elif data.startswith("confirmdelete_"):
        repo_name = data.replace("confirmdelete_", "")
        headers = {
            "Authorization": f"token {acc['token']}",
            "Accept": "application/vnd.github.v3+json",
        }
        res = requests.delete(
            f"https://api.github.com/repos/{acc['username']}/{repo_name}",
            headers=headers,
        )
        await query.edit_message_text(
            f"✅ Repository <b>{html.escape(repo_name)}</b> berhasil dihapus!"
            if res.status_code == 204
            else f"❌ Gagal Hapus: Status {res.status_code}"
        )

    elif data == "cancel_delete":
        await send_repo_list(update, context)


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc.file_name.endswith(".zip"):
        await update.message.reply_text("❌ File harus berformat .zip!")
        return

    if not context.user_data.get("selected_account"):
        await prompt_account_selection(update, context, "unzip_zip")
        return

    default_repo_name = os.path.splitext(doc.file_name)[0]
    temp_zip_path = os.path.join(BASE_DIR, f"temp_{doc.file_id}.zip")

    await update.message.reply_text(
        "⏳ Mengunduh file ZIP ke server...", parse_mode="HTML"
    )

    file = await context.bot.get_file(doc.file_id)
    await file.download_to_drive(temp_zip_path)

    context.user_data["state"] = "WAITING_ZIP_REPO_NAME"
    context.user_data["temp_zip_path"] = temp_zip_path
    context.user_data["temp_zip_name"] = doc.file_name

    await update.message.reply_text(
        "<b>📦 File ZIP Diterima!</b>\n\n"
        "Ketik <b>nama repository baru</b> yang ingin dibuat di GitHub:\n"
        f"• Rekomendasi nama: <code>{html.escape(default_repo_name)}</code>",
        parse_mode="HTML",
    )


# Runner Utama
async def main():
    global telegram_app
    telegram_app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()

    telegram_app.add_handler(CommandHandler("start", start))
    telegram_app.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
    )
    telegram_app.add_handler(MessageHandler(filters.Document.ALL, handle_document))
    telegram_app.add_handler(CallbackQueryHandler(handle_callback))

    print(
        f"🚀 Bot Telegram Berjalan! Terdeteksi {len(GH_ACCOUNTS)} Akun GitHub."
    )

    async with telegram_app:
        await telegram_app.start()
        await telegram_app.updater.start_polling()

        ws_server = await websockets.serve(ws_handler, "0.0.0.0", WEBSOCKET_PORT)
        await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
