import { Markup } from 'telegraf';

export const MENU_CALLBACKS = Object.freeze({
  CAPTIONS: 'menu:captions',
  AUTO_EDIT: 'menu:auto_edit',
  MAGIC_CLIPS: 'menu:magic_clips',
  AVATAR_STUDIO: 'menu:avatar_studio',
  COMBINE_VIDEOS: 'menu:combine_videos',
  HELP: 'menu:help'
});

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Generate Captions (Coming soon)', MENU_CALLBACKS.CAPTIONS),
      Markup.button.callback('AI Auto Edit (Coming soon)', MENU_CALLBACKS.AUTO_EDIT)
    ],
    [
      Markup.button.callback('Magic Clips (YouTube → Clips)', MENU_CALLBACKS.MAGIC_CLIPS),
      Markup.button.callback('AI Avatar Studio (Coming soon)', MENU_CALLBACKS.AVATAR_STUDIO)
    ],
    [
      Markup.button.callback('Combine Videos (Coming soon)', MENU_CALLBACKS.COMBINE_VIDEOS),
      Markup.button.callback('Help', MENU_CALLBACKS.HELP)
    ]
  ]);
}
