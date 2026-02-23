import { Markup } from 'telegraf';

export const MENU_CALLBACKS = Object.freeze({
  CAPTIONS: 'menu:captions',
  AUTO_EDIT: 'menu:auto_edit',
  MAGIC_CLIPS: 'menu:magic_clips',
  AVATAR: 'menu:avatar',
  COMBINE: 'menu:combine',
  HELP: 'menu:help'
});

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Captions (Soon)', MENU_CALLBACKS.CAPTIONS),
      Markup.button.callback('Auto Edit (Soon)', MENU_CALLBACKS.AUTO_EDIT)
    ],
    [
      Markup.button.callback('Magic Clips', MENU_CALLBACKS.MAGIC_CLIPS),
      Markup.button.callback('Avatar (Soon)', MENU_CALLBACKS.AVATAR)
    ],
    [
      Markup.button.callback('Combine (Soon)', MENU_CALLBACKS.COMBINE),
      Markup.button.callback('Help', MENU_CALLBACKS.HELP)
    ]
  ]);
}
