import { MENU_CALLBACKS } from '../../ui/buttons.mjs';
import { combineVideosUx } from './ux.mjs';

export function register(bot, _deps) {
  bot.action(MENU_CALLBACKS.COMBINE_VIDEOS, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(combineVideosUx.comingSoon);
  });
}
