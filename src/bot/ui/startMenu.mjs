import { mainMenuKeyboard } from './buttons.mjs';
import { messages } from './messages.mjs';

export async function sendStartMenu(ctx) {
  await ctx.reply(messages.startTitle, mainMenuKeyboard());
}
