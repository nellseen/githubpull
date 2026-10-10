import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import fs from 'fs';
import { 
  GitHubAccount, 
  UserSessionData 
} from './types';
import { 
  loadGithubAccounts, 
  listRepos, 
  deleteRepo, 
  validateGitHubUrl 
} from './github';
import { 
  deployFolderWorkflow, 
  deployZipWorkflow, 
  cloneOrPullWorkflow 
} from './git';
import { wsManager } from './websocket';

export class GitHubDeployerBot {
  public bot: Telegraf | null = null;
  public accounts: GitHubAccount[] = [];
  public baseDir: string;
  public userSessions = new Map<number | string, UserSessionData>();
  public isRunning: boolean = false;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.env.BASE_DIR || path.join(process.cwd(), 'deployments');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public getSession(chatId: number | string): UserSessionData {
    if (!this.userSessions.has(chatId)) {
      this.userSessions.set(chatId, {});
    }
    return this.userSessions.get(chatId)!;
  }

  public async init(token?: string): Promise<boolean> {
    const botToken = token || process.env.TELEGRAM_BOT_TOKEN;
    this.accounts = await loadGithubAccounts();

    if (!botToken) {
      console.warn('⚠️ TELEGRAM_BOT_TOKEN tidak ditemukan di .env. Bot berjalan dalam mode standby/test.');
      return false;
    }

    try {
      this.bot = new Telegraf(botToken);
      this.registerHandlers();
      this.bot.launch();
      this.isRunning = true;
      console.log(`🚀 Bot Telegram Berjalan! Terdeteksi ${this.accounts.length} Akun GitHub.`);
      return true;
    } catch (err: any) {
      console.error(`❌ Gagal memulai bot Telegram: ${err.message}`);
      return false;
    }
  }

  public getMainKeyboard() {
    return Markup.keyboard([
      ['🚀 Auto Deploy Folder', '📦 Unzip & Deploy ZIP'],
      ['📥 Clone Repo ke VPS', '🗑 List & Hapus Repo'],
      ['ℹ️ Cek Status Bot', '🔄 Ganti Akun GitHub'],
    ]).resize();
  }

  /**
   * Prompts user to choose an account on /start or when changing accounts.
   * Features will ONLY appear after user selects an account.
   */
  public async promptInitialAccountSelection(ctx: any, isChanging: boolean = false) {
    const chatId = ctx.chat?.id || ctx.from?.id;
    this.accounts = await loadGithubAccounts();

    if (this.accounts.length === 0) {
      await ctx.reply(
        '<b>❌ Tidak ada token GitHub valid yang ditemukan!</b>\n\n' +
        'Silakan masukkan <code>GH_TOKENS</code> atau <code>GH_TOKEN</code> di file .env terlebih dahulu.',
        { parse_mode: 'HTML', ...Markup.removeKeyboard() }
      );
      return;
    }

    const buttons = this.accounts.map((acc, i) =>
      Markup.button.callback(`👤 ${acc.name}`, `selectacc_init_${i}`)
    );

    const keyboard = Markup.inlineKeyboard(buttons.map((b) => [b]));

    const header = isChanging
      ? '<b>🔄 Ganti Akun GitHub:</b>\n\nSilakan pilih akun GitHub yang ingin Anda aktifkan:'
      : '<b>🤖 Selamat Datang di GitHub Manager & Deployer!</b>\n\n' +
        `📁 Base Directory: <code>${this.baseDir}</code>\n` +
        `💬 Chat ID Kamu: <code>${chatId}</code>\n\n` +
        '⚠️ <b>Silakan pilih Akun GitHub terlebih dahulu:</b>\n' +
        '<i>(Fitur bot akan terbuka otomatis setelah Anda memilih akun)</i>';

    if (ctx.callbackQuery) {
      await ctx.editMessageText(header, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(header, { parse_mode: 'HTML', ...keyboard });
    }
  }

  public async executeNextStep(ctx: any, action: string) {
    const chatId = ctx.chat.id;
    const session = this.getSession(chatId);
    const acc = session.selected_account;

    if (!acc) {
      await this.promptInitialAccountSelection(ctx);
      return;
    }

    if (action === 'deploy_folder') {
      session.state = 'WAITING_FOLDER_NAME';
      await ctx.reply(
        `<b>🚀 Deploy Folder (Akun: <code>${acc.username}</code>)</b>\n\n` +
        `Ketik nama folder atau <b>sub-path</b> di dalam <code>${this.baseDir}</code>:\n` +
        `• Contoh: <code>testing</code> atau <code>folder/baru/myproject</code>`,
        { parse_mode: 'HTML' }
      );
    } else if (action === 'unzip_zip') {
      session.state = null;
      await ctx.reply(
        `<b>📦 Upload File ZIP (Akun: <code>${acc.username}</code>)</b>\n\n` +
        `Silakan kirimkan file <b>.zip</b> ke chat ini.`,
        { parse_mode: 'HTML' }
      );
    } else if (action === 'clone_repo') {
      session.state = 'WAITING_CLONE_URL';
      await ctx.reply(
        `<b>📥 Clone Project (Akun: <code>${acc.username}</code>)</b>\n\n` +
        `Kirimkan <b>URL Repository GitHub</b>:\n` +
        `• Contoh: <code>https://github.com/username/repo</code>`,
        { parse_mode: 'HTML' }
      );
    } else if (action === 'list_repo') {
      await this.sendRepoList(ctx);
    }
  }

  public async sendRepoList(ctx: any) {
    const chatId = ctx.chat.id;
    const session = this.getSession(chatId);
    const acc = session.selected_account;

    if (!acc) {
      await this.promptInitialAccountSelection(ctx);
      return;
    }

    try {
      const repos = await listRepos(acc);
      if (repos.length === 0) {
        await ctx.reply(`Belum ada repository di akun ${acc.username}.`);
        return;
      }

      const buttons = repos.slice(0, 30).map((r) => [
        Markup.button.url(`🔗 ${r.name}`, r.html_url),
        Markup.button.callback('❌ Hapus', `askdelete_${r.name}`),
      ]);

      const keyboard = Markup.inlineKeyboard(buttons);

      const text =
        `<b>🗑 Daftar Repository GitHub (Akun: <code>${acc.username}</code> - ${repos.length} repo):</b>\n` +
        `<i>Klik nama repo untuk membuka di browser, atau klik Hapus untuk menghapus.</i>`;

      if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } else {
        await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    } catch (err: any) {
      await ctx.reply(`❌ Gagal mengambil daftar repo: ${err.message}`);
    }
  }

  /**
   * Helper to execute command with live progress message updates in Telegram (throttled at 1.2s)
   */
  public async runWithLiveLog(
    ctx: any,
    headerTitle: string,
    actionFn: (onLog: (line: string) => void) => Promise<{ success: boolean; logs: string[]; finalOutput: string }>
  ) {
    const progressMsg = await ctx.reply(
      `<b>⏳ ${headerTitle}</b>\n\n<code>[Memulai proses...]</code>`,
      { parse_mode: 'HTML' }
    );

    const logs: string[] = [];
    let lastUpdateTime = 0;

    const onLog = async (line: string) => {
      logs.push(line);
      wsManager.broadcast({ log: line, status: 'RUNNING' });

      const now = Date.now();
      if (now - lastUpdateTime > 1200) {
        lastUpdateTime = now;
        const recent = logs.slice(-15).join('\n');
        try {
          if (this.bot) {
            await this.bot.telegram.editMessageText(
              ctx.chat.id,
              progressMsg.message_id,
              undefined,
              `<b>⏳ ${headerTitle}</b>\n\n<code>${recent}</code>`,
              { parse_mode: 'HTML' }
            );
          }
        } catch {
          // ignore throttle/rate limits
        }
      }
    };

    const result = await actionFn(onLog);
    const finalLogs = logs.slice(-20).join('\n') || result.finalOutput;

    try {
      if (this.bot) {
        if (result.success) {
          await this.bot.telegram.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            undefined,
            `<b>✅ ${headerTitle} SUKSES!</b>\n\n<code>${finalLogs}</code>`,
            { parse_mode: 'HTML' }
          );
        } else {
          await this.bot.telegram.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            undefined,
            `<b>❌ ${headerTitle} GAGAL!</b>\n\n<code>${finalLogs}</code>`,
            { parse_mode: 'HTML' }
          );
        }
      }
    } catch {
      // ignore
    }

    return result;
  }

  public registerHandlers() {
    if (!this.bot) return;

    // Command /start: WAJIB pilih akun dulu, setelah milih baru muncul fiturnya
    this.bot.command('start', async (ctx) => {
      this.userSessions.delete(ctx.chat.id);
      await this.promptInitialAccountSelection(ctx, false);
    });

    // Menu handlers (dilindungi guard: wajib memilih akun terlebih dahulu)
    this.bot.hears('🚀 Auto Deploy Folder', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_account) {
        await ctx.reply('⚠️ Silakan pilih akun GitHub terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }
      await this.executeNextStep(ctx, 'deploy_folder');
    });

    this.bot.hears('📦 Unzip & Deploy ZIP', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_account) {
        await ctx.reply('⚠️ Silakan pilih akun GitHub terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }
      await this.executeNextStep(ctx, 'unzip_zip');
    });

    this.bot.hears('📥 Clone Repo ke VPS', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_account) {
        await ctx.reply('⚠️ Silakan pilih akun GitHub terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }
      await this.executeNextStep(ctx, 'clone_repo');
    });

    this.bot.hears('🗑 List & Hapus Repo', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_account) {
        await ctx.reply('⚠️ Silakan pilih akun GitHub terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }
      await this.executeNextStep(ctx, 'list_repo');
    });

    this.bot.hears('🔄 Ganti Akun GitHub', async (ctx) => {
      await this.promptInitialAccountSelection(ctx, true);
    });

    this.bot.hears('ℹ️ Cek Status Bot', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      const activeAccs = this.accounts.length > 0
        ? this.accounts.map((a) => a.username).join(', ')
        : 'Tidak ada akun terdeteksi';
      const selectedAcc = session.selected_account
        ? `<code>${session.selected_account.username}</code> (${session.selected_account.email})`
        : '<i>Belum dipilih (Ketik /start untuk memilih)</i>';

      await ctx.reply(
        `<b>✅ Status Bot:</b> Online\n` +
        `<b>👤 Akun Aktif:</b> ${selectedAcc}\n` +
        `<b>👥 Semua Akun Terdeteksi:</b> ${activeAccs}\n` +
        `<b>📁 Base Directory:</b> <code>${this.baseDir}</code>\n` +
        `<b>📡 WS Subscribers:</b> <code>${wsManager.getSubscribersCount()}</code>\n` +
        `<b>🆔 Your Chat ID:</b> <code>${ctx.chat.id}</code>`,
        { parse_mode: 'HTML' }
      );
    });

    // Callback queries
    this.bot.on('callback_query', async (ctx) => {
      const data = (ctx.callbackQuery as any).data;
      const chatId = ctx.chat!.id;
      const session = this.getSession(chatId);

      await ctx.answerCbQuery();

      // Handle Initial Account Selection (on /start or 🔄 Ganti Akun)
      if (data.startsWith('selectacc_init_')) {
        const idx = parseInt(data.replace('selectacc_init_', ''), 10);
        if (idx < this.accounts.length) {
          const acc = this.accounts[idx];
          session.selected_account = acc;

          // Baru setelah milih akun, fiturnya ditampilkan!
          await ctx.reply(
            `<b>✅ Akun Aktif Berhasil Dipilih:</b> <code>${acc.username}</code> (${acc.email})\n\n` +
            `🚀 <b>Fitur bot telah dibuka!</b> Silakan pilih menu di bawah ini untuk memulai:`,
            { parse_mode: 'HTML', ...this.getMainKeyboard() }
          );
        }
        return;
      }

      // Legacy/Fallback callback format
      if (data.startsWith('selectacc_')) {
        const idx = parseInt(data.replace('selectacc_', ''), 10);
        if (idx < this.accounts.length) {
          session.selected_account = this.accounts[idx];
          const action = session.pending_action || 'deploy_folder';
          await this.executeNextStep(ctx, action);
        }
        return;
      }

      const acc = session.selected_account;

      if (data === 'confirm_deploy') {
        const fullPath = session.target_path;
        const repoName = session.repo_name;

        if (!fullPath || !repoName || !acc) {
          await ctx.reply('❌ Sesi kadaluarsa. Silakan ulangi perintah deploy.');
          return;
        }

        await this.runWithLiveLog(ctx, `Git Deploy (${repoName})`, (onLog) =>
          deployFolderWorkflow({
            account: acc,
            folderPath: fullPath,
            repoName,
          }, onLog)
        );
        this.userSessions.delete(chatId);
        // Tetap simpan selected_account
        session.selected_account = acc;
      } else if (data.startsWith('askdelete_')) {
        const repoName = data.replace('askdelete_', '');
        const confirmKeyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Ya, Hapus!', `confirmdelete_${repoName}`),
            Markup.button.callback('❌ Batal', 'cancel_delete'),
          ],
        ]);

        await ctx.editMessageText(
          `⚠️ Hapus permanent repo <b>${repoName}</b> dari akun <b>${acc?.username}</b>?`,
          { parse_mode: 'HTML', ...confirmKeyboard }
        );
      } else if (data.startsWith('confirmdelete_')) {
        const repoName = data.replace('confirmdelete_', '');
        if (!acc) return;
        try {
          const success = await deleteRepo(acc, repoName);
          await ctx.editMessageText(
            success
              ? `✅ Repository <b>${repoName}</b> berhasil dihapus!`
              : `❌ Gagal menghapus repository <b>${repoName}</b>`,
            { parse_mode: 'HTML' }
          );
        } catch (err: any) {
          await ctx.editMessageText(`❌ Gagal Hapus: ${err.message}`, { parse_mode: 'HTML' });
        }
      } else if (data === 'cancel_delete') {
        await this.sendRepoList(ctx);
      }
    });

    // Document ZIP upload
    this.bot.on('document', async (ctx) => {
      const doc = ctx.message.document;
      const fileName = doc.file_name || '';

      if (!fileName.toLowerCase().endsWith('.zip')) {
        await ctx.reply('❌ File harus berformat .zip!');
        return;
      }

      const chatId = ctx.chat.id;
      const session = this.getSession(chatId);

      if (!session.selected_account) {
        await ctx.reply('⚠️ Silakan pilih akun GitHub terlebih dahulu sebelum upload ZIP!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }

      const defaultRepoName = path.basename(fileName, path.extname(fileName));
      const tempZipPath = path.join(this.baseDir, `temp_${doc.file_id}.zip`);

      await ctx.reply('⏳ Mengunduh file ZIP ke server...', { parse_mode: 'HTML' });

      try {
        const fileLink = await ctx.telegram.getFileLink(doc.file_id);
        const res = await fetch(fileLink.href);
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(tempZipPath, Buffer.from(buffer));

        session.state = 'WAITING_ZIP_REPO_NAME';
        session.temp_zip_path = tempZipPath;
        session.temp_zip_name = fileName;

        await ctx.reply(
          `<b>📦 File ZIP Diterima! (Akun: <code>${session.selected_account.username}</code>)</b>\n\n` +
          `Ketik <b>nama repository baru</b> yang ingin dibuat di GitHub:\n` +
          `• Rekomendasi nama: <code>${defaultRepoName}</code>`,
          { parse_mode: 'HTML' }
        );
      } catch (err: any) {
        await ctx.reply(`❌ Gagal mengunduh file ZIP: ${err.message}`);
      }
    });

    // Text messages
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text.trim();
      const chatId = ctx.chat.id;
      const session = this.getSession(chatId);
      const userState = session.state;

      // Handle Waiting ZIP Repo Name
      if (userState === 'WAITING_ZIP_REPO_NAME') {
        const zipPath = session.temp_zip_path;
        const acc = session.selected_account;

        if (!zipPath || !fs.existsSync(zipPath) || !acc) {
          await ctx.reply('❌ Sesi habis atau akun tidak valid. Silakan ulangi upload ZIP.');
          this.userSessions.delete(chatId);
          return;
        }

        const repoName = text.replace(/\s+/g, '-').replace(/\//g, '-');
        session.state = null;

        await this.runWithLiveLog(ctx, `Deploy ZIP (${repoName})`, (onLog) =>
          deployZipWorkflow({
            account: acc,
            zipFilePath: zipPath,
            repoName,
            targetBaseDir: this.baseDir,
          }, onLog)
        );

        try { fs.unlinkSync(zipPath); } catch {}
        session.state = null;
        session.temp_zip_path = undefined;
        session.temp_zip_name = undefined;
        return;
      }

      // Handle Waiting Folder Name
      if (userState === 'WAITING_FOLDER_NAME') {
        const inputPath = text.replace(/^\/+|\/+$/g, '');
        const fullPath = path.normalize(path.join(this.baseDir, inputPath));

        if (!fullPath.startsWith(this.baseDir)) {
          await ctx.reply('❌ Akses ditolak! Path di luar direktori dasar.');
          return;
        }

        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
          await ctx.reply(
            `❌ Folder <code>${fullPath}</code> tidak ditemukan!`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        const repoName = path.basename(fullPath);
        session.state = null;
        session.target_path = fullPath;
        session.repo_name = repoName;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback(`🚀 Deploy / Update '${repoName}'`, 'confirm_deploy')],
        ]);

        const acc = session.selected_account;
        await ctx.reply(
          `<b>📁 Target Path:</b> <code>${fullPath}</code>\n` +
          `<b>👤 Akun GitHub:</b> <code>${acc?.username}</code>\n\n` +
          `Klik tombol di bawah untuk melanjutkan:`,
          { parse_mode: 'HTML', ...keyboard }
        );
        return;
      }

      // Handle Waiting Clone URL
      if (userState === 'WAITING_CLONE_URL') {
        const cloneUrl = text;
        session.state = null;
        const acc = session.selected_account;

        if (!acc) {
          await ctx.reply('❌ Akun GitHub belum dipilih!');
          await this.promptInitialAccountSelection(ctx);
          return;
        }

        if (!validateGitHubUrl(cloneUrl)) {
          await ctx.reply('❌ URL GitHub tidak valid! Contoh: https://github.com/username/repo');
          return;
        }

        const repoName = cloneUrl.replace(/\.git$/, '').split('/').pop() || 'repo';

        await this.runWithLiveLog(ctx, `Git Clone / Pull (${repoName})`, (onLog) =>
          cloneOrPullWorkflow({
            account: acc,
            cloneUrl,
            targetBaseDir: this.baseDir,
          }, onLog)
        );

        return;
      }
    });
  }

  public stop(): void {
    if (this.bot && this.isRunning) {
      this.bot.stop();
      this.isRunning = false;
    }
  }
}
