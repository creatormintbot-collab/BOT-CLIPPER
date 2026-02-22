import { MENU_CALLBACKS } from '../../ui/buttons.mjs';
import { captionsUx } from './ux.mjs';

export function register(bot, _deps) {
  bot.action(MENU_CALLBACKS.CAPTIONS, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(captionsUx.comingSoon);
  });
}
