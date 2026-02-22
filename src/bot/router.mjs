import { register as registerAutoEdit } from './modules/autoEdit/index.mjs';
import { register as registerAvatarStudio } from './modules/avatarStudio/index.mjs';
import { register as registerCaptions } from './modules/captions/index.mjs';
import { register as registerCombineVideos } from './modules/combineVideos/index.mjs';
import {
  isMagicClipsFlowActive,
  register as registerMagicClips,
  resetMagicClipsFlow
} from './modules/magicClips/index.mjs';
import { magicClipsUx } from './modules/magicClips/ux.mjs';
import { MENU_CALLBACKS } from './ui/buttons.mjs';
import { messages } from './ui/messages.mjs';
import { sendStartMenu } from './ui/startMenu.mjs';

export function registerRouter(bot, deps) {
  bot.start(async (ctx) => {
    await sendStartMenu(ctx);
  });

  bot.command('cancel', async (ctx) => {
    const session = ctx.state?.session || {};
    if (isMagicClipsFlowActive(session)) {
      resetMagicClipsFlow(session);
      await ctx.reply(magicClipsUx.cancelled);
      return;
    }

    await ctx.reply(magicClipsUx.noActiveFlowToCancel);
  });

  bot.action(MENU_CALLBACKS.HELP, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(messages.help);
  });

  registerMagicClips(bot, deps);
  registerCaptions(bot, deps);
  registerAutoEdit(bot, deps);
  registerAvatarStudio(bot, deps);
  registerCombineVideos(bot, deps);
}
