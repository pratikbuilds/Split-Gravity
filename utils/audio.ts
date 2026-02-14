import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import type { AVPlaybackSource } from 'expo-av';
import type { GameAudioEvent } from '../types/game';

export type SoundKey = 'flip' | 'countdownTick' | 'gameOver' | 'land' | 'nearMiss';

export type LoadedSounds = Record<SoundKey, Audio.Sound>;

const SOUND_SOURCES: Record<SoundKey, AVPlaybackSource> = {
  flip: require('../assets/audio/sfx/sfx_jump.ogg'),
  countdownTick: require('../assets/audio/sfx/sfx_select.ogg'),
  gameOver: require('../assets/audio/sfx/game_over_stinger.wav'),
  land: require('../assets/audio/sfx/land_thud.wav'),
  nearMiss: require('../assets/audio/sfx/near_miss_swoosh.wav'),
};

export async function configureAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  });
}

export async function loadSounds() {
  const keys = Object.keys(SOUND_SOURCES) as SoundKey[];
  const loaded = {} as LoadedSounds;
  for (const key of keys) {
    const { sound } = await Audio.Sound.createAsync(SOUND_SOURCES[key], {
      shouldPlay: false,
      volume: 1,
      isLooping: false,
    });
    loaded[key] = sound;
  }
  return loaded;
}

export async function unloadSounds(sounds: Partial<LoadedSounds>) {
  const soundList = Object.values(sounds).filter(Boolean);
  await Promise.all(soundList.map((sound) => sound.unloadAsync()));
}

export async function playSound(sounds: Partial<LoadedSounds>, key: SoundKey, isMuted: boolean) {
  if (isMuted) return;
  const sound = sounds[key];
  if (!sound) return;
  await sound.replayAsync();
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
