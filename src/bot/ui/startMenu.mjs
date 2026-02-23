import { mainMenuKeyboard } from './buttons.mjs';

export async function sendStartMenu(ctx) {
  await ctx.reply('Create a new project\nChoose a tool:', mainMenuKeyboard());
}
