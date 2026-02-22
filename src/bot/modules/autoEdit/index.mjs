import { MENU_CALLBACKS } from '../../ui/buttons.mjs';
import { autoEditUx } from './ux.mjs';

export function register(bot, _deps) {
  bot.action(MENU_CALLBACKS.AUTO_EDIT, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(autoEditUx.comingSoon);
  });
}
