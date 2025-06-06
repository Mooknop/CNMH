// src/components/spells/Harrowing.js
import React, { useState } from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import ActionIcon from '../shared/ActionIcon';
import './Harrowing.css';

/**
 * Component to display Harrowing mechanics and ritual information
 * @param {Object} props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Theme color from character
 */
const Harrowing = ({ character, themeColor }) => {
  // Check if character has Harrow Casting feat
  const hasHarrowCasting = character.feats && character.feats.some(
    feat => feat.name === "Harrow Casting"
  );
  
  // Harrow suits and their meanings
  const harrowSuits = [
    { name: "Hammers", ability: "Strikes", description: "Force and direct action" },
    { name: "Keys", ability: "Reflex Saves", description: "Cunning and adaptability" },
    { name: "Shields", ability: "Fortitude Saves", description: "Protection and endurance" },
    { name: "Books", ability: "Skill Checks", description: "Knowledge and learning" },
    { name: "Stars", ability: "Will Saves", description: "Fate and cosmic forces" },
    { name: "Crowns", ability: "Other", description: "Leadership and dominion" }
  ];
  
  return (
    <div className="harrowing">
      <div className="harrowing-header">
        <h3 style={{ color: themeColor }}>Harrowing</h3>
        <div className="deck-info">
              <h5 style={{ color: themeColor }}>About Harrow Decks</h5>
              <p>
                Used by gamblers and seers alike, this deck of cards comes in several varieties. Simple harrow decks are made from low-quality paper and typically have only an icon and a number to signify the suit and alignment. These simple decks are mostly used for games of chance, as the actual image and significance of the cards are irrelevant for such games. Common harrow decks are made from higher-quality paper and feature illustrations—harrow readers typically use these decks. Fine harrow decks are made from a variety of materials, such as high-quality paper, woods, bone, ivory, or metal.
              </p>
        </div>
      </div>

      {/* Harrow Deck Reference */}
      <div className="harrow-deck-reference">
        <CollapsibleCard 
          className="reference-card"
          header={
            <h4 style={{ color: themeColor }}>Harrow Suits</h4>
          }
          themeColor={themeColor}
          initialExpanded={false}
        >
          <div className="deck-reference-content">
            <div className="suits-section">
              <div className="suits-grid">
                {harrowSuits.map((suit, index) => (
                  <div key={index} className="suit-card">
                    <h6 className="suit-name">{suit.name}</h6>
                    <div className="suit-details">
                      <span className="suit-ability">Omen: {suit.ability}</span>
                      <span className="suit-description">{suit.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleCard>
      </div>   

      {/* Tell Fortune */}
      <div className="harrow-deck-reference">
        <CollapsibleCard 
          className="reference-card"
          header={<>
            <h4 style={{ color: themeColor }}>Tell Fortune</h4>
            <div className="feat-actions">
              <ActionIcon actionText="One Action" color={themeColor} />
            </div>
          </>}
          themeColor={themeColor}
          initialExpanded={false}
        >
          <div className="deck-reference-content">
            <p className="harrowing-description">
                Whether through harrow cards, palm-reading, star-reading or some other method of divining the future, you are able to predict the futures of other people surprisingly well. You can spend 1 hour telling someone else's fortune. Attempt a Fortune-Telling Lore check against a hard DC of a target creature’s level, producing the effects of augury on a success with regards to the creature’s future. Regardless of the result, the creature is then immune to your Tell Fortune for 1 week.
            </p>
            <div className="suits-section">
              <h5 style={{ color: themeColor }}>Augury</h5>
              <div className="suits-grid">
                <div className="suit-card">
                  <h6 className="suit-name">You gain a vague glimpse of the future.</h6>
                  <div className="suit-details">
                    <span className="suit-ability">During the casting of this spell, ask about the results of a particular course of action. The spell can predict results up to 30 minutes into the future and reveal the GM's best guess among the following outcomes: good, bad, mixed (the results will be a mix of good and bad), and nothing (there won't be particularly good or bad results).</span>
                    <span className="suit-description">The GM rolls a secret DC 6 flat check. On a failure, the result is always “nothing.” This makes it impossible to tell whether a “nothing” result is accurate. If anyone asks about the same topic as the first casting of augury during an additional casting, the GM uses the secret roll result from the first casting. If circumstances change, though, it's possible to get a different result.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleCard>
      </div>    
      
      {/* Harrowing Ritual Information */}
      <div className="harrowing-ritual">
        <CollapsibleCard 
          className="ritual-card"
          header={
            <>
              <h4 style={{ color: themeColor }}>Harrowing Ritual</h4>
              <div className="ritual-meta">
                <TraitTag trait="Divination" />
                <TraitTag trait="Fortune" />
                <span className="ritual-rank">Rank 3</span>
              </div>
            </>
          }
          themeColor={themeColor}
          initialExpanded={false}
        >
          <div className="ritual-details">
            <div className="ritual-stats">
              <div className="ritual-stat">
                <span className="stat-label">Cast:</span>
                <span className="stat-value">1 hour (material, somatic, verbal)</span>
              </div>
              <div className="ritual-stat">
                <span className="stat-label">Cost:</span>
                <span className="stat-value">rare inks worth 20 gp</span>
              </div>
              <div className="ritual-stat">
                <span className="stat-label">Primary Check:</span>
                <span className="stat-value">Occultism (expert)</span>
              </div>
              <div className="ritual-stat">
                <span className="stat-label">Range:</span>
                <span className="stat-value">touch</span>
              </div>
              <div className="ritual-stat">
                <span className="stat-label">Targets:</span>
                <span className="stat-value">1 willing creature</span>
              </div>
            </div>
            
            <div className="ritual-description">
              <p>
                The typical harrow reading does not magically manipulate fate, but when you perform a harrowing ritual to infuse a reading with occult power, you can impart real magical benefits to the target of the reading that give them agency and control over a task or goal in their immediate future. The first 50 minutes of this ritual's casting are spent preparing the target creature for the reading by meditating, concentrating on the task or goal to be focused on, and allowing you to paint or ink occult symbols from the harrow onto the target's body to link them to the upcoming reading. The final 10 minutes of the ritual comprise the reading itself, during which the symbols placed on the target fade away while infusing their fate.
              </p>
            </div>
            
            <div className="ritual-usage">
              <h5 style={{ color: themeColor }}>Usage</h5>
              <p>
                The target of harrowing must describe a set of events or course of action they intend to attempt in the near future— something like "hunting down a specific wanted criminal" or "traveling to Varisia to investigate the Storval Stairs."
              </p>
            </div>
          </div>
        </CollapsibleCard>
      </div>
      
      {/* Harrow Casting Feat (if character has it) */}
      {hasHarrowCasting && (
        <div className="harrow-casting-feat">
          <CollapsibleCard 
            className="feat-card"
            header={
              <>
                <h4 style={{ color: themeColor }}>Harrow Casting</h4>
                <div className="feat-meta">
                  <div className="feat-actions">
                    <ActionIcon actionText="One Action" color={themeColor} />
                  </div>
                  <TraitTag trait="Uncommon" />
                  <TraitTag trait="Archetype" />
                  <TraitTag trait="Metamagic" />
                  <span className="feat-level">Level 4</span>
                </div>
              </>
            }
            themeColor={themeColor}
            initialExpanded={false}
          >
            <div className="feat-details">
              
              
              <div className="feat-requirements">
                <span className="requirements-label" style={{ color: themeColor }}>Requirements:</span>
                <span className="requirements-text">
                  You have an active harrow omen.
                </span>
              </div>
              
              <div className="feat-description">
                <p>
                  You draw a card from your harrow deck just before you cast a spell to infuse your magic with its destined potential. If your next action is to Cast a Spell, the suit of the card you draw enhances the spell in one of the following ways. If the card you draw matches the suit of your active harrow omen, the effect is enhanced further as detailed below. When you Harrow Cast, attempt a DC 11 flat check. If you fail this check, you lose your active harrow omen at the end of your turn.
                </p>
              </div>
              
              <div className="suit-benefits">
                <h5 style={{ color: themeColor }}>Suit Effects</h5>
                <div className="benefits-grid">
                  <div className="suit-benefit">
                    <span className="suit-name">Hammer:</span>
                    <span className="suit-effect">
                      The force of the spell is enhanced. This effect only enhances single-target offensive spells that require you to make a successful spell attack or require a saving throw from the target to resist. If you hit the target, or if they fail their saving throw, the spell inflicts additional force damage equal to the spell's level. This additional damage doubles if your harrow omen is Hammers.
                    </span>
                  </div>
                  <div className="suit-benefit">
                    <span className="suit-name">Key:</span>
                    <span className="suit-effect">
                      Some of the magic remains behind, infusing your defenses. Until the start of your next turn, you gain a +1 status bonus to your AC and all saving throws. If your harrow omen is Keys, this increases to a +2 status bonus.
                    </span>
                  </div>
                  <div className="suit-benefit">
                    <span className="suit-name">Shield:</span>
                    <span className="suit-effect">
                      As the spell's magic takes effect, it heals you as well, restoring Hit Points equal to 2d6 + the spell's level. If your harrow omen is Shields, the Hit Points restored increases to 4d6 + twice the spell's level.
                    </span>
                  </div>
                  <div className="suit-benefit">
                    <span className="suit-name">Book:</span>
                    <span className="suit-effect">
                      The spell's magic infuses your mind with sudden insights about the target. You can attempt to Recall Knowledge about the target as a free action, using your spell attack roll to make the check. You gain a +2 status bonus to this roll if Books is your harrow omen.
                    </span>
                  </div>
                  <div className="suit-benefit">
                    <span className="suit-name">Star:</span>
                    <span className="suit-effect">
                      The spell's magic bolsters those it aids. This effect only enhances single-target spells cast on willing subjects. The magic restores Hit Points to the affected target equal to 2d6 + the spell's level. If your harrow omen is Stars, the magic also grants the target a +2 status bonus to all saving throws until the start of your next turn.
                    </span>
                  </div>
                  <div className="suit-benefit">
                    <span className="suit-name">Crown:</span>
                    <span className="suit-effect">
                      The spell's magic is hidden and subtle, and observers may not realize you're doing anything more than manipulating cards in your harrow deck. Attempt a Fortune-Telling Lore check against all observer's Perception DCs. If your check is successful against an observer's Perception DC, that observer doesn't notice you are Casting a Spell, even though normally spells have sensory manifestations. This hides only the spell's spellcasting actions and manifestations, not its effects. If your harrow omen is Crowns, you gain a +2 status bonus to your Fortune-Telling Lore check.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleCard>
        </div>
      )}
      
      
    </div>
  );
};

export default Harrowing;