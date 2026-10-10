import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import fs from 'fs';
import { 
  GitHubAccount, 
  VercelAccount,
  UserSessionData 
} from './types';
import { 
  loadGithubAccounts, 
  listRepos, 
  deleteRepo, 
  validateGitHubUrl 
} from './github';
import { 
  loadVercelAccounts,
  listVercelProjects,
  deleteVercelProject,
  deployFolderToVercel,
  deployZipToVercel
} from './vercel';
import { 
  deployFolderWorkflow, 
  deployZipWorkflow, 
  cloneOrPullWorkflow 
} from './git';
import { wsManager } from './websocket';

export class GitHubDeployerBot {
  public bot: Telegraf | null = null;
  public accounts: GitHubAccount[] = [];
  public vercelAccounts: VercelAccount[] = [];
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
    this.vercelAccounts = await loadVercelAccounts();

    if (!botToken) {
      console.warn('⚠️ TELEGRAM_BOT_TOKEN tidak ditemukan di .env. Bot berjalan dalam mode standby/test.');
      return false;
    }

    try {
      this.bot = new Telegraf(botToken);
      this.registerHandlers();
      this.bot.launch();
      this.isRunning = true;
      console.log(`🚀 Bot Telegram Berjalan! GitHub: ${this.accounts.length} akun, Vercel: ${this.vercelAccounts.length} akun.`);
      return true;
    } catch (err: any) {
      console.error(`❌ Gagal memulai bot Telegram: ${err.message}`);
      return false;
    }
  }

  public getGitHubKeyboard() {
    return Markup.keyboard([
      ['🚀 Auto Deploy Folder', '📦 Unzip & Deploy ZIP'],
      ['📥 Clone Repo ke VPS', '🗑 List & Hapus Repo'],
      ['ℹ️ Cek Status Bot', '🔄 Ganti Akun / Platform'],
    ]).resize();
  }

  public getVercelKeyboard() {
    return Markup.keyboard([
      ['▲ Deploy Folder ke Vercel', '📦 Unzip & Deploy ke Vercel'],
      ['🗑 List & Hapus Project Vercel', 'ℹ️ Cek Status Bot'],
      ['🔄 Ganti Akun / Platform'],
    ]).resize();
  }

  public getMainKeyboard(platform: 'github' | 'vercel' = 'github') {
    return platform === 'vercel' ? this.getVercelKeyboard() : this.getGitHubKeyboard();
  }

  /**
   * Prompts user to choose an account on /start or when changing accounts.
   * Supports both GitHub multi-accounts and Vercel multi-accounts.
   */
  public async promptInitialAccountSelection(ctx: any, isChanging: boolean = false) {
    const chatId = ctx.chat?.id || ctx.from?.id;
    this.accounts = await loadGithubAccounts();
    this.vercelAccounts = await loadVercelAccounts();

    const totalAccounts = this.accounts.length + this.vercelAccounts.length;

    if (totalAccounts === 0) {
      await ctx.reply(
        '<b>❌ Tidak ada token GitHub atau Vercel valid yang ditemukan!</b>\n\n' +
        'Silakan masukkan salah satu atau keduanya di file .env:\n' +
        '• <code>GH_TOKENS</code> (untuk GitHub)\n' +
        '• <code>VERCEL_TOKENS</code> (untuk Vercel)',
        { parse_mode: 'HTML', ...Markup.removeKeyboard() }
      );
      return;
    }

    const buttons: any[] = [];

    // GitHub account buttons
    for (let i = 0; i < this.accounts.length; i++) {
      const acc = this.accounts[i];
      buttons.push([Markup.button.callback(`🐙 GitHub: ${acc.name}`, `selectacc_gh_${i}`)]);
    }

    // Vercel account buttons
    for (let i = 0; i < this.vercelAccounts.length; i++) {
      const vacc = this.vercelAccounts[i];
      buttons.push([Markup.button.callback(`▲ Vercel: ${vacc.name}`, `selectacc_vc_${i}`)]);
    }

    const keyboard = Markup.inlineKeyboard(buttons);

    const header = isChanging
      ? '<b>🔄 Ganti Akun / Platform:</b>\n\nSilakan pilih akun atau platform yang ingin diaktifkan:'
      : '<b>🤖 Multi-Cloud Deployer (GitHub & Vercel)</b>\n\n' +
        `📁 Base Directory: <code>${this.baseDir}</code>\n` +
        `💬 Chat ID: <code>${chatId}</code>\n\n` +
        '⚠️ <b>Silakan pilih Akun (GitHub / Vercel) terlebih dahulu:</b>\n' +
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
        `<b>🚀 Deploy Folder ke GitHub (Akun: <code>${acc.username}</code>)</b>\n\n` +
        `Ketik nama folder atau <b>sub-path</b> di dalam <code>${this.baseDir}</code>:\n` +
        `• Contoh: <code>testing</code> atau <code>folder/baru/myproject</code>`,
        { parse_mode: 'HTML' }
      );
    } else if (action === 'unzip_zip') {
      session.state = null;
      await ctx.reply(
        `<b>📦 Upload File ZIP ke GitHub (Akun: <code>${acc.username}</code>)</b>\n\n` +
        `Silakan kirimkan file <b>.zip</b> ke chat ini.`,
        { parse_mode: 'HTML' }
      );
    } else if (action === 'clone_repo') {
      session.state = 'WAITING_CLONE_URL';
      await ctx.reply(
        `<b>📥 Clone Repo ke VPS (Akun: <code>${acc.username}</code>)</b>\n\n` +
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

  public async sendVercelProjectsList(ctx: any) {
    const chatId = ctx.chat.id;
    const session = this.getSession(chatId);
    const vacc = session.selected_vercel_account;

    if (!vacc) {
      await this.promptInitialAccountSelection(ctx);
      return;
    }

    try {
      await ctx.reply('⏳ Mengambil daftar project dari Vercel...');
      const projects = await listVercelProjects(vacc);

      if (projects.length === 0) {
        await ctx.reply(`Belum ada project di akun Vercel <code>${vacc.username}</code>.`, { parse_mode: 'HTML' });
        return;
      }

      const buttons = projects.slice(0, 30).map((p) => {
        const row = [];
        if (p.url) {
          row.push(Markup.button.url(`▲ ${p.name}`, p.url));
        } else {
          row.push(Markup.button.callback(`▲ ${p.name}`, `info_vc_${p.name}`));
        }
        row.push(Markup.button.callback('❌ Hapus', `askdelete_vc_${p.name}`));
        return row;
      });

      const keyboard = Markup.inlineKeyboard(buttons);
      const text =
        `<b>▲ Daftar Project Vercel (Akun: <code>${vacc.username}</code> - ${projects.length} project):</b>\n` +
        `<i>Klik nama project untuk membuka URL live, atau klik Hapus untuk menghapus.</i>`;

      if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } else {
        await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    } catch (err: any) {
      await ctx.reply(`❌ Gagal mengambil daftar project Vercel: ${err.message}`);
    }
  }

  /**
   * Helper to execute command with live progress message updates in Telegram (throttled at 1.2s)
   */
  public async runWithLiveLog(
    ctx: any,
    headerTitle: string,
    actionFn: (onLog: (line: string) => void) => Promise<{ success: boolean; logs: string[]; finalOutput: string; url?: string }>
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
          // ignore
        }
      }
    };

    let result: { success: boolean; logs: string[]; finalOutput: string; url?: string };
    try {
      result = await actionFn(onLog);
    } catch (err: any) {
      result = {
        success: false,
        logs,
        finalOutput: `Error: ${err.message}`,
      };
    }
    const finalLogs = logs.slice(-20).join('\n') || result.finalOutput;

    try {
      if (this.bot) {
        if (result.success) {
          const liveUrlNotice = result.url ? `\n\n🌐 <b>Live URL:</b> ${result.url}` : '';
          await this.bot.telegram.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            undefined,
            `<b>✅ ${headerTitle} SUKSES!</b>\n\n<code>${finalLogs}</code>${liveUrlNotice}`,
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

    // Command /start: WAJIB pilih akun dulu (GitHub atau Vercel)
    this.bot.command('start', async (ctx) => {
      this.userSessions.delete(ctx.chat.id);
      await this.promptInitialAccountSelection(ctx, false);
    });

    // ----------------- GITHUB HANDLERS -----------------
    this.bot.hears('🚀 Auto Deploy Folder', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_account || session.active_platform !== 'github') {
        await ctx.reply('⚠️ Silakan pilih akun GitHub terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }
      await this.executeNextStep(ctx, 'deploy_folder');
    });

    this.bot.hears('📦 Unzip & Deploy ZIP', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_account || session.active_platform !== 'github') {
        await ctx.reply('⚠️ Silakan pilih akun GitHub terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }
      await this.executeNextStep(ctx, 'unzip_zip');
    });

    this.bot.hears('📥 Clone Repo ke VPS', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_account || session.active_platform !== 'github') {
        await ctx.reply('⚠️ Silakan pilih akun GitHub terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }
      await this.executeNextStep(ctx, 'clone_repo');
    });

    this.bot.hears('🗑 List & Hapus Repo', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_account || session.active_platform !== 'github') {
        await ctx.reply('⚠️ Silakan pilih akun GitHub terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }
      await this.executeNextStep(ctx, 'list_repo');
    });

    // ----------------- VERCEL HANDLERS -----------------
    this.bot.hears('▲ Deploy Folder ke Vercel', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_vercel_account || session.active_platform !== 'vercel') {
        await ctx.reply('⚠️ Silakan pilih akun Vercel terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }

      session.state = 'WAITING_VERCEL_FOLDER_NAME';
      await ctx.reply(
        `<b>▲ Deploy Folder ke Vercel (Akun: <code>${session.selected_vercel_account.username}</code>)</b>\n\n` +
        `Ketik nama folder di dalam <code>${this.baseDir}</code> yang ingin di-deploy ke Vercel:\n` +
        `• Contoh: <code>sample-app</code> atau <code>my-nextjs-app</code>`,
        { parse_mode: 'HTML' }
      );
    });

    this.bot.hears('📦 Unzip & Deploy ke Vercel', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_vercel_account || session.active_platform !== 'vercel') {
        await ctx.reply('⚠️ Silakan pilih akun Vercel terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }

      session.state = null;
      await ctx.reply(
        `<b>📦 Upload File ZIP ke Vercel (Akun: <code>${session.selected_vercel_account.username}</code>)</b>\n\n` +
        `Silakan kirimkan file <b>.zip</b> ke chat ini untuk langsung di-deploy ke Vercel!`,
        { parse_mode: 'HTML' }
      );
    });

    this.bot.hears('🗑 List & Hapus Project Vercel', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      if (!session.selected_vercel_account || session.active_platform !== 'vercel') {
        await ctx.reply('⚠️ Silakan pilih akun Vercel terlebih dahulu!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }
      await this.sendVercelProjectsList(ctx);
    });

    // ----------------- SHARED / SWITCH HANDLERS -----------------
    this.bot.hears('🔄 Ganti Akun / Platform', async (ctx) => {
      await this.promptInitialAccountSelection(ctx, true);
    });

    this.bot.hears('ℹ️ Cek Status Bot', async (ctx) => {
      const session = this.getSession(ctx.chat.id);
      const ghAccs = this.accounts.length > 0
        ? this.accounts.map((a) => a.username).join(', ')
        : 'Tidak ada token GitHub';
      const vcAccs = this.vercelAccounts.length > 0
        ? this.vercelAccounts.map((a) => a.username).join(', ')
        : 'Tidak ada token Vercel';

      let activeInfo = '<i>Belum dipilih (Ketik /start)</i>';
      if (session.active_platform === 'github' && session.selected_account) {
        activeInfo = `🐙 GitHub: <code>${session.selected_account.username}</code> (${session.selected_account.email})`;
      } else if (session.active_platform === 'vercel' && session.selected_vercel_account) {
        activeInfo = `▲ Vercel: <code>${session.selected_vercel_account.username}</code> (${session.selected_vercel_account.email})`;
      }

      await ctx.reply(
        `<b>✅ Status Bot:</b> Online\n` +
        `<b>⚡ Platform Aktif:</b> ${session.active_platform ? session.active_platform.toUpperCase() : 'None'}\n` +
        `<b>👤 Akun Aktif:</b> ${activeInfo}\n\n` +
        `<b>🐙 GitHub (${this.accounts.length} akun):</b> ${ghAccs}\n` +
        `<b>▲ Vercel (${this.vercelAccounts.length} akun):</b> ${vcAccs}\n\n` +
        `<b>📁 Base Directory:</b> <code>${this.baseDir}</code>\n` +
        `<b>📡 WS Subscribers:</b> <code>${wsManager.getSubscribersCount()}</code>\n` +
        `<b>🆔 Your Chat ID:</b> <code>${ctx.chat.id}</code>`,
        { parse_mode: 'HTML' }
      );
    });

    // ----------------- CALLBACK QUERIES -----------------
    this.bot.on('callback_query', async (ctx) => {
      const data = (ctx.callbackQuery as any).data;
      const chatId = ctx.chat!.id;
      const session = this.getSession(chatId);

      await ctx.answerCbQuery();

      // Pilih Akun GitHub
      if (data.startsWith('selectacc_gh_')) {
        const idx = parseInt(data.replace('selectacc_gh_', ''), 10);
        if (idx < this.accounts.length) {
          const acc = this.accounts[idx];
          session.active_platform = 'github';
          session.selected_account = acc;

          await ctx.reply(
            `<b>✅ Akun GitHub Aktif:</b> <code>${acc.username}</code> (${acc.email})\n\n` +
            `🚀 <b>Fitur GitHub telah dibuka!</b> Silakan pilih menu di bawah:`,
            { parse_mode: 'HTML', ...this.getGitHubKeyboard() }
          );
        }
        return;
      }

      // Pilih Akun Vercel
      if (data.startsWith('selectacc_vc_')) {
        const idx = parseInt(data.replace('selectacc_vc_', ''), 10);
        if (idx < this.vercelAccounts.length) {
          const vacc = this.vercelAccounts[idx];
          session.active_platform = 'vercel';
          session.selected_vercel_account = vacc;

          await ctx.reply(
            `<b>✅ Akun Vercel Aktif:</b> <code>${vacc.username}</code> (${vacc.email})\n\n` +
            `▲ <b>Fitur Vercel telah dibuka!</b> Silakan pilih menu di bawah:`,
            { parse_mode: 'HTML', ...this.getVercelKeyboard() }
          );
        }
        return;
      }

      // Legacy fallback
      if (data.startsWith('selectacc_init_')) {
        const idx = parseInt(data.replace('selectacc_init_', ''), 10);
        if (idx < this.accounts.length) {
          session.active_platform = 'github';
          session.selected_account = this.accounts[idx];
          await ctx.reply(
            `<b>✅ Akun GitHub Aktif:</b> <code>${session.selected_account.username}</code>\n\n` +
            `🚀 <b>Fitur bot telah dibuka!</b>`,
            { parse_mode: 'HTML', ...this.getGitHubKeyboard() }
          );
        }
        return;
      }

      // Vercel Delete prompt
      if (data.startsWith('askdelete_vc_')) {
        const projectName = data.replace('askdelete_vc_', '');
        const confirmKeyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Ya, Hapus Project!', `confirmdelete_vc_${projectName}`),
            Markup.button.callback('❌ Batal', 'cancel_delete_vc'),
          ],
        ]);

        await ctx.editMessageText(
          `⚠️ Hapus permanent project Vercel <b>${projectName}</b>?`,
          { parse_mode: 'HTML', ...confirmKeyboard }
        );
        return;
      }

      // Vercel Delete Confirm
      if (data.startsWith('confirmdelete_vc_')) {
        const projectName = data.replace('confirmdelete_vc_', '');
        const vacc = session.selected_vercel_account;
        if (!vacc) return;

        try {
          const success = await deleteVercelProject(vacc, projectName);
          await ctx.editMessageText(
            success
              ? `✅ Project Vercel <b>${projectName}</b> berhasil dihapus!`
              : `❌ Gagal menghapus project Vercel <b>${projectName}</b>`,
            { parse_mode: 'HTML' }
          );
        } catch (err: any) {
          await ctx.editMessageText(`❌ Gagal Hapus: ${err.message}`, { parse_mode: 'HTML' });
        }
        return;
      }

      if (data === 'cancel_delete_vc') {
        await this.sendVercelProjectsList(ctx);
        return;
      }

      // GitHub confirm deploy
      if (data === 'confirm_deploy') {
        const fullPath = session.target_path;
        const repoName = session.repo_name;
        const acc = session.selected_account;

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
        session.state = null;
        return;
      }

      // GitHub ask delete
      if (data.startsWith('askdelete_')) {
        const repoName = data.replace('askdelete_', '');
        const acc = session.selected_account;
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
        return;
      }

      // GitHub confirm delete
      if (data.startsWith('confirmdelete_')) {
        const repoName = data.replace('confirmdelete_', '');
        const acc = session.selected_account;
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
        return;
      }

      if (data === 'cancel_delete') {
        await this.sendRepoList(ctx);
        return;
      }
    });

    // ----------------- DOCUMENT ZIP HANDLER -----------------
    this.bot.on('document', async (ctx) => {
      const doc = ctx.message.document;
      const fileName = doc.file_name || '';

      if (!fileName.toLowerCase().endsWith('.zip')) {
        await ctx.reply('❌ File harus berformat .zip!');
        return;
      }

      const chatId = ctx.chat.id;
      const session = this.getSession(chatId);

      // Pastikan ada akun yang aktif
      if (!session.selected_account && !session.selected_vercel_account) {
        await ctx.reply('⚠️ Silakan pilih akun terlebih dahulu sebelum upload ZIP!');
        await this.promptInitialAccountSelection(ctx);
        return;
      }

      const isVercel = session.active_platform === 'vercel';
      const defaultName = path.basename(fileName, path.extname(fileName));
      const tempZipPath = path.join(this.baseDir, `temp_${doc.file_id}.zip`);

      await ctx.reply('⏳ Mengunduh file ZIP ke server...', { parse_mode: 'HTML' });

      try {
        const fileLink = await ctx.telegram.getFileLink(doc.file_id);
        const res = await fetch(fileLink.href);
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(tempZipPath, Buffer.from(buffer));

        session.temp_zip_path = tempZipPath;
        session.temp_zip_name = fileName;

        if (isVercel) {
          session.state = 'WAITING_VERCEL_ZIP_PROJECT_NAME';
          await ctx.reply(
            `<b>▲ File ZIP Diterima untuk Vercel! (Akun: <code>${session.selected_vercel_account?.username}</code>)</b>\n\n` +
            `Ketik <b>nama project Vercel</b> yang ingin dibuat:\n` +
            `• Rekomendasi nama: <code>${defaultName}</code>`,
            { parse_mode: 'HTML' }
          );
        } else {
          session.state = 'WAITING_ZIP_REPO_NAME';
          await ctx.reply(
            `<b>🐙 File ZIP Diterima untuk GitHub! (Akun: <code>${session.selected_account?.username}</code>)</b>\n\n` +
            `Ketik <b>nama repository baru</b> yang ingin dibuat di GitHub:\n` +
            `• Rekomendasi nama: <code>${defaultName}</code>`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (err: any) {
        await ctx.reply(`❌ Gagal mengunduh file ZIP: ${err.message}`);
      }
    });

    // ----------------- TEXT MESSAGES HANDLER -----------------
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text.trim();
      const chatId = ctx.chat.id;
      const session = this.getSession(chatId);
      const userState = session.state;

      // Vercel Waiting Folder Name
      if (userState === 'WAITING_VERCEL_FOLDER_NAME') {
        const vacc = session.selected_vercel_account;
        if (!vacc) {
          await ctx.reply('❌ Akun Vercel belum dipilih!');
          return;
        }

        const inputPath = text.replace(/^\/+|\/+$/g, '');
        const fullPath = path.normalize(path.join(this.baseDir, inputPath));

        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
          await ctx.reply(`❌ Folder <code>${fullPath}</code> tidak ditemukan!`, { parse_mode: 'HTML' });
          return;
        }

        const projectName = path.basename(fullPath);
        session.state = null;

        await this.runWithLiveLog(ctx, `Deploy Vercel (${projectName})`, async (onLog) => {
          const res = await deployFolderToVercel(vacc, fullPath, projectName, onLog);
          return {
            success: res.success,
            logs: res.logs,
            finalOutput: `Deployed to ${res.url}`,
            url: res.url,
          };
        });

        return;
      }

      // Vercel Waiting ZIP Project Name
      if (userState === 'WAITING_VERCEL_ZIP_PROJECT_NAME') {
        const vacc = session.selected_vercel_account;
        const zipPath = session.temp_zip_path;

        if (!zipPath || !fs.existsSync(zipPath) || !vacc) {
          await ctx.reply('❌ Sesi kadaluarsa. Silakan ulangi upload ZIP.');
          session.state = null;
          return;
        }

        const projectName = text.replace(/\s+/g, '-').replace(/\//g, '-');
        session.state = null;

        await this.runWithLiveLog(ctx, `Deploy ZIP ke Vercel (${projectName})`, async (onLog) => {
          const res = await deployZipToVercel(vacc, zipPath, projectName, this.baseDir, onLog);
          return {
            success: res.success,
            logs: res.logs,
            finalOutput: `Deployed to ${res.url}`,
            url: res.url,
          };
        });

        try { fs.unlinkSync(zipPath); } catch {}
        session.temp_zip_path = undefined;
        return;
      }

      // GitHub Waiting ZIP Repo Name
      if (userState === 'WAITING_ZIP_REPO_NAME') {
        const zipPath = session.temp_zip_path;
        const acc = session.selected_account;

        if (!zipPath || !fs.existsSync(zipPath) || !acc) {
          await ctx.reply('❌ Sesi habis atau akun tidak valid. Silakan ulangi upload ZIP.');
          session.state = null;
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
        session.temp_zip_path = undefined;
        return;
      }

      // GitHub Waiting Folder Name
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

      // GitHub Waiting Clone URL
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
