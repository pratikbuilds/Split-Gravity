import type { ImageSourcePropType } from 'react-native';

export const GAME_BACKGROUNDS: ImageSourcePropType[] = [
  require('../assets/game/backgrounds/Blue.png'),
  require('../assets/game/backgrounds/Brown.png'),
  require('../assets/game/backgrounds/Gray.png'),
  require('../assets/game/backgrounds/Green.png'),
  require('../assets/game/backgrounds/Pink.png'),
  require('../assets/game/backgrounds/Purple.png'),
  require('../assets/game/backgrounds/Yellow.png'),
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
