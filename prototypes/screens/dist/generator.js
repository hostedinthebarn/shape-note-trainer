                                                                

/** Generate one exercise for the given level settings.
 *  `rand` returns floats in [0, 1); it is the ONLY source of randomness (never Math.random),
 *  so the same rand sequence must always give the same exercise.
 *  Throws an Error if no valid exercise is found in 1000 attempts. */
export function generateExercise(settings               , rand              )           {
  const CHORD = [0, 2, 4, 7];
  
  for (let attempt = 0; attempt < 1000; attempt++) {
    // Step 1: Rhythm
    const rhythmPatterns = [];
    let totalNotes = 0;
    for (let bar = 0; bar < 3; bar++) {
      const pattern = settings.rhythms[Math.floor(rand() * settings.rhythms.length)];
      rhythmPatterns.push(pattern);
      totalNotes += pattern.length;
    }
    
    // Step 2: Start
    const startOptions = [0, 2, 4].filter(d => settings.allowed.includes(d));
    if (startOptions.length === 0) throw new Error("No valid starting degree");
    const firstDegree = startOptions[Math.floor(rand() * startOptions.length)];
    
    // Step 3: Walk
    const walk = [firstDegree];
    let current = firstDegree;
    let previous = undefined;
    
    for (let i = 1; i < totalNotes; i++) {
      let candidates = settings.allowed.filter(d => d !== current);
      
      if (settings.chord) {
        candidates = candidates.filter(d => CHORD.includes(d));
      }
      
      candidates = candidates.filter(d => Math.abs(d - current) <= settings.maxLeap);
      
      if (candidates.length === 0) {
        break;
      }
      
      // Calculate weights
      let totalWeight = 0;
      const weightedCandidates                                       = [];
      
      for (const candidate of candidates) {
        let weight = 1;
        
        if (settings.prefer !== undefined && Math.abs(candidate - current) >= settings.prefer) {
          weight *= 3;
        }
        
        if (Math.abs(candidate - current) === 1) {
          weight *= 1.5;
        }
        
        if (previous !== undefined && candidate === previous) {
          weight *= 0.4;
        }
        
        weightedCandidates.push({ degree: candidate, weight });
        totalWeight += weight;
      }
      
      // Choose with probability proportional to weights
      let choice = rand() * totalWeight;
      let chosenDegree = weightedCandidates[0].degree;
      
      for (const { degree, weight } of weightedCandidates) {
        choice -= weight;
        if (choice <= 0) {
          chosenDegree = degree;
          break;
        }
      }
      
      walk.push(chosenDegree);
      previous = current;
      current = chosenDegree;
    }
    
    if (walk.length !== totalNotes) continue;
    
    // Step 4: Final note
    const last = walk[walk.length - 1];
    let final = settings.allowed.includes(7) && Math.abs(last - 7) < Math.abs(last - 0) ? 7 : 0;
    
    if (final === last || Math.abs(final - last) > settings.maxLeap) continue;
    
    // Step 5: Variety
    const distinct = new Set(walk).size;
    const need = Math.min(settings.allowed.length, 3);
    if (distinct < need) continue;
    
    // Step 6: Result
    const degrees = [...walk, final];
    const rhythm = rhythmPatterns.flat().concat([4]);
    
    return { degrees, rhythm };
  }
  
  throw new Error("No valid exercise found in 1000 attempts");
}
