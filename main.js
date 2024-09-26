import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import axios from 'axios';
import EPub from 'epub';

const dir = "epubs";
if (!existsSync(dir)) {
	mkdirSync(dir);
}

const bot = new Telegraf(process.env.TG_BOT_TOKEN);

// bot.use(Telegraf.log());

bot.command('start', ctx => {
    console.log(ctx)
});

bot.on('message', async ctx => {
    const type = ctx.message.document?.mime_type;
    if (type === undefined) {
        ctx.reply('Send file');
        return;
    }
    if (type !== 'application/epub+zip') {
        ctx.reply(`I don't want your ${type}`);
        return;
    }
    if (ctx.message.document?.file_size >= 10e6) {
        ctx.reply('Too big');
        return;
    }

    const fileId = ctx.message?.document.file_id;
    const file = await ctx.telegram.getFileLink(fileId);
    const fileResponse = await axios.get(file.href, { responseType: 'arraybuffer' });
    // const fileData = Buffer.from(fileResponse.data, 'binary');
    const filePath = `./${dir}/${fileId}`;
    await writeFile(filePath, fileResponse.data);

    const epub = new EPub(filePath);
    epub.on('end', () => {
        // ctx.reply(Object.keys(epub.metadata));
        ctx.reply(JSON.stringify(epub.metadata));
        unlink(filePath);
    });
    epub.parse();
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
  