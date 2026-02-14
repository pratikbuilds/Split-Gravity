// Typed as number[] so the same require() results work with both RN Image and Skia useImage (DataSourceParam).
export const GAME_BACKGROUNDS: number[] = [
  require('../assets/game/backgrounds/kenney/background_clouds.png'),
  require('../assets/game/backgrounds/kenney/background_color_desert.png'),
  require('../assets/game/backgrounds/kenney/background_color_hills.png'),
  require('../assets/game/backgrounds/kenney/background_color_mushrooms.png'),
  require('../assets/game/backgrounds/kenney/background_color_trees.png'),
  require('../assets/game/backgrounds/kenney/background_fade_desert.png'),
  require('../assets/game/backgrounds/kenney/background_fade_hills.png'),
  require('../assets/game/backgrounds/kenney/background_fade_mushrooms.png'),
  require('../assets/game/backgrounds/kenney/background_fade_trees.png'),
];

export const getRandomBackgroundIndex = (previousIndex?: number) => {
  const total = GAME_BACKGROUNDS.length;
  if (total <= 1) return 0;

  let nextIndex = Math.floor(Math.random() * total);
  if (typeof previousIndex === 'number') {
    while (nextIndex === previousIndex) {
      nextIndex = Math.floor(Math.random() * total);
    }
  }

  return nextIndex;
};
