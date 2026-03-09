import { Buffer } from 'buffer';
import { install } from 'react-native-quick-crypto';

install();

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
