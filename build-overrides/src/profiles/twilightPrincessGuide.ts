export interface TwilightMissableGuideEntry {
  tip?: string;
  cutoff: string;
  retry?: string;
  specific: boolean;
}

export const TWILIGHT_PRINCESS_MISSABLE_GUIDE_URL =
  'https://github.com/RetroAchievements/guides/wiki/The-Legend-of-Zelda:-Twilight-Princess-(Gamecube)';

type GuideSeed = Omit<TwilightMissableGuideEntry, 'specific'>;

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function guide(tip: string, cutoff: string, retry?: string): GuideSeed {
  return { tip, cutoff, retry };
}

// Curated, paraphrased guidance from the RetroAchievements Twilight Princess
// GameCube missables guide. RetroAchievements' live `type: missable` flag stays
// authoritative because the achievement set can change independently of the guide.
const GUIDE: Record<string, GuideSeed> = {
  'buzz off': guide(
    'After rescuing Talo and the monkey, talk to Hanch while he is throwing rocks at the hive, then move away so the sting scene can play.',
    'Lost after the early Ordon/Faron story advances into Twilight, or if the hive is knocked down first.',
    'Use an earlier save if the hive or story state has already advanced.',
  ),
  'smiling politely': guide(
    'Break the four pumpkins near Jaggle until he reacts.',
    'Lost once Jaggle moves away from his opening-game position.',
  ),
  'link is the goat': guide(
    'Stop both escaping goats: one after each of the two early goat-herding sections when speaking with Mayor Bo.',
    'Lost if either relevant Mayor Bo conversation is skipped and the story advances.',
    'If you miss the goat itself, talk to Mayor Bo again before advancing to retry.',
  ),
  'doing anything for money': guide(
    "Climb onto Rusl's roof from the raised platform/sign and collect the yellow Rupee.",
    'Picking up the Gale Boomerang is the point of no return.',
  ),
  "i'm just winging it": guide(
    "During the early Faron visit, lure the Bokoblin beside Trill's shop into Trill's area, trigger the reaction, then defeat it.",
    'The enemies in this version of the area do not respawn; leaving this early story visit without doing it loses the opportunity.',
  ),
  'you herd me': guide(
    'Finish the goat-herding minigame in under one minute.',
    'Treat the goat-herding Heart Piece reward as the safe cutoff; do the speed clear before permanently exhausting the reward opportunity.',
    'The minigame can be retried before the reward/state is exhausted.',
  ),
  'what happened here': guide(
    'As Wolf Link in Twilight Hyrule Castle, use Senses and interact with all five ghosts during the same session.',
    'Lost when you leave the early Twilight Hyrule Castle sequence; the later revisit no longer has these spirits.',
  ),
  'spank the monkey': guide(
    'Defeat Ook without damage while limiting his boomerang throws to the achievement requirement.',
    'Defeating Ook ends this one-time Forest Temple miniboss fight.',
    'Save before the fight so a failed condition can be reloaded.',
  ),
  "don't spit at dinner time": guide(
    'Aim for a fast Diababa kill; use the Gale Boomerang with Ook\'s bombs and keep Diababa from successfully spitting poison.',
    'Defeating Diababa ends this one-time Forest Temple boss fight.',
    'Save before the boss and reload if the challenge condition fails.',
  ),
  'no one could tame that horse': guide(
    'Complete the Epona calming QTE without being thrown off after Eldin is freed from Twilight.',
    'The Epona recovery sequence is one-time only.',
    'Make a save before returning to Kakariko so the sequence can be reloaded.',
  ),
  "ordon't worry": guide(
    'Return to Ordon and reassure Sera, Jaggle, Uli, Fado, Pergie and Hanch after the children are safe in Kakariko.',
    'The guide places the cutoff at your first entry into Lanayru Province.',
  ),
  "this does not bo'd well": guide(
    'Win the second sumo match against Mayor Bo without being grabbed.',
    'Once the second Mayor Bo match is won, he cannot be fought again.',
    'If grabbed, deliberately lose/leave the match and retry before winning it.',
  ),
  'this fight is boaring': guide(
    'Stay close to King Bulblin during the Eldin chase and finish the chase within 60 seconds.',
    'The chase is a one-time story sequence; finishing it advances directly toward the Bridge of Eldin fight.',
    'Save before entering Kakariko for a clean retry point.',
  ),
  'a bridge too far': guide(
    'Beat King Bulblin on the Bridge of Eldin in only two passes without being knocked off.',
    'The Bridge of Eldin duel is a one-time story fight.',
    'Reload the pre-Kakariko/pre-chase save if the condition fails.',
  ),
  'just roll with it': guide(
    'Toss all seven rolling Gorons on the Death Mountain ascent.',
    'Reaching the Goron Mines entrance closes this opportunity.',
    'Before the cutoff, return toward Kakariko and re-enter the Death Mountain path to retry.',
  ),
  'you want sumo this': guide(
    'Beat Gor Coron in sumo without being grabbed; equip the Iron Boots before starting.',
    'Winning the required Gor Coron match advances the one-time story event.',
    'If grabbed, lose the match and retry before winning.',
  ),
  'armored goron guard': guide(
    'Beat Dangoro without damage and with no more than the allowed grabs; throw him into lava each cycle.',
    'Defeating Dangoro ends this one-time Goron Mines miniboss fight.',
    'Save before the fight and reload after a failed attempt.',
  ),
  "you can't fyrus": guide(
    'Beat Fyrus without damage while staying within the arrow limit; wait for the forehead gem to present a safe shot.',
    'Defeating Fyrus ends the one-time Goron Mines boss fight.',
    'Save before the boss and reload if hit or if the arrow condition is broken.',
  ),
  'weight duel': guide(
    'Enter the Fyrus fight with Iron Boots equipped, never remove them, and take no damage.',
    'Defeating Fyrus ends the one-time Goron Mines boss fight.',
    'Save before the boss and reload if the condition is broken.',
  ),
  'call me halo': guide(
    'During Talo/Malo bow practice after Goron Mines, reach the long-distance pole shot and land it on the first shot without Hawkeye.',
    'Passing/completing the bow minigame without earning it closes the opportunity.',
    'If the final shot misses, exit the trial before passing it and climb back to Talo to retry.',
  ),
  'water under the bridge': guide(
    'During the Great Bridge of Hylia encounter, use the bow to stop King Bulblin before he reaches the north side.',
    'The bridge encounter is part of the one-time wagon escort sequence.',
    'Save before starting the escort mission for a reliable retry point.',
  ),
  'jump on the bandwagon': guide(
    'During the Zora-prince escort, get the wagon to Kakariko without it catching fire; move ahead and remove the dangerous archers/birds quickly.',
    'Completing the one-time escort sequence ends the opportunity.',
    'Reload a save from before the escort if the wagon catches fire.',
  ),
  'adrenaline': guide(
    'Defeat Deku Toad without damage and without bombs; control the small Toadpoli first, then punish the boss after its jump.',
    'Defeating Deku Toad ends this one-time Lakebed Temple miniboss fight.',
    'Save before the fight and reload after a failed condition.',
  ),
  'my heart will go on': guide(
    'At Hena\'s Fishing Hole, collect the Piece of Heart while Hena is in the boat with you.',
    'Collecting that Piece of Heart without Hena permanently removes the required setup.',
  ),
  "on geno's side": guide(
    "Kill 100 Skull Kid puppets without leaving the Sacred Grove; farming them during a chase is the safe method.",
    'You have the first and second Skull Kid chases; finishing the second visit closes the reliable opportunity.',
    'Save on entering the Sacred Grove, earn this, then reload if you also want the timed chase achievement cleanly.',
  ),
  "you've suffered a terrible fate haven't you": guide(
    'Complete the first Skull Kid chase in under 3 minutes 40 seconds; use the moving lights and music to identify the route.',
    'Finishing the first Skull Kid chase advances past this timed challenge.',
    'Save before starting the chase and reload if over time.',
  ),
  'statue of limitations': guide(
    'Solve the Sacred Grove statue puzzle in exactly 12 moves: Right, Down, Up, Up, Up, Left, Left, Down, Down, Down, Right, Up.',
    'Solving the puzzle advances past the one-time challenge.',
    'Reload the pre-puzzle save if extra moves are made.',
  ),
  'hostile takeover': guide(
    'Use the discounted Malo Mart donation route by helping with the bridge/Goron side quest instead of simply paying the expensive totals.',
    'Overpaying the donation stages and completing the shop funding without the discount can permanently miss the condition.',
  ),
  'the greatest adventurer of the 9th century': guide(
    'Get the Bulblin Fortress boar-pen key without raising an alert; enter carefully, scout towers and use ranged attacks from cover.',
    'Obtaining the key after triggering an alert fails the one-time fortress condition.',
    'Save before entering the fortress proper and reload if detected.',
  ),
  "it's not easy being green": guide(
    'Defeat King Bulblin in the Bulblin Fortress without damage and without Magic Armor.',
    'Defeating him ends this one-time fortress fight.',
    'Reload a pre-fight save if hit or if the armor condition is broken.',
  ),
  'in the shadows of the abyss': guide(
    'Defeat Death Sword without damage or Magic Armor and stay within the arrow limit; use the bow for the ranged requirement.',
    'Defeating Death Sword ends this one-time Arbiter\'s Grounds miniboss fight.',
    'Save before the fight and reload after a failed condition.',
  ),
  'what a bonehead': guide(
    'Defeat Stallord without damage or Magic Armor and do not use the sword in phase two; bomb arrows work after spinner hits.',
    'Defeating Stallord ends the one-time Arbiter\'s Grounds boss fight.',
    'Save before the boss and reload if the challenge condition fails.',
  ),
  'knights duel': guide(
    'Defeat Darkhammer without damage, Magic Armor or Clawshot; dodge the ball throw and punish the opening.',
    'Defeating Darkhammer ends this one-time Snowpeak Ruins miniboss fight.',
    'Save before the fight and reload after a failed condition.',
  ),
  'playing on the ice': guide(
    'Defeat Blizzeta without damage or Magic Armor and use the Ball and Chain no more than 13 times.',
    'Defeating Blizzeta ends the one-time Snowpeak Ruins boss fight.',
    'Save before the boss; any wasted Ball and Chain hit is a good reason to reload.',
  ),
  "you hadn't forgotten about me": guide(
    'Complete the second Skull Kid chase in under 3 minutes 50 seconds.',
    'Finishing the second Skull Kid chase advances past this timed challenge.',
    'Save before the chase and reload if over time.',
  ),
  'duel of the titans': guide(
    'Enter the Darknut fight with Iron Boots equipped, keep them on through the unlock, take no damage and do not use Magic Armor.',
    'Defeating the Temple of Time Darknut ends this one-time miniboss fight.',
    'Keep the boots equipped until the achievement actually pops; reload a pre-fight save after failure.',
  ),
  'a crushing defeat': guide(
    'Defeat Armogohma without damage, Magic Armor or sword use; rely on the dungeon mechanics and ranged tools.',
    'Defeating Armogohma ends the one-time Temple of Time boss fight.',
    'Save before the boss and reload if the challenge condition fails.',
  ),
  'spider puree': guide(
    'After Armogohma drops, crush the exposed eye with a statue rather than killing the eye spider another way.',
    'Killing the eye spider by another method ends the opportunity.',
    'Reload the boss save if the eye is killed incorrectly.',
  ),
  "you're pretty good": guide(
    'Clear the Hidden Village Bulblins without being seen; scout first and use a saved entrance state for clean attempts.',
    'Clearing the Hidden Village combat event after being detected advances past the stealth challenge.',
    'Save at the entrance and reload immediately on detection.',
  ),
  "you're grounded": guide(
    'Defeat the City in the Sky Aeralfos without damage or Magic Armor; Clawshot it when its shield creates the opening.',
    'Defeating the Aeralfos ends this one-time miniboss fight.',
    'Save before the fight and reload if hit.',
  ),
  'dragon barbecue': guide(
    'Defeat Argorok without damage or Magic Armor; watch the claws in phase one and the fire sweep in phase two.',
    'Defeating Argorok ends the one-time City in the Sky boss fight.',
    'Save before the boss and reload if hit.',
  ),
  'the deadly challenge': guide(
    'Defeat either Phantom Zant without damage or Magic Armor using only Mortal Draw; the second encounter is generally the cleaner opportunity.',
    'Both Phantom Zant encounters are one-time fights; after the second is cleared there is no remaining opportunity.',
    'Save before a Phantom Zant encounter and reload after failure.',
  ),
  "it's like taking candy from a child": guide(
    'Defeat every phase of Zant without damage and without Magic Armor.',
    'Defeating Zant ends the one-time Palace of Twilight boss sequence.',
    'Save immediately before the boss and reload if any phase invalidates the run.',
  ),
  'he always did have an inflated opinion of himself': guide(
    "For Zant's final form, keep Iron Boots equipped and deal damage only with Mortal Draw.",
    'Defeating Zant ends the one-time boss sequence.',
    'Save before Zant and reload if another attack damages the final form.',
  ),
  'if only link could learn that trick': guide(
    'Defeat the Hyrule Castle King Bulblin encounter using only Iron Boots, without damage or Magic Armor.',
    'Defeating King Bulblin in Hyrule Castle ends this final one-time Bulblin fight.',
    'Save before the encounter and reload if the condition fails.',
  ),
  "shot through the heart and you're to blame": guide(
    'Complete Goron Mines while your maximum health is still 3 hearts and you possess no more than one bottle.',
    'For this challenge run, increasing max health beyond 3 hearts or owning a second bottle before completion makes the save ineligible.',
    'Use a dedicated 3-heart/1-bottle save if your normal playthrough already exceeds the limits.',
  ),
  "your cheatin' heart will tell on you": guide(
    'Complete Lakebed Temple with only 3 hearts and no more than one bottle.',
    'Increasing max health beyond 3 hearts or owning a second bottle before completion makes the run ineligible.',
    'A dedicated challenge-run save is safest.',
  ),
  'owner of a lonely heart': guide(
    "Complete Arbiter's Grounds with only 3 hearts, no Magic Armor and no more than one bottle.",
    'Exceeding the heart/bottle limits or obtaining Magic Armor before completion makes this challenge-run state ineligible.',
    'Use a dedicated challenge-run save.',
  ),
  "you're playin' with the queen of hearts": guide(
    'Complete Snowpeak Ruins with only 3 hearts, no Magic Armor and no more than one bottle.',
    'Exceeding the heart/bottle limits or obtaining Magic Armor before completion makes this challenge-run state ineligible.',
    'Use a dedicated challenge-run save.',
  ),
  'heartbreaker dream maker love taker': guide(
    'Complete the Temple of Time with only 3 hearts, no Magic Armor and no more than one bottle.',
    'Exceeding the heart/bottle limits or obtaining Magic Armor before completion makes this challenge-run state ineligible.',
    'Use a dedicated challenge-run save.',
  ),
  'kickstart my heart': guide(
    'Complete the City in the Sky with only 3 hearts, no Magic Armor and no more than one bottle.',
    'Exceeding the heart/bottle limits or obtaining Magic Armor before completion makes this challenge-run state ineligible.',
    'Use a dedicated challenge-run save.',
  ),
  'total eclipse of my heart': guide(
    'Complete the Palace of Twilight with only 3 hearts, no Magic Armor and no more than one bottle.',
    'Exceeding the heart/bottle limits or obtaining Magic Armor before completion makes this challenge-run state ineligible.',
    'Use a dedicated challenge-run save.',
  ),
  'cave of despair': guide(
    'Clear floor 50 of the Cave of Ordeals with 3 hearts and exactly the allowed one-bottle inventory limit.',
    'Increasing max health beyond 3 hearts or owning additional bottles before the clear makes the challenge-run state ineligible.',
    'Use a dedicated challenge-run save.',
  ),
  'heart of gold': guide(
    'Complete Hyrule Castle with only 3 hearts, no Magic Armor and no more than one bottle.',
    'Exceeding the heart/bottle limits or obtaining Magic Armor before completion makes this challenge-run state ineligible.',
    'Use a dedicated challenge-run save.',
  ),
};

const TITLE_ALIASES: Record<string, string> = {
  // Keep compatibility with punctuation/title tweaks in the live RA set.
  'heartbreaker dream maker love taker 25': 'heartbreaker dream maker love taker',
};

function achievementTitle(achievement: any) {
  return normalize(achievement?.Title ?? achievement?.title ?? '');
}

function achievementDescription(achievement: any) {
  return normalize(achievement?.Description ?? achievement?.description ?? '');
}

function achievementType(achievement: any) {
  return normalize(achievement?.type ?? achievement?.Type ?? '');
}

export function getTwilightMissableGuide(achievement: any): TwilightMissableGuideEntry | null {
  const title = achievementTitle(achievement);
  const canonicalTitle = TITLE_ALIASES[title] || title;

  // The historical guide had two achievements with the same display title. Use
  // description context to distinguish the Morpheel escape gag from the no-hit boss.
  if (canonicalTitle === "where do you think you're going") {
    const description = achievementDescription(achievement);
    if (/return to the top|top of the room|try to return|swim/.test(description)) {
      return {
        ...guide(
          'During phase one of Morpheel, try to swim back toward the top/exit until Midna stops you.',
          'Defeating Morpheel ends the only boss encounter where this interaction can trigger.',
          'Reload the pre-boss save if Morpheel is already defeated.',
        ),
        specific: true,
      };
    }
    return {
      ...guide(
        'Defeat Morpheel without taking damage; stay clear of the tentacles in phase one and above its mouth in phase two.',
        'Defeating Morpheel ends the one-time Lakebed Temple boss fight.',
        'Save before the boss and reload if hit.',
      ),
      specific: true,
    };
  }

  const exact = GUIDE[canonicalTitle];
  if (exact) return { ...exact, specific: true };

  // The guide predates some live-set revisions. Newer achievements still get a
  // visible safety warning while their specific cutoff is being curated.
  if (achievementType(achievement) === 'missable') {
    return {
      cutoff: 'RetroAchievements currently marks this achievement as missable. Treat its related one-time story event, minigame or boss fight as the safe point of no return.',
      retry: 'If the event is repeatable, retry before completing it; otherwise keep/reload a save from before the event.',
      specific: false,
    };
  }

  return null;
}
