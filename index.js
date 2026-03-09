import './polyfill';
import { configureReanimatedLogger } from 'react-native-reanimated';
import { registerRootComponent } from 'expo';

import App from './App';

configureReanimatedLogger({ strict: false });

registerRootComponent(App);
