# World content — importable Foundry items

Version-controlled Foundry documents the bridge expects to find in the GM's world,
shipped as plain importable JSON (the module ships no compendium pack, so there is no
build step). Import each once into the matching sidebar directory; the bridge resolves
them by **slug**, so their world UUIDs never need to be pasted anywhere.

## courageous-anthem-aura.json — Effect: Courageous Anthem (CNMH Aura)

The Tier-1 native-resolution pilot for [#455](https://github.com/) (Courageous Anthem
should buff every ally in the 60-foot emanation, not just the caster).

**What it does.** When the app applies this effect to the caster (Izzy pressing
*Courageous Anthem*), its `Aura` rule element emits the **stock** `Spell Effect:
Courageous Anthem` (`Compendium.pf2e.spell-effects.Item.beReeFroAx24hj83`) to the caster
and all allies within 60 feet. PF2e's aura engine owns membership — allies entering or
leaving the emanation gain/lose the +1 automatically — and the aura source expires at the
start of the caster's next turn, matching the spell's 1-round duration.

**Install.** Items directory → *Import_ a single Item, or drag the JSON onto the sidebar.
No UUID wiring: the spell's `foundryEffect.ref` is `slug:courageous-anthem-aura`, and the
bridge looks the effect up by that slug in the World Items directory.

**Verify.** After importing, cast Courageous Anthem from the app with the bridge connected;
allied tokens within 60 ft should gain *Spell Effect: Courageous Anthem* in Foundry, and
the CNMH effects panel should show the buff (via the `cnmh_foundryeffects_*` read-back).
