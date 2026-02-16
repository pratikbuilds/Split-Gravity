import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
} from 'expo-audio';
import type { GameAudioEvent } from '../types/game';
import countdownTickSfx from '../assets/audio/sfx/sfx_select.ogg';
import flipSfx from '../assets/audio/sfx/sfx_jump.ogg';
import gameOverSfx from '../assets/audio/sfx/game_over_stinger.wav';
import landSfx from '../assets/audio/sfx/land_thud.wav';
import nearMissSfx from '../assets/audio/sfx/near_miss_swoosh.wav';

export type SoundKey = 'flip' | 'countdownTick' | 'gameOver' | 'land' | 'nearMiss';

export type LoadedSounds = Record<SoundKey, AudioPlayer>;

const SOUND_SOURCES: Record<SoundKey, AudioSource> = {
  flip: flipSfx,
  countdownTick: countdownTickSfx,
  gameOver: gameOverSfx,
  land: landSfx,
  nearMiss: nearMissSfx,
};

export async function configureAudioMode() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    interruptionMode: 'mixWithOthers',
  });
}

export async function loadSounds() {
  const keys = Object.keys(SOUND_SOURCES) as SoundKey[];
  const loaded = {} as LoadedSounds;
  for (const key of keys) {
    const player = createAudioPlayer(SOUND_SOURCES[key]);
    player.loop = false;
    player.volume = 1;
    loaded[key] = player;
  }
  return loaded;
}

export async function unloadSounds(sounds: Partial<LoadedSounds>) {
  const playerList = Object.values(sounds).filter(Boolean);
  for (const player of playerList) {
    player.release();
  }
}

export async function playSound(sounds: Partial<LoadedSounds>, key: SoundKey, isMuted: boolean) {
  if (isMuted) return;
  const player = sounds[key];
  if (!player) return;
  player.seekTo(0);
  player.play();
}

export function mapGameEventToSound(event: GameAudioEvent): SoundKey {
  switch (event) {
    case 'flip':
      return 'flip';
    case 'countdown_tick':
      return 'countdownTick';
    case 'game_over':
      return 'gameOver';
    case 'land':
      return 'land';
    case 'near_miss':
      return 'nearMiss';
    default:
      return 'flip';
  }
}
