import type { LevelSettings, Melody } from "../types.ts";

/** Generate one melody for the given level settings.
 *  `rand` returns floats in [0, 1); it is the ONLY source of randomness (never Math.random),
 *  so the same rand sequence must always give the same melody.
 *  Throws an Error if no valid melody is found in 1000 attempts. */
export function generateMelody(settings: LevelSettings, rand: () => number): Melody {
  const CHORD_DEGREES = [0, 2, 4, 7];
  
  for (let attempt = 0; attempt < 1000; attempt++) {
    // Step 1: Rhythm
    const bars: number[][] = [];
    let totalNotes = 0;
    for (let bar = 0; bar < 3; bar++) {
      const pattern = settings.rhythms[Math.floor(rand() * settings.rhythms.length)];
      bars.push(pattern);
      totalNotes += pattern.length;
    }
    
    // Step 2: Start
    const startOptions = [0, 2, 4].filter(d => settings.allowed.includes(d));
    if (startOptions.length === 0) throw new Error("No valid starting degrees");
    const firstDegree = startOptions[Math.floor(rand() * startOptions.length)];
    
    // Step 3: Walk
    const walk: number[] = [firstDegree];
    let prevPrev: number | undefined = undefined;
    let prev = firstDegree;
    
    for (let i = 1; i < totalNotes; i++) {
      const candidates: number[] = [];
      const weights: number[] = [];
      
      for (const d of settings.allowed) {
        if (d === prev) continue;
        if (Math.abs(d - prev) > settings.maxLeap) continue;
        if (settings.chord && !CHORD_DEGREES.includes(d)) continue;
        
        let weight = 1;
        
        // Prefer larger leaps
        if (settings.prefer !== undefined && Math.abs(d - prev) >= settings.prefer) {
          weight *= 3;
        }
        
        // Step bonus
        if (Math.abs(d - prev) === 1) {
          weight *= 1.5;
        }
        
        // Discourage going straight back
        if (prevPrev !== undefined && d === prevPrev) {
          weight *= 0.4;
        }
        
        candidates.push(d);
        weights.push(weight);
      }
      
      if (candidates.length === 0) {
        break; // Failed attempt
      }
      
      // Weighted random selection
      let totalWeight = 0;
      for (const w of weights) totalWeight += w;
      let choice = rand() * totalWeight;
      let selected = 0;
      for (let j = 0; j < candidates.length; j++) {
        choice -= weights[j];
        if (choice <= 0) {
          selected = j;
          break;
        }
      }
      
      const nextDegree = candidates[selected];
      walk.push(nextDegree);
      prevPrev = prev;
      prev = nextDegree;
    }
    
    if (walk.length !== totalNotes) continue; // Failed to complete walk
    
    // Step 4: Final note
    const last = walk[walk.length - 1];
    let final = 0;
    if (settings.allowed.includes(7) && Math.abs(last - 7) < Math.abs(last - 0)) {
      final = 7;
    }
    
    if (final === last || Math.abs(final - last) > settings.maxLeap) {
      continue; // Failed attempt
    }
    
    // Step 5: Variety
    const distinct = new Set(walk).size;
    const minRequired = Math.min(settings.allowed.length, 3);
    if (distinct < minRequired) continue; // Failed attempt
    
    // Step 6: Result
    const degrees = [...walk, final];
    const rhythm = bars.flat().concat([4]);
    
    return { degrees, rhythm };
  }
  
  throw new Error("No valid melody found in 1000 attempts");
}
