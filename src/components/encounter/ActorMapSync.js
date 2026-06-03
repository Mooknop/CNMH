import { useActorMapAutoMatch } from '../../hooks/useActorMapAutoMatch';

// Null-rendering: keeps cnmh_actormap_global populated by name-matching Foundry
// combatants to CNMH characters, for ANY connected client. Mounted once at app
// root so Foundry-started encounters resolve without the GM opening /gm.
const ActorMapSync = () => {
  useActorMapAutoMatch();
  return null;
};

export default ActorMapSync;
