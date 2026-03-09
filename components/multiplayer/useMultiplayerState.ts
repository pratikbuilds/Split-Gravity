import { useEffect, useState } from 'react';
import type { MultiplayerMatchController, MultiplayerViewState } from '../../services/multiplayer/matchController';

/**
 * Hook that subscribes to the match controller and returns the current state.
 * Uses explicit setState with the full state object to guarantee React re-renders
 * when the controller emits (e.g. room:created, room:state).
 */
export function useMultiplayerState(controller: MultiplayerMatchController): MultiplayerViewState {
  const [state, setState] = useState<MultiplayerViewState>(() => ({ ...controller.getState() }));

  useEffect(() => {
    const sync = () => {
      setState({ ...controller.getState() });
    };

    sync();
    return controller.subscribe(sync);
  }, [controller]);

  return state;
}
