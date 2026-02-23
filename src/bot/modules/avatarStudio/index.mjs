import { MENU_CALLBACKS } from '../../ui/buttons.mjs';
import { avatarStudioUx } from './ux.mjs';

export function register(bot, _deps) {
  bot.action(MENU_CALLBACKS.AVATAR, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(avatarStudioUx.comingSoon);
  });
}
